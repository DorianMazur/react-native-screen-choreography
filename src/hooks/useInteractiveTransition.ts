import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import {
  animateOwnedProgress,
  setOwnedProgress,
} from '../core/ProgressOwnership';
import { ChoreographyContext } from '../core/ChoreographyContext';
import type { CommitBackNavigation } from '../core/navigationCommit';
import { debugLog } from '../debug/logger';
import { FAST_SPRING } from '../core/constants';
import {
  resolveInteractiveTransitionOutcome,
  toInteractiveSessionProgress,
} from '../core/interactiveProgress';
import { useScreenId } from '../core/screenIdContext';
import type {
  InteractiveBackOptions,
  InteractiveTransitionDecisionOptions,
  InteractiveTransitionSession,
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
    preMeasureGroup,
    startTransition,
    waitForOverlayReady,
    cancelTransition,
    getNavigationLineage,
    resolveScreenId,
  } = choreography;
  const sessionIdRef = useRef<string | null>(null);
  const beginTokenRef = useRef(0);
  const preparingRef = useRef(false);
  const settlementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [gestureToken, setGestureToken] = useState(0);
  const { owner } = progressOwnership;

  const clearSettlementTimer = useCallback(() => {
    if (settlementTimerRef.current !== null) {
      clearTimeout(settlementTimerRef.current);
      settlementTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearSettlementTimer();
      beginTokenRef.current += 1;
      preparingRef.current = false;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId && !reverseController.owns(sessionId)) {
        cancelTransition(sessionId);
      }
    },
    [cancelTransition, clearSettlementTimer, reverseController]
  );

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (sessionId && activeSession?.id !== sessionId) {
      clearSettlementTimer();
      sessionIdRef.current = null;
      setGestureToken(0);
      setIsActive(false);
    }
  }, [activeSession, clearSettlementTimer]);

  const gestureProgress = useDerivedValue(() => 1 - progress.value);

  const setProgress = useCallback(
    (value: number) => {
      'worklet';
      if (!gestureToken || owner.value !== gestureToken) return;
      progress.value = toInteractiveSessionProgress(value);
    },
    [gestureToken, owner, progress]
  );

  const beginBack = useCallback(
    async (
      options: InteractiveBackOptions = {}
    ): Promise<InteractiveTransitionSession | null> => {
      if (
        preparingRef.current ||
        sessionIdRef.current ||
        progressOwnership.hasSession
      ) {
        return null;
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

      if (!groupId || !targetScreenId) {
        return null;
      }

      if (!navigationController.acquireNavigationLock(screenId)) return null;
      const navigationToken = navigationController.getNavigationLockToken();
      preparingRef.current = true;
      beginTokenRef.current += 1;
      const beginToken = beginTokenRef.current;
      progressOwnership.invalidate();
      const preparationVersion = progressOwnership.version;

      try {
        await preMeasureGroup(groupId, screenId);
        if (
          beginTokenRef.current !== beginToken ||
          progressOwnership.version !== preparationVersion
        )
          return null;
        const session = await startTransition({
          groupId,
          sourceScreenId: screenId,
          targetScreenId,
          direction: 'backward',
        });

        if (!session) {
          return null;
        }

        if (beginTokenRef.current !== beginToken) {
          cancelTransition(session.id);
          return null;
        }

        const token = progressOwnership.claim(session.id);
        if (token === null) return null;

        sessionIdRef.current = session.id;
        const overlayReady = await waitForOverlayReady(session.id);
        if (!progressOwnership.isCurrent(token, session.id)) return null;
        if (!overlayReady) {
          if (sessionIdRef.current === session.id) {
            sessionIdRef.current = null;
          }
          cancelTransition(session.id);
          return null;
        }

        if (sessionIdRef.current !== session.id) {
          return null;
        }

        setOwnedProgress(progressOwnership, token, session.id, progress, 1);
        setGestureToken(token);
        setIsActive(true);
        return { id: session.id, progress: gestureProgress };
      } finally {
        if (!sessionIdRef.current) {
          navigationController.releaseNavigationLock(navigationToken);
        }
        if (beginTokenRef.current === beginToken) {
          preparingRef.current = false;
        }
      }
    },
    [
      cancelTransition,
      getNavigationLineage,
      navigationController,
      gestureProgress,
      preMeasureGroup,
      progress,
      progressOwnership,
      routeParams,
      resolveScreenId,
      screenId,
      startTransition,
      waitForOverlayReady,
    ]
  );

  const cancelOnRN = useCallback(
    (token: number, sessionId: string) => {
      if (
        sessionIdRef.current !== sessionId ||
        !progressOwnership.isCurrent(token, sessionId)
      ) {
        return;
      }
      clearSettlementTimer();
      sessionIdRef.current = null;
      setGestureToken(0);
      setIsActive(false);
      cancelTransition(sessionId);
    },
    [cancelTransition, clearSettlementTimer, progressOwnership]
  );

  const animateSettlement = useCallback(
    (target: 0 | 1, options: InteractiveTransitionSettleOptions) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || reverseController.owns(sessionId)) return;
      const token = progressOwnership.claim(sessionId);
      if (token === null) return;
      clearSettlementTimer();
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
          ...FAST_SPRING,
          ...options.spring,
          ...(options.velocity === undefined
            ? {}
            : { velocity: -options.velocity }),
        },
        onComplete,
      });
      if (options.duration) {
        settlementTimerRef.current = setTimeout(() => {
          setOwnedProgress(
            progressOwnership,
            token,
            sessionId,
            progress,
            target,
            onComplete
          );
        }, options.duration + 50);
      }
    },
    [
      cancelOnRN,
      clearSettlementTimer,
      commitReverseTransition,
      navigateBack,
      progress,
      progressOwnership,
      reverseController,
    ]
  );

  const finish = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) =>
      animateSettlement(0, options),
    [animateSettlement]
  );

  const cancel = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) => {
      beginTokenRef.current += 1;
      preparingRef.current = false;
      animateSettlement(1, options);
    },
    [animateSettlement]
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
