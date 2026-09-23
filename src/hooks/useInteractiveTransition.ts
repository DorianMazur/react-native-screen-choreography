import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import {
  animateOwnedProgress,
  setOwnedProgress,
} from '../core/ProgressOwnership';
import { ChoreographyContext } from '../core/ChoreographyContext';
import type { CommitBackNavigation } from '../core/navigationCommit';
import { debugLog } from '../debug/logger';
import { resolveSpringConfig } from '../core/constants';
import {
  resolveInteractiveTransitionOutcome,
  toInteractiveSessionProgress,
} from '../core/interactiveProgress';
import { useScreenId } from '../core/screenIdContext';
import type {
  InteractiveBackOptions,
  InteractiveTransitionDecisionOptions,
  InteractiveTransitionHandle,
  InteractiveTransitionSettleOptions,
} from '../types';

interface InteractiveTransitionNavigatorOptions {
  navigateBack: CommitBackNavigation;
  currentScreenId?: string;
  routeParams?: Record<string, unknown>;
}

export function useInteractiveTransitionNavigator({
  navigateBack,
  currentScreenId,
  routeParams,
}: InteractiveTransitionNavigatorOptions) {
  const choreography = useContext(ChoreographyContext);
  if (!choreography) {
    throw new Error(
      'useInteractiveTransition must be used within a <ChoreographyProvider>'
    );
  }

  const scopeScreenId = useScreenId();
  const screenId = currentScreenId ?? scopeScreenId;
  const {
    activeSession,
    progress,
    progressOwnership,
    navigationController,
    reverseController,
    commitReverseTransition,
    captureSourceGroup,
    startTransition,
    waitForOverlayReady,
    cancelTransition,
    completeTransition,
    setInteractiveScreen,
    getNavigationLineage,
    resolveScreenId,
  } = choreography;
  const sessionIdRef = useRef<string | null>(null);
  const beginTokenRef = useRef(0);
  const preparingRef = useRef(false);
  const cancelPreparationRef = useRef<(() => void) | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [gestureToken, setGestureToken] = useState(0);
  const { owner } = progressOwnership;

  useEffect(
    () => () => {
      cancelPreparationRef.current?.();
      beginTokenRef.current += 1;
      preparingRef.current = false;
      setInteractiveScreen(screenId, false);
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId && !reverseController.owns(sessionId)) {
        cancelTransition(sessionId);
      }
    },
    [cancelTransition, reverseController, screenId, setInteractiveScreen]
  );

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (sessionId && activeSession?.id !== sessionId) {
      sessionIdRef.current = null;
      setInteractiveScreen(screenId, false);
      setGestureToken(0);
      setIsActive(false);
    }
  }, [activeSession, screenId, setInteractiveScreen]);

  const gestureProgress = useDerivedValue(() => 1 - progress.value);

  const setProgress = useCallback(
    (value: number) => {
      'worklet';
      if (!gestureToken || owner.value !== gestureToken) return;
      progress.value = toInteractiveSessionProgress(value);
    },
    [gestureToken, owner, progress]
  );

  const cancelOnRN = useCallback(
    (token: number, sessionId: string) => {
      if (
        sessionIdRef.current !== sessionId ||
        !progressOwnership.isCurrent(token, sessionId)
      ) {
        return;
      }
      sessionIdRef.current = null;
      setGestureToken(0);
      setIsActive(false);
      cancelTransition(sessionId);
    },
    [cancelTransition, progressOwnership]
  );

  const animateSettlement = useCallback(
    (
      target: 0 | 1,
      options: InteractiveTransitionSettleOptions,
      expected?: { sessionId: string; token: number }
    ) => {
      const sessionId = sessionIdRef.current;
      if (
        !sessionId ||
        reverseController.owns(sessionId) ||
        (expected &&
          (sessionId !== expected.sessionId ||
            !progressOwnership.isCurrent(expected.token, expected.sessionId)))
      )
        return;
      const token = progressOwnership.claim(sessionId);
      if (token === null) return;
      setInteractiveScreen(screenId, false);
      if (target === 0) {
        // The provider retains the source and owns completion across route unmount.
        setGestureToken(0);
        setIsActive(false);
        commitReverseTransition({
          sessionId,
          token,
          navigateBack,
          options,
        }).catch((error: unknown) => {
          debugLog(`[Interactive] reverse commit failed: ${String(error)}`);
        });
        return;
      }
      const onComplete = cancelOnRN;
      animateOwnedProgress({
        ownership: progressOwnership,
        token,
        sessionId,
        progress,
        target,
        duration: options.duration,
        spring: {
          ...resolveSpringConfig(options.spring),
          ...(options.velocity === undefined
            ? {}
            : { velocity: -options.velocity }),
        },
        onComplete,
      });
    },
    [
      cancelOnRN,
      commitReverseTransition,
      navigateBack,
      progress,
      progressOwnership,
      reverseController,
      screenId,
      setInteractiveScreen,
    ]
  );

  const beginBack = useCallback(
    async (
      options: InteractiveBackOptions = {}
    ): Promise<InteractiveTransitionHandle | null> => {
      const { signal } = options;
      if (
        progressOwnership.reducedMotion ||
        signal?.aborted ||
        preparingRef.current ||
        sessionIdRef.current
      ) {
        return null;
      }

      if (progressOwnership.hasSession) {
        const opening = navigationController.getActiveSession();
        if (
          opening?.direction !== 'forward' ||
          opening.state !== 'active' ||
          opening.targetScreenId !== screenId
        )
          return null;
        const token = progressOwnership.claim(opening.id);
        if (token === null) return null;
        setOwnedProgress(progressOwnership, token, opening.id, progress, 1);
        completeTransition(opening.id);
      }

      const lineage = getNavigationLineage(screenId);
      const params = routeParams ?? {};
      const groupId =
        options.group ??
        lineage?.groupId ??
        (params._choreographyGroup as string | undefined);
      const targetScreenHint =
        options.targetScreenId ??
        lineage?.sourceScreenId ??
        (params._choreographySourceScreen as string | undefined);
      const targetScreenId =
        targetScreenHint && resolveScreenId
          ? resolveScreenId(targetScreenHint, lineage?.sourceScreenId)
          : targetScreenHint;

      if (!groupId || !targetScreenId) return null;
      if (!navigationController.acquireNavigationLock(screenId)) return null;
      const navigationToken = navigationController.getNavigationLockToken();
      preparingRef.current = true;
      setInteractiveScreen(screenId, true);
      const beginToken = ++beginTokenRef.current;
      progressOwnership.invalidate();
      const preparationVersion = progressOwnership.version;
      let preparationSessionId: string | null = null;
      let preparationOwner: number | null = null;
      let startedTransition = false;
      let returnedHandle = false;
      const isCurrent = () =>
        beginTokenRef.current === beginToken && !signal?.aborted;

      // startTransition publishes its measuring session synchronously, before
      // awaiting native readiness. Retain that identity even if it later rejects.
      const capturePreparingSession = () => {
        if (
          !startedTransition ||
          preparationSessionId ||
          beginTokenRef.current !== beginToken ||
          navigationController.getNavigationLockToken() !== navigationToken
        )
          return;
        const session = navigationController.getActiveSession();
        if (
          session?.sourceScreenId === screenId &&
          session.targetScreenId === targetScreenId &&
          session.groupId === groupId &&
          session.direction === 'backward'
        ) {
          preparationSessionId = session.id;
          preparationOwner = progressOwnership.version;
        }
      };
      const cancelPreparingSession = () => {
        const sessionId = preparationSessionId;
        if (
          !sessionId ||
          reverseController.owns(sessionId) ||
          !progressOwnership.isSession(sessionId) ||
          (preparationOwner !== null &&
            !progressOwnership.isCurrent(preparationOwner, sessionId))
        )
          return;
        if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
        cancelTransition(sessionId);
      };
      const releasePreparationLock = () => {
        if (
          !preparationSessionId ||
          !reverseController.owns(preparationSessionId)
        )
          navigationController.releaseNavigationLock(navigationToken);
      };
      const cancelPreparation = () => {
        if (beginTokenRef.current !== beginToken) return;
        capturePreparingSession();
        if (
          !preparationSessionId ||
          !reverseController.owns(preparationSessionId)
        )
          setInteractiveScreen(screenId, false);
        beginTokenRef.current += 1;
        preparingRef.current = false;
        cancelPreparingSession();
        releasePreparationLock();
      };
      cancelPreparationRef.current = cancelPreparation;
      signal?.addEventListener('abort', cancelPreparation, { once: true });

      try {
        await captureSourceGroup(groupId, screenId);
        if (!isCurrent() || progressOwnership.version !== preparationVersion)
          return null;
        startedTransition = true;
        const pendingSession = startTransition({
          groupId,
          sourceScreenId: screenId,
          targetScreenId,
          direction: 'backward',
        });
        capturePreparingSession();
        const session = await pendingSession;
        if (!session) return null;
        if (!preparationSessionId) {
          preparationSessionId = session.id;
          preparationOwner = progressOwnership.isSession(session.id)
            ? progressOwnership.version
            : null;
        }
        if (!isCurrent()) return null;

        const token = progressOwnership.claim(session.id);
        if (token === null) return null;
        preparationOwner = token;
        sessionIdRef.current = session.id;
        const overlayReady = await waitForOverlayReady(session.id);
        if (
          !isCurrent() ||
          !overlayReady ||
          !progressOwnership.isCurrent(token, session.id) ||
          sessionIdRef.current !== session.id
        )
          return null;

        const sessionId = session.id;
        setOwnedProgress(progressOwnership, token, sessionId, progress, 1);
        setGestureToken(token);
        setIsActive(true);
        returnedHandle = true;
        return {
          id: sessionId,
          progress: gestureProgress,
          setProgress: (value: number) => {
            'worklet';
            if (owner.value !== token) return;
            progress.value = toInteractiveSessionProgress(value);
          },
          finish: (settlement = {}) =>
            animateSettlement(0, settlement, { sessionId, token }),
          cancel: (settlement = {}) =>
            animateSettlement(1, settlement, { sessionId, token }),
        };
      } catch (error) {
        capturePreparingSession();
        if (!isCurrent()) return null;
        throw error;
      } finally {
        signal?.removeEventListener('abort', cancelPreparation);
        if (cancelPreparationRef.current === cancelPreparation)
          cancelPreparationRef.current = null;
        if (!returnedHandle) {
          cancelPreparingSession();
          if (beginTokenRef.current === beginToken && !sessionIdRef.current)
            setInteractiveScreen(screenId, false);
          releasePreparationLock();
        }
        if (beginTokenRef.current === beginToken) preparingRef.current = false;
      }
    },
    [
      animateSettlement,
      cancelTransition,
      completeTransition,
      setInteractiveScreen,
      getNavigationLineage,
      navigationController,
      gestureProgress,
      owner,
      captureSourceGroup,
      progress,
      progressOwnership,
      reverseController,
      routeParams,
      resolveScreenId,
      screenId,
      startTransition,
      waitForOverlayReady,
    ]
  );

  const finish = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) =>
      animateSettlement(0, options),
    [animateSettlement]
  );

  const cancel = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) => {
      cancelPreparationRef.current?.();
      beginTokenRef.current += 1;
      preparingRef.current = false;
      setInteractiveScreen(screenId, false);
      animateSettlement(1, options);
    },
    [animateSettlement, screenId, setInteractiveScreen]
  );

  const settle = useCallback(
    (options: InteractiveTransitionDecisionOptions = {}) => {
      const outcome = resolveInteractiveTransitionOutcome({
        progress: gestureProgress.value,
        velocity: options.velocity,
        threshold: options.threshold,
        velocityImpact: options.velocityImpact,
      });

      if (outcome === 'finish') {
        finish(options);
      } else {
        cancel(options);
      }
    },
    [cancel, finish, gestureProgress]
  );

  return {
    beginBack,
    setProgress,
    finish,
    cancel,
    settle,
    progress: gestureProgress,
    isActive,
  };
}
