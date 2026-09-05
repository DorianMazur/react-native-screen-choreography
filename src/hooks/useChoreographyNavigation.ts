import { useCallback, useContext, useEffect, useRef } from 'react';
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
} from '../core/ChoreographyContext';
import type { ChoreographyNavigationOptions } from '../types';
import { DEFAULT_SPRING, FAST_SPRING } from '../core/constants';
import { debugLog, isDebugEnabled } from '../debug/logger';
import {
  NavigationSessionController,
  type PendingNavigationRequest,
} from '../core/NavigationSessionController';

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

export interface ChoreographyNavigatorBinding {
  currentScreenId: string;
  isFocused: boolean;
  goBack: () => void;
}

export function useChoreographyNavigator({
  currentScreenId,
  isFocused,
  goBack: navigateBack,
}: ChoreographyNavigatorBinding) {
  const ctx = useContext(ChoreographyContext) as ChoreographyContextType;
  if (!ctx) {
    throw new Error(
      'useChoreographyNavigation must be used within a <ChoreographyProvider>'
    );
  }

  const {
    progress,
    preMeasureGroup,
    startTransition,
    cancelTransition,
    completeTransition,
    setPendingTargetScreen,
    setNavigationLineage,
    waitForOverlayReady,
    waitForScreenReady,
    refreshActiveSessionMetrics,
  } = ctx;

  const controllerRef = useRef<NavigationSessionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new NavigationSessionController();
    controllerRef.current.setActiveSession(ctx.activeSession);
  }
  const controller = controllerRef.current;
  const logNavigation = useCallback(
    (message: string | (() => string)) => {
      if (!isDebugEnabled()) return;
      const text = typeof message === 'function' ? message() : message;
      debugLog(`[Navigation:${currentScreenId}] ${text}`);
    },
    [currentScreenId]
  );

  const releaseNavigationLock = useCallback(() => {
    controller.releaseNavigationLock();
  }, [controller]);

  const invalidateProgressAnimation = useCallback(() => {
    controller.invalidateAnimation();
  }, [controller]);

  const createProgressAnimationToken = useCallback(() => {
    return controller.createAnimationToken();
  }, [controller]);

  const isCurrentProgressAnimationToken = useCallback(
    (token: number) => controller.isCurrentAnimation(token),
    [controller]
  );

  useEffect(() => {
    controller.setActiveSession(ctx.activeSession);
  }, [controller, ctx.activeSession]);

  const isCurrentSessionAnimation = useCallback(
    (sessionId: string) => controller.isCurrentSession(sessionId),
    [controller]
  );

  const getNavigationBlockReasons = useCallback(
    (skipSessionBlock: boolean) => {
      const reasons: string[] = [];

      if (!isFocused) {
        reasons.push('not-focused');
      }

      if (controller.isNavigationLocked()) {
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
    [controller, ctx.activeSession, ctx.pendingTargetScreenId, isFocused]
  );

  useEffect(() => {
    if (!ctx.activeSession && !ctx.pendingTargetScreenId) {
      if (controller.isNavigationLocked()) {
        logNavigation('idle state reached, releasing navigation lock');
      }
      releaseNavigationLock();
    }
  }, [
    controller,
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
      completeTransition(session.id);
    } else {
      cancelTransition(session.id);
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
            `ignore stale forward completion token=${token} session=${sessionId} current=${describeSession(controller.getActiveSession())}`
        );
        return;
      }

      logNavigation(
        () => `forward animation completed token=${token} session=${sessionId}`
      );
      releaseNavigationLock();
      completeTransition(sessionId);
    },
    [
      completeTransition,
      controller,
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
            `ignore stale reverse completion token=${token} session=${sessionId} current=${describeSession(controller.getActiveSession())}`
        );
        return;
      }

      logNavigation(
        () => `reverse animation completed token=${token} session=${sessionId}`
      );
      releaseNavigationLock();
      navigateBack();
      requestAnimationFrame(() => {
        completeTransition(sessionId);
      });
    },
    [
      completeTransition,
      controller,
      isCurrentProgressAnimationToken,
      isCurrentSessionAnimation,
      logNavigation,
      navigateBack,
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
            `ignore stale settled-reverse completion token=${token} session=${sessionId} current=${describeSession(controller.getActiveSession())}`
        );
        return;
      }

      logNavigation(
        () =>
          `settled reverse animation completed token=${token} session=${sessionId}`
      );
      releaseNavigationLock();
      cancelTransition(sessionId);
    },
    [
      cancelTransition,
      controller,
      isCurrentProgressAnimationToken,
      isCurrentSessionAnimation,
      logNavigation,
      releaseNavigationLock,
    ]
  );

  const choreographyNavigate = useCallback(
    async (request: PendingNavigationRequest, allowQueue: boolean = true) => {
      const tapStartedAt = nowMs();
      const { targetScreenId, dispatchNavigation, options } = request;
      const groupId = options?.transitionConfig?.group;
      const sourceScreenId = currentScreenId;
      let interruptedSettlingReturn = false;

      logNavigation(
        () =>
          `tap navigate target=${targetScreenId} group=${groupId ?? 'none'} allowQueue=${allowQueue} session=${describeSession(ctx.activeSession)}`
      );

      if (!groupId) {
        logNavigation(() => `plain navigate target=${targetScreenId}`);
        dispatchNavigation();
        return;
      }

      const canInterruptActiveReturn = canInterruptReturnToCurrentScreen(
        ctx.activeSession
      );

      if (canInterruptActiveReturn) {
        controller.clearQueuedNavigation();
        await interruptReturnTransition();
        interruptedSettlingReturn = true;
        logNavigation(
          () =>
            `tap navigate interrupted current return target=${targetScreenId} elapsed=${elapsedMs(tapStartedAt)}`
        );
      }

      const isBlocked = Boolean(
        !isFocused ||
        controller.isNavigationLocked() ||
        (!interruptedSettlingReturn && ctx.activeSession) ||
        ctx.pendingTargetScreenId
      );

      if (isBlocked) {
        const reasons = getNavigationBlockReasons(interruptedSettlingReturn);
        logNavigation(
          () =>
            `tap navigate blocked target=${targetScreenId} reasons=${reasons}${allowQueue ? ' -> queued' : ' -> dropped'}`
        );
        if (allowQueue) {
          controller.queueNavigation(request);
        }
        return;
      }

      controller.clearQueuedNavigation();
      controller.acquireNavigationLock();

      try {
        const transitionPrepareStartedAt = nowMs();
        const session = await controller.prepareForwardTransition({
          groupId,
          sourceScreenId,
          targetScreenId,
          isAndroid: Platform.OS === 'android',
          preMeasureGroup: async (group, screen) => {
            const startedAt = nowMs();
            logNavigation(() => `preMeasure start group=${group}`);
            await preMeasureGroup(group, screen);
            logNavigation(
              () =>
                `preMeasure end group=${group} duration=${elapsedMs(startedAt)}`
            );
          },
          setPendingTargetScreen: (pendingScreenId) => {
            setPendingTargetScreen(pendingScreenId);
            logNavigation(
              () =>
                `pending target ${pendingScreenId ? `set target=${pendingScreenId}` : `cleared target=${targetScreenId}`}`
            );
          },
          dispatchNavigation: () => {
            dispatchNavigation();
            logNavigation(
              () =>
                `navigation dispatched target=${targetScreenId} elapsed=${elapsedMs(tapStartedAt)}`
            );
          },
          waitForScreenReady: async (pendingScreenId) => {
            const startedAt = nowMs();
            const ready = await waitForScreenReady(pendingScreenId);
            logNavigation(
              () =>
                `screen ready=${ready} target=${pendingScreenId} duration=${elapsedMs(startedAt)} total=${elapsedMs(tapStartedAt)}`
            );
            return ready;
          },
          waitForNextFrame,
          startTransition,
          waitForOverlayReady,
        });

        if (!session) {
          logNavigation(
            () =>
              `transition preparation failed target=${targetScreenId} elapsed=${elapsedMs(tapStartedAt)}`
          );
          return;
        }

        setNavigationLineage({
          groupId,
          sourceScreenId,
          targetScreenId,
        });

        logNavigation(
          () =>
            `transition prepared session=${session.id} duration=${elapsedMs(transitionPrepareStartedAt)} total=${elapsedMs(tapStartedAt)}`
        );

        const springConfig = options?.spring ?? DEFAULT_SPRING;
        const animationToken = createProgressAnimationToken();
        const sessionId = session.id;
        logNavigation(
          () =>
            `forward animation start session=${sessionId} token=${animationToken} totalDelay=${elapsedMs(tapStartedAt)} interruptedSettlingReturn=${interruptedSettlingReturn}`
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
                  sessionId
                );
              }
            }
          );
        } else {
          progress.value = withSpring(1, springConfig, (finished) => {
            if (finished) {
              progress.value = 1;
              scheduleOnRN(finishForwardTransition, animationToken, sessionId);
            }
          });
        }
      } catch (error) {
        logNavigation(
          () =>
            `navigate error target=${targetScreenId} elapsed=${elapsedMs(tapStartedAt)} error=${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    },
    [
      ctx.activeSession,
      ctx.pendingTargetScreenId,
      controller,
      canInterruptReturnToCurrentScreen,
      createProgressAnimationToken,
      currentScreenId,
      finishForwardTransition,
      getNavigationBlockReasons,
      isFocused,
      interruptReturnTransition,
      logNavigation,
      progress,
      preMeasureGroup,
      setNavigationLineage,
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
      controller.isNavigationLocked() ||
      (!canInterruptActiveReturn && ctx.activeSession) ||
      ctx.pendingTargetScreenId
    );

    if (isBlocked) {
      return;
    }

    const pendingRequest = controller.peekQueuedNavigation();
    if (!pendingRequest) {
      return;
    }

    logNavigation(
      () =>
        `replay candidate target=${pendingRequest.targetScreenId} session=${describeSession(ctx.activeSession)}`
    );

    controller.takeQueuedNavigation();
    let cancelled = false;

    const replayPendingNavigation = async () => {
      if (!canInterruptActiveReturn) {
        logNavigation(
          () => `replay waiting target=${pendingRequest.targetScreenId}`
        );
        await waitForReplayWindow();
      }

      if (cancelled) {
        logNavigation(
          () => `replay cancelled target=${pendingRequest.targetScreenId}`
        );
        return;
      }

      const canInterruptLatestReturn = canInterruptReturnToCurrentScreen(
        ctx.activeSession
      );

      const blockedAgain = Boolean(
        !isFocused ||
        controller.isNavigationLocked() ||
        (!canInterruptLatestReturn && ctx.activeSession) ||
        ctx.pendingTargetScreenId
      );

      if (blockedAgain) {
        const reasons = getNavigationBlockReasons(canInterruptLatestReturn);
        logNavigation(
          () =>
            `replay blocked target=${pendingRequest.targetScreenId} reasons=${reasons} -> requeued`
        );
        if (!controller.peekQueuedNavigation()) {
          controller.queueNavigation(pendingRequest);
        }
        return;
      }

      logNavigation(
        () => `replay launching target=${pendingRequest.targetScreenId}`
      );

      await choreographyNavigate(pendingRequest, false);
    };

    replayPendingNavigation().catch((error) => {
      logNavigation(
        () =>
          `replay error target=${pendingRequest.targetScreenId} error=${error instanceof Error ? error.message : String(error)}`
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    canInterruptReturnToCurrentScreen,
    choreographyNavigate,
    controller,
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
          controller.clearQueuedNavigation();
          cancelAnimation(progress);
          invalidateProgressAnimation();
          progress.value = Math.max(progress.value, 0.12);
          navigateBack();
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
        logNavigation('goBack delegating to router');
        navigateBack();
      }
    },
    [
      ctx.activeSession,
      controller,
      createProgressAnimationToken,
      finishReverseTransition,
      finishSettledReverseTransition,
      invalidateProgressAnimation,
      logNavigation,
      navigateBack,
      progress,
      refreshActiveSessionMetrics,
      waitForNextFrame,
    ]
  );

  return {
    navigate: (request: PendingNavigationRequest) =>
      choreographyNavigate(request, true),
    goBack: choreographyGoBack,
  };
}
