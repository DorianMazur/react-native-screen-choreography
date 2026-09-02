import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyContext } from '../core/ChoreographyContext';
import { FAST_SPRING } from '../core/constants';
import { toInteractiveSessionProgress } from '../core/interactiveProgress';
import { useScreenId } from '../core/screenIdContext';
import type {
  InteractiveBackOptions,
  InteractiveTransitionSession,
  InteractiveTransitionSettleOptions,
} from '../types';

export function useInteractiveTransition() {
  const choreography = useContext(ChoreographyContext);
  if (!choreography) {
    throw new Error(
      'useInteractiveTransition must be used within a <ChoreographyProvider>'
    );
  }

  const navigation = useNavigation<any>();
  const route = useRoute();
  const screenId = useScreenId();
  const {
    activeSession,
    progress,
    preMeasureGroup,
    startTransition,
    waitForOverlayReady,
    completeTransition,
    cancelTransition,
  } = choreography;
  const sessionIdRef = useRef<string | null>(null);
  const beginTokenRef = useRef(0);
  const preparingRef = useRef(false);
  const [isActive, setIsActive] = useState(false);

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

      const params = (route.params ?? {}) as Record<string, unknown>;
      const groupId =
        options.group ?? (params._choreographyGroup as string | undefined);
      const targetScreenId =
        options.targetScreenId ??
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
          cancelTransition();
          return null;
        }

        sessionIdRef.current = session.id;
        await waitForOverlayReady(session.id);

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
      gestureProgress,
      preMeasureGroup,
      progress,
      route.params,
      screenId,
      startTransition,
      waitForOverlayReady,
    ]
  );

  const finishOnRN = useCallback(
    (sessionId: string) => {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      sessionIdRef.current = null;
      setIsActive(false);
      navigation.goBack();
      requestAnimationFrame(() => completeTransition());
    },
    [completeTransition, navigation]
  );

  const cancelOnRN = useCallback(
    (sessionId: string) => {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      sessionIdRef.current = null;
      setIsActive(false);
      cancelTransition();
    },
    [cancelTransition]
  );

  const finish = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      cancelAnimation(progress);
      const onFinished = (finished?: boolean) => {
        'worklet';
        if (finished) {
          progress.value = 0;
          scheduleOnRN(finishOnRN, sessionId);
        }
      };

      progress.value = options.duration
        ? withTiming(
            0,
            {
              duration: options.duration,
              easing: Easing.out(Easing.cubic),
            },
            onFinished
          )
        : withSpring(0, options.spring ?? FAST_SPRING, onFinished);
    },
    [finishOnRN, progress]
  );

  const cancel = useCallback(
    (options: InteractiveTransitionSettleOptions = {}) => {
      beginTokenRef.current += 1;
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        preparingRef.current = false;
        return;
      }

      cancelAnimation(progress);
      const onFinished = (finished?: boolean) => {
        'worklet';
        if (finished) {
          progress.value = 1;
          scheduleOnRN(cancelOnRN, sessionId);
        }
      };

      progress.value = options.duration
        ? withTiming(
            1,
            {
              duration: options.duration,
              easing: Easing.out(Easing.cubic),
            },
            onFinished
          )
        : withSpring(1, options.spring ?? FAST_SPRING, onFinished);
    },
    [cancelOnRN, progress]
  );

  return {
    beginBack,
    setProgress,
    finish,
    cancel,
    progress: gestureProgress,
    isActive,
  };
}
