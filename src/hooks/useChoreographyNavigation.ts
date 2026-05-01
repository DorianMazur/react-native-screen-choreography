import { useCallback, useContext, useEffect, useRef } from 'react';
import { useIsFocused, useRoute } from '@react-navigation/native';
import { Platform } from 'react-native';
import {
  cancelAnimation,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from './ChoreographyContext';
import { useScreenId } from './useScreenId';
import type { ChoreographyNavigationOptions } from '../types';
import { DEFAULT_SPRING, FAST_SPRING } from '../constants';
import { debugLog, isDebugEnabled } from '../debug/logger';

interface PendingNavigationRequest {
  screenName: string;
  params?: any;
  options?: ChoreographyNavigationOptions;
}

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): string {
  return `${Date.now() - startedAt}ms`;
}

function describeSession(
  session: ChoreographyContextType['activeSession']
): string {
  if (!session) {
    return 'none';
  }

  return `${session.direction}:${session.sourceScreenId}->${session.targetScreenId}:${session.state}`;
}

/**
 * Hook providing navigation functions with choreographed transitions.
 * Wraps React Navigation's navigate/goBack with transition orchestration.
 */
export function useChoreographyNavigation(navigation: any) {
  const ctx = useContext(ChoreographyContext) as ChoreographyContextType;
  if (!ctx) {
    throw new Error(
      'useChoreographyNavigation must be used within a <ChoreographyProvider>'
    );
  }

  const route = useRoute();
  const isFocused = useIsFocused();
  const screenId = useScreenId();
  const currentScreenId =
    screenId !== 'default'
      ? screenId
      : (route.name ??
        navigation.getState?.()?.routes?.[navigation.getState?.()?.index ?? 0]
          ?.name ??
        'default');

  const {
    progress,
    preMeasureGroup,
    startTransition,
    cancelTransition,
    completeTransition,
    setPendingTargetScreen,
    waitForOverlayReady,
    waitForScreenReady,
    refreshActiveSessionMetrics,
  } = ctx;

  const navigateLockRef = useRef(false);
  const pendingNavigationRef = useRef<PendingNavigationRequest | null>(null);
  const progressAnimationTokenRef = useRef(0);
  const activeSessionRef = useRef<ChoreographyContextType['activeSession']>(
    ctx.activeSession
  );
  const logNavigation = useCallback(
    (message: string | (() => string)) => {
      if (!isDebugEnabled()) return;
      const text = typeof message === 'function' ? message() : message;
      debugLog(`[Navigation:${currentScreenId}] ${text}`);
    },
    [currentScreenId]
  );

  const releaseNavigationLock = useCallback(() => {
    navigateLockRef.current = false;
  }, []);

  const invalidateProgressAnimation = useCallback(() => {
    progressAnimationTokenRef.current += 1;
  }, []);

  const createProgressAnimationToken = useCallback(() => {
    progressAnimationTokenRef.current += 1;
    return progressAnimationTokenRef.current;
  }, []);

  const isCurrentProgressAnimationToken = useCallback((token: number) => {
    return progressAnimationTokenRef.current === token;
  }, []);

  useEffect(() => {
    activeSessionRef.current = ctx.activeSession;
  }, [ctx.activeSession]);

  const isCurrentSessionAnimation = useCallback(
    (sessionId: string) => activeSessionRef.current?.id === sessionId,
    []
  );

  const getNavigationBlockReasons = useCallback(
    (skipSessionBlock: boolean) => {
      const reasons: string[] = [];

      if (!isFocused) {
        reasons.push('not-focused');
      }

      if (navigateLockRef.current) {
        reasons.push('navigate-lock');
      }

      if (!skipSessionBlock && ctx.activeSession) {
        reasons.push(`active-session=${describeSession(ctx.activeSession)}`);
      }

      if (ctx.pendingTargetScreenId) {
        reasons.push(`pending-target=${ctx.pendingTargetScreenId}`);
      }

      return reasons.length > 0 ? reasons.join(', ') : 'none';
    },
    [ctx.activeSession, ctx.pendingTargetScreenId, isFocused]
  );

  useEffect(() => {
    if (!ctx.activeSession && !ctx.pendingTargetScreenId) {
      if (navigateLockRef.current) {
        logNavigation('idle state reached, releasing navigation lock');
      }
      releaseNavigationLock();
    }
  }, [
    ctx.activeSession,
    ctx.pendingTargetScreenId,
    logNavigation,
    releaseNavigationLock,
  ]);

  const waitForNextFrame = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
    []
  );

  const waitForReplayWindow = useCallback(async () => {
    const replayWaitStartedAt = nowMs();
    logNavigation(() => `replay window wait start screen=${currentScreenId}`);
    await waitForNextFrame();
    await waitForNextFrame();
    logNavigation(
      () =>
        `replay window wait end screen=${currentScreenId} duration=${elapsedMs(replayWaitStartedAt)}`
    );
  }, [currentScreenId, logNavigation, waitForNextFrame]);

  const canInterruptReturnToCurrentScreen = useCallback(
    (session: ChoreographyContextType['activeSession']) =>
      Boolean(
        isFocused &&
        session &&
        ((session.direction === 'forward' &&
          session.sourceScreenId === currentScreenId) ||
          (session.direction === 'backward' &&
            session.targetScreenId === currentScreenId)) &&
        !ctx.pendingTargetScreenId
      ),
    [ctx.pendingTargetScreenId, currentScreenId, isFocused]
  );

  const interruptReturnTransition = useCallback(async () => {
    const session = ctx.activeSession;
    if (!session) {
      return;
    }

    const interruptStartedAt = nowMs();
    logNavigation(
      () => `interrupt return start session=${describeSession(session)}`
    );
    cancelAnimation(progress);
    invalidateProgressAnimation();
    releaseNavigationLock();

    if (
      session.direction === 'backward' &&
      session.targetScreenId === currentScreenId
    ) {
      progress.value = 0;
      completeTransition();
    } else {
      cancelTransition();
    }

    await waitForNextFrame();
    logNavigation(
      () => `interrupt return end duration=${elapsedMs(interruptStartedAt)}`
    );
  }, [
    cancelTransition,
    ctx.activeSession,
    currentScreenId,
    completeTransition,
    invalidateProgressAnimation,
    logNavigation,
    progress,
    releaseNavigationLock,
    waitForNextFrame,
  ]);

  const finishForwardTransition = useCallback(
    (token: number, sessionId: string) => {
      if (!isCurrentProgressAnimationToken(token)) {
        logNavigation(() => `ignore stale forward completion token=${token}`);
        return;
      }

      if (!isCurrentSessionAnimation(sessionId)) {
        logNavigation(
          () =>
            `ignore stale forward completion token=${token} session=${sessionId} current=${describeSession(activeSessionRef.current)}`
        );
        return;
      }

      logNavigation(
        () => `forward animation completed token=${token} session=${sessionId}`
      );
      releaseNavigationLock();
      completeTransition();
    },
    [
      completeTransition,
      isCurrentProgressAnimationToken,
      isCurrentSessionAnimation,
      logNavigation,
      releaseNavigationLock,
    ]
  );

  const finishReverseTransition = useCallback(
    (token: number, sessionId: string) => {
      if (!isCurrentProgressAnimationToken(token)) {
        logNavigation(() => `ignore stale reverse completion token=${token}`);
        return;
      }

      if (!isCurrentSessionAnimation(sessionId)) {
        logNavigation(
          () =>
            `ignore stale reverse completion token=${token} session=${sessionId} current=${describeSession(activeSessionRef.current)}`
        );
        return;
      }

      logNavigation(
        () => `reverse animation completed token=${token} session=${sessionId}`
      );
      releaseNavigationLock();
      navigation.goBack();
      requestAnimationFrame(() => {
        completeTransition();
      });
    },
    [
      completeTransition,
      isCurrentProgressAnimationToken,
      isCurrentSessionAnimation,
      logNavigation,
      navigation,
      releaseNavigationLock,
    ]
  );

  const finishSettledReverseTransition = useCallback(
    (token: number, sessionId: string) => {
      if (!isCurrentProgressAnimationToken(token)) {
        logNavigation(
          () => `ignore stale settled-reverse completion token=${token}`
        );
        return;
      }

      if (!isCurrentSessionAnimation(sessionId)) {
        logNavigation(
          () =>
            `ignore stale settled-reverse completion token=${token} session=${sessionId} current=${describeSession(activeSessionRef.current)}`
        );
        return;
      }

      logNavigation(
        () =>
          `settled reverse animation completed token=${token} session=${sessionId}`
      );
      releaseNavigationLock();
      completeTransition();
    },
    [
      completeTransition,
      isCurrentProgressAnimationToken,
      isCurrentSessionAnimation,
      logNavigation,
      releaseNavigationLock,
    ]
  );

  const choreographyNavigate = useCallback(
    async (
      screenName: string,
      params?: any,
      options?: ChoreographyNavigationOptions,
      allowQueue: boolean = true
    ) => {
      const tapStartedAt = nowMs();
      const groupId =
        options?.transitionConfig?.group ?? params?.transitionGroup;
      const sourceScreenId = currentScreenId;
      const targetScreenId = screenName;
      let interruptedSettlingReturn = false;

      logNavigation(
        () =>
          `tap navigate target=${screenName} group=${groupId ?? 'none'} allowQueue=${allowQueue} session=${describeSession(ctx.activeSession)}`
      );

      if (!groupId) {
        logNavigation(() => `plain navigate target=${screenName}`);
        navigation.navigate(screenName, params);
        return;
      }

      const canInterruptActiveReturn = canInterruptReturnToCurrentScreen(
        ctx.activeSession
      );

      if (canInterruptActiveReturn) {
        pendingNavigationRef.current = null;
        await interruptReturnTransition();
        interruptedSettlingReturn = true;
        logNavigation(
          () =>
            `tap navigate interrupted current return target=${screenName} elapsed=${elapsedMs(tapStartedAt)}`
        );
      }

      const isBlocked = Boolean(
        !isFocused ||
        navigateLockRef.current ||
        (!interruptedSettlingReturn && ctx.activeSession) ||
        ctx.pendingTargetScreenId
      );

      if (isBlocked) {
        const reasons = getNavigationBlockReasons(interruptedSettlingReturn);
        logNavigation(
          () =>
            `tap navigate blocked target=${screenName} reasons=${reasons}${allowQueue ? ' -> queued' : ' -> dropped'}`
        );
        if (allowQueue) {
          pendingNavigationRef.current = {
            screenName,
            params,
            options,
          };
        }
        return;
      }

      pendingNavigationRef.current = null;
      navigateLockRef.current = true;

      try {
        const preMeasureStartedAt = nowMs();
        logNavigation(() => `preMeasure start group=${groupId}`);
        await preMeasureGroup(groupId, sourceScreenId);
        logNavigation(
          () =>
            `preMeasure end group=${groupId} duration=${elapsedMs(preMeasureStartedAt)}`
        );

        setPendingTargetScreen(targetScreenId);
        logNavigation(() => `pending target set target=${targetScreenId}`);

        navigation.navigate(screenName, {
          ...params,
          _choreographySourceScreen: sourceScreenId,
          _choreographyGroup: groupId,
        });
        logNavigation(
          () =>
            `navigation dispatched target=${screenName} elapsed=${elapsedMs(tapStartedAt)}`
        );

        if (Platform.OS === 'android') {
          const screenReadyStartedAt = nowMs();
          await waitForScreenReady(targetScreenId);
          await waitForNextFrame();
          logNavigation(
            () =>
              `android screen ready target=${targetScreenId} duration=${elapsedMs(screenReadyStartedAt)} total=${elapsedMs(tapStartedAt)}`
          );
        }

        const transitionPrepareStartedAt = nowMs();
        const session = await startTransition({
          groupId,
          sourceScreenId,
          targetScreenId,
          direction: 'forward',
        });

        if (!session) {
          logNavigation(
            () =>
              `transition preparation failed target=${screenName} elapsed=${elapsedMs(tapStartedAt)}`
          );
          releaseNavigationLock();
          setPendingTargetScreen(null);
          return;
        }

        logNavigation(
          () =>
            `transition prepared session=${session.id} duration=${elapsedMs(transitionPrepareStartedAt)} total=${elapsedMs(tapStartedAt)}`
        );

        const overlayWaitStartedAt = nowMs();
        await waitForOverlayReady(session.id);
        logNavigation(
          () =>
            `overlay ready session=${session.id} duration=${elapsedMs(overlayWaitStartedAt)} total=${elapsedMs(tapStartedAt)}`
        );
        setPendingTargetScreen(null);
        logNavigation(() => `pending target cleared target=${targetScreenId}`);

        const springConfig = options?.spring ?? DEFAULT_SPRING;
        const animationToken = createProgressAnimationToken();
        logNavigation(
          () =>
            `forward animation start session=${session.id} token=${animationToken} totalDelay=${elapsedMs(tapStartedAt)} interruptedSettlingReturn=${interruptedSettlingReturn}`
        );

        if (options?.duration) {
          progress.value = withTiming(
            1,
            {
              duration: options.duration,
              easing: Easing.out(Easing.cubic),
            },
            (finished) => {
              if (finished) {
                progress.value = 1;
                scheduleOnRN(
                  finishForwardTransition,
                  animationToken,
                  session.id
                );
              }
            }
          );
        } else {
          progress.value = withSpring(1, springConfig, (finished) => {
            if (finished) {
              progress.value = 1;
              scheduleOnRN(finishForwardTransition, animationToken, session.id);
            }
          });
        }
      } catch (error) {
        logNavigation(
          () =>
            `navigate error target=${screenName} elapsed=${elapsedMs(tapStartedAt)} error=${error instanceof Error ? error.message : String(error)}`
        );
        releaseNavigationLock();
        setPendingTargetScreen(null);
        throw error;
      }
    },
    [
      ctx.activeSession,
      ctx.pendingTargetScreenId,
      canInterruptReturnToCurrentScreen,
      createProgressAnimationToken,
      currentScreenId,
      finishForwardTransition,
      getNavigationBlockReasons,
      isFocused,
      interruptReturnTransition,
      logNavigation,
      navigation,
      progress,
      preMeasureGroup,
      releaseNavigationLock,
      setPendingTargetScreen,
      startTransition,
      waitForOverlayReady,
      waitForScreenReady,
      waitForNextFrame,
    ]
  );

  useEffect(() => {
    const canInterruptActiveReturn = canInterruptReturnToCurrentScreen(
      ctx.activeSession
    );
    const isBlocked = Boolean(
      !isFocused ||
      navigateLockRef.current ||
      (!canInterruptActiveReturn && ctx.activeSession) ||
      ctx.pendingTargetScreenId
    );

    if (isBlocked) {
      return;
    }

    const pendingRequest = pendingNavigationRef.current;
    if (!pendingRequest) {
      return;
    }

    logNavigation(
      () =>
        `replay candidate target=${pendingRequest.screenName} session=${describeSession(ctx.activeSession)}`
    );

    pendingNavigationRef.current = null;
    let cancelled = false;

    const replayPendingNavigation = async () => {
      if (!canInterruptActiveReturn) {
        logNavigation(
          () => `replay waiting target=${pendingRequest.screenName}`
        );
        await waitForReplayWindow();
      }

      if (cancelled) {
        logNavigation(
          () => `replay cancelled target=${pendingRequest.screenName}`
        );
        return;
      }

      const canInterruptLatestReturn = canInterruptReturnToCurrentScreen(
        ctx.activeSession
      );

      const blockedAgain = Boolean(
        !isFocused ||
        navigateLockRef.current ||
        (!canInterruptLatestReturn && ctx.activeSession) ||
        ctx.pendingTargetScreenId
      );

      if (blockedAgain) {
        const reasons = getNavigationBlockReasons(canInterruptLatestReturn);
        logNavigation(
          () =>
            `replay blocked target=${pendingRequest.screenName} reasons=${reasons} -> requeued`
        );
        if (!pendingNavigationRef.current) {
          pendingNavigationRef.current = pendingRequest;
        }
        return;
      }

      logNavigation(
        () => `replay launching target=${pendingRequest.screenName}`
      );

      await choreographyNavigate(
        pendingRequest.screenName,
        pendingRequest.params,
        pendingRequest.options,
        false
      );
    };

    replayPendingNavigation().catch((error) => {
      logNavigation(
        () =>
          `replay error target=${pendingRequest.screenName} error=${error instanceof Error ? error.message : String(error)}`
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    canInterruptReturnToCurrentScreen,
    choreographyNavigate,
    ctx.activeSession,
    ctx.pendingTargetScreenId,
    getNavigationBlockReasons,
    isFocused,
    logNavigation,
    waitForReplayWindow,
  ]);

  const choreographyGoBack = useCallback(
    async (options?: ChoreographyNavigationOptions) => {
      const goBackStartedAt = nowMs();
      const session = ctx.activeSession;

      logNavigation(() => `goBack invoked session=${describeSession(session)}`);

      if (session) {
        const springConfig = options?.spring ?? FAST_SPRING;
        const sessionId = session.id;

        if (session.direction === 'forward') {
          logNavigation(
            () =>
              `goBack interrupt active forward session elapsed=${elapsedMs(goBackStartedAt)}`
          );
          pendingNavigationRef.current = null;
          cancelAnimation(progress);
          invalidateProgressAnimation();
          progress.value = Math.max(progress.value, 0.12);
          navigation.goBack();
          await waitForNextFrame();
          await refreshActiveSessionMetrics('source');
          logNavigation(
            () =>
              `goBack refreshed source metrics session=${sessionId} total=${elapsedMs(goBackStartedAt)}`
          );
          const animationToken = createProgressAnimationToken();
          requestAnimationFrame(() => {
            progress.value = withSpring(0, springConfig, (finished) => {
              if (finished) {
                progress.value = 0;
                scheduleOnRN(
                  finishSettledReverseTransition,
                  animationToken,
                  sessionId
                );
              }
            });
          });
        } else {
          logNavigation(
            () =>
              `goBack continue reverse session elapsed=${elapsedMs(goBackStartedAt)}`
          );
          cancelAnimation(progress);
          invalidateProgressAnimation();
          const animationToken = createProgressAnimationToken();
          progress.value = withSpring(0, springConfig, (finished) => {
            if (finished) {
              progress.value = 0;
              scheduleOnRN(finishReverseTransition, animationToken, sessionId);
            }
          });
        }
      } else {
        const routeState = navigation.getState?.()?.routes;
        const params = routeState?.[routeState.length - 1]?.params as any;
        const groupId = params?._choreographyGroup;
        const sourceScreenId = params?._choreographySourceScreen;

        if (groupId && sourceScreenId) {
          const currentRoute = routeState?.[routeState.length - 1];
          const targetScreenId = currentRoute?.name;

          logNavigation(
            () =>
              `goBack create standalone reverse group=${groupId} source=${sourceScreenId} target=${targetScreenId ?? 'unknown'}`
          );

          await preMeasureGroup(groupId, targetScreenId);

          const reverseSession = await startTransition({
            groupId,
            sourceScreenId: targetScreenId,
            targetScreenId: sourceScreenId,
            direction: 'backward',
          });

          if (!reverseSession) {
            navigation.goBack();
            return;
          }

          const springConfig = options?.spring ?? FAST_SPRING;
          await waitForNextFrame();
          navigation.goBack();
          const animationToken = createProgressAnimationToken();
          requestAnimationFrame(() => {
            progress.value = withSpring(0, springConfig, (finished) => {
              if (finished) {
                progress.value = 0;
                scheduleOnRN(
                  finishSettledReverseTransition,
                  animationToken,
                  reverseSession.id
                );
              }
            });
          });
        } else {
          logNavigation('goBack plain navigation');
          navigation.goBack();
        }
      }
    },
    [
      ctx.activeSession,
      createProgressAnimationToken,
      finishReverseTransition,
      finishSettledReverseTransition,
      invalidateProgressAnimation,
      logNavigation,
      navigation,
      preMeasureGroup,
      progress,
      refreshActiveSessionMetrics,
      startTransition,
      waitForNextFrame,
    ]
  );

  return {
    navigate: (
      screenName: string,
      params?: any,
      options?: ChoreographyNavigationOptions
    ) => choreographyNavigate(screenName, params, options, true),
    goBack: choreographyGoBack,
  };
}
