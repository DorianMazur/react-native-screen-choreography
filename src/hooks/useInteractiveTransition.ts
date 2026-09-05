import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { ChoreographyContext } from '../core/ChoreographyContext';
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
  navigateBack: () => void;
  routeParams?: Record<string, unknown>;
}

export function useInteractiveTransitionNavigator({
  navigateBack,
  routeParams,
}: InteractiveTransitionNavigatorOptions) {
  const choreography = useContext(ChoreographyContext);
  if (!choreography) {
    throw new Error(
      'useInteractiveTransition must be used within a <ChoreographyProvider>'
    );
  }

  const screenId = useScreenId();
  const {
    activeSession,
    progress,
    preMeasureGroup,
    startTransition,
    waitForOverlayReady,
    completeTransition,
    cancelTransition,
    getNavigationLineage,
  } = choreography;
  const sessionIdRef = useRef<string | null>(null);
  const beginTokenRef = useRef(0);
  const preparingRef = useRef(false);
  const settlementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isActive, setIsActive] = useState(false);

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
      if (sessionId) {
        cancelTransition(sessionId);
      }
    },
    [cancelTransition, clearSettlementTimer]
  );

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (sessionId && activeSession?.id !== sessionId) {
      sessionIdRef.current = null;
      setIsActive(false);
    }
  }, [activeSession]);

  const gestureProgress = useDerivedValue(() => 1 - progress.value);

  const setProgress = useCallback(
    (value: number) => {
      'worklet';
      progress.value = toInteractiveSessionProgress(value);
    },
    [progress]
  );

  const beginBack = useCallback(
    async (
      options: InteractiveBackOptions = {}
    ): Promise<InteractiveTransitionSession | null> => {
      if (preparingRef.current || sessionIdRef.current || activeSession) {
        return null;
      }

      const lineage = getNavigationLineage(screenId);
      const params = routeParams ?? {};
      const groupId =
        options.group ??
        lineage?.groupId ??
        (params._choreographyGroup as string | undefined);
      const targetScreenId =
        options.targetScreenId ??
        lineage?.sourceScreenId ??
        (params._choreographySourceScreen as string | undefined);

      if (!groupId || !targetScreenId) {
        return null;
      }

      preparingRef.current = true;
      beginTokenRef.current += 1;
      const beginToken = beginTokenRef.current;

      try {
        await preMeasureGroup(groupId, screenId);
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

        sessionIdRef.current = session.id;
        const overlayReady = await waitForOverlayReady(session.id);
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

        progress.value = 1;
        setIsActive(true);
        return { id: session.id, progress: gestureProgress };
      } finally {
        if (beginTokenRef.current === beginToken) {
          preparingRef.current = false;
        }
      }
    },
    [
      activeSession,
      cancelTransition,
      getNavigationLineage,
      gestureProgress,
      preMeasureGroup,
      progress,
      routeParams,
      screenId,
      startTransition,
      waitForOverlayReady,
    ]
  );

  const finishOnRN = useCallback(
    (sessionId: string) => {
      clearSettlementTimer();
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      sessionIdRef.current = null;
      setIsActive(false);
      navigateBack();
      requestAnimationFrame(() => completeTransition(sessionId));
    },
    [clearSettlementTimer, completeTransition, navigateBack]
  );

  const cancelOnRN = useCallback(
    (sessionId: string) => {
      clearSettlementTimer();
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      sessionIdRef.current = null;
      setIsActive(false);
      cancelTransition(sessionId);
    },
    [cancelTransition, clearSettlementTimer]
  );

  const finish = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      clearSettlementTimer();
      const duration = options.duration;
      const spring = options.spring;
      const velocity = options.velocity;
      scheduleOnUI(() => {
        'worklet';
        cancelAnimation(progress);
        const onFinished = (finished?: boolean) => {
          'worklet';
          if (finished) {
            progress.value = 0;
            scheduleOnRN(finishOnRN, sessionId);
          }
        };

        progress.value = duration
          ? withTiming(
              0,
              {
                duration,
                easing: Easing.out(Easing.cubic),
              },
              onFinished
            )
          : withSpring(
              0,
              {
                ...FAST_SPRING,
                ...spring,
                ...(velocity === undefined ? {} : { velocity: -velocity }),
              },
              onFinished
            );
      });
      if (duration) {
        settlementTimerRef.current = setTimeout(() => {
          progress.value = 0;
          finishOnRN(sessionId);
        }, duration + 50);
      }
    },
    [clearSettlementTimer, finishOnRN, progress]
  );

  const cancel = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) => {
      beginTokenRef.current += 1;
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        preparingRef.current = false;
        return;
      }

      clearSettlementTimer();
      const duration = options.duration;
      const spring = options.spring;
      const velocity = options.velocity;
      scheduleOnUI(() => {
        'worklet';
        cancelAnimation(progress);
        const onFinished = (finished?: boolean) => {
          'worklet';
          if (finished) {
            progress.value = 1;
            scheduleOnRN(cancelOnRN, sessionId);
          }
        };

        progress.value = duration
          ? withTiming(
              1,
              {
                duration,
                easing: Easing.out(Easing.cubic),
              },
              onFinished
            )
          : withSpring(
              1,
              {
                ...FAST_SPRING,
                ...spring,
                ...(velocity === undefined ? {} : { velocity: -velocity }),
              },
              onFinished
            );
      });
      if (duration) {
        settlementTimerRef.current = setTimeout(() => {
          progress.value = 1;
          cancelOnRN(sessionId);
        }, duration + 50);
      }
    },
    [cancelOnRN, clearSettlementTimer, progress]
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
