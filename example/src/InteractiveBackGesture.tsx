import React, { useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
  type PanResponderGestureState,
} from 'react-native';
import { useInteractiveTransition } from 'react-native-screen-choreography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InteractiveBackGestureProps {
  children: React.ReactNode;
  threshold?: number;
}

const SNAP_BACK_DURATION = 320;
const FINISH_DURATION = 420;

export function InteractiveBackGesture({
  children,
  threshold = 0.4,
}: InteractiveBackGestureProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { beginBack, setProgress, finish, cancel, isActive } =
    useInteractiveTransition();
  const transitionRef = useRef({
    beginBack,
    setProgress,
    finish,
    cancel,
    isActive,
  });
  transitionRef.current = {
    beginBack,
    setProgress,
    finish,
    cancel,
    isActive,
  };
  const mountedRef = useRef(true);
  const readyRef = useRef(false);
  const releasedRef = useRef(false);
  const terminatedRef = useRef(false);
  const settlingRef = useRef(false);
  const progressRef = useRef(0);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const panResponder = useMemo(() => {
    const updateGesture = (gesture: PanResponderGestureState) => {
      if (settlingRef.current) {
        return;
      }
      const dragDistance = Math.max(240, height * 0.4);
      progressRef.current = Math.max(0, Math.min(1, gesture.dy / dragDistance));
      if (readyRef.current) {
        transitionRef.current.setProgress(progressRef.current);
      }
    };

    const settleGesture = () => {
      if (settlingRef.current) {
        return;
      }
      settlingRef.current = true;
      if (progressRef.current >= threshold) {
        transitionRef.current.finish({
          duration: FINISH_DURATION,
        });
      } else {
        transitionRef.current.cancel({ duration: SNAP_BACK_DURATION });
      }
    };

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !transitionRef.current.isActive &&
        gesture.dy > 4 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
      onPanResponderGrant: async () => {
        readyRef.current = false;
        releasedRef.current = false;
        terminatedRef.current = false;
        settlingRef.current = false;
        progressRef.current = 0;

        const session = await transitionRef.current.beginBack();
        if (!session || !mountedRef.current) {
          return;
        }

        readyRef.current = true;
        transitionRef.current.setProgress(progressRef.current);
        if (terminatedRef.current) {
          transitionRef.current.cancel({ duration: SNAP_BACK_DURATION });
        } else if (releasedRef.current) {
          settleGesture();
        }
      },
      onPanResponderMove: (_event, gesture) => updateGesture(gesture),
      onPanResponderRelease: () => {
        releasedRef.current = true;
        if (readyRef.current) {
          settleGesture();
        }
      },
      onPanResponderTerminate: () => {
        if (settlingRef.current) {
          return;
        }
        releasedRef.current = true;
        terminatedRef.current = true;
        settlingRef.current = true;
        if (readyRef.current) {
          transitionRef.current.cancel({ duration: SNAP_BACK_DURATION });
        }
      },
      onPanResponderTerminationRequest: () => !readyRef.current,
    });
  }, [height, threshold]);

  return (
    <View style={styles.fill}>
      {children}
      <View
        accessible={false}
        style={[styles.handleTouchTarget, { top: insets.top + 58 }]}
        {...panResponder.panHandlers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  handleTouchTarget: {
    position: 'absolute',
    left: '50%',
    width: 72,
    height: 32,
    marginLeft: -36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
