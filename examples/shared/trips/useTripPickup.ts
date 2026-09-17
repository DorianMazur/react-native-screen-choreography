import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, useWindowDimensions } from 'react-native';
import {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useExampleInteractiveTransition } from '../runtime';
import type { TripPickupMetadata, TripPickupPoint } from './tripPickup';

const IDLE: TripPickupPoint = {
  active: false,
  x: 0,
  y: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  tilt: 0,
};
type Phase =
  | 'idle'
  | 'waiting'
  | 'preparing'
  | 'held'
  | 'landing'
  | 'restoring';

export function useTripPickup(topInset: number) {
  const interactive = useExampleInteractiveTransition();
  const dimensions = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const pickup = useSharedValue(IDLE);
  const landing = useSharedValue(0);
  const collapse = useSharedValue(0);
  const activityHeight = useSharedValue(300);
  const [pickedUp, setPickedUp] = useState(false);
  const phase = useRef<Phase>('idle');
  const release = useRef<'landing' | 'restoring' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const mounted = useRef(true);
  const latest = useRef({ interactive, dimensions, topInset, reduceMotion });
  latest.current = { interactive, dimensions, topInset, reduceMotion };
  const { isActive, setProgress } = interactive;

  useAnimatedReaction(
    () => collapse.value,
    (value) => {
      if (isActive) setProgress(value);
    },
    [isActive, setProgress]
  );

  // Keep this JS callback alive until Reanimated has delivered completion.
  const completeLanding = useCallback(
    (version: number, restoring: boolean) => {
      if (!mounted.current || attempt.current !== version) return;
      if (restoring) {
        latest.current.interactive.cancel({ duration: 1 });
        pickup.value = IDLE;
        setPickedUp(false);
        phase.current = 'idle';
      } else {
        latest.current.interactive.finish({ duration: 1 });
      }
    },
    [pickup]
  );

  const settle = useCallback(
    (restoring: boolean) => {
      phase.current = restoring ? 'restoring' : 'landing';
      const version = attempt.current;
      const config = {
        duration: latest.current.reduceMotion ? 1 : 500,
        dampingRatio: 1,
      };
      // Animate both tracks together, including a release before pickup has settled.
      collapse.value = withSpring(restoring ? 0 : 1, config);
      landing.value = withSpring(1, config, (finished) => {
        if (finished) scheduleOnRN(completeLanding, version, restoring);
      });
    },
    [collapse, landing, completeLanding]
  );

  useEffect(() => {
    if (!isActive || phase.current !== 'preparing') return;
    if (release.current) {
      settle(release.current === 'restoring');
    } else {
      phase.current = 'held';
      collapse.value = withSpring(1, {
        duration: reduceMotion ? 1 : 320,
        dampingRatio: 1,
      });
    }
  }, [isActive, collapse, reduceMotion, settle]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current += 1;
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(collapse);
      cancelAnimation(landing);
    };
  }, [collapse, landing]);

  const panResponder = useMemo(() => {
    const clearHold = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const drop = (restoring: boolean) => {
      clearHold();
      if (phase.current === 'waiting') phase.current = 'idle';
      else if (phase.current === 'preparing')
        release.current = restoring ? 'restoring' : 'landing';
      else if (phase.current === 'held') settle(restoring);
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) => {
        if (phase.current !== 'idle' || event.nativeEvent.touches.length !== 1)
          return false;
        const y = event.nativeEvent.pageY;
        const {
          topInset: inset,
          dimensions: { height },
        } = latest.current;
        const activityTop = Math.max(inset + 210, height * 0.39);
        // Leave the Back button and the horizontal activity carousel alone.
        return (
          y > inset + 60 &&
          (y < activityTop || y > activityTop + activityHeight.value)
        );
      },
      onPanResponderGrant: (event) => {
        const { pageX: x, pageY: y } = event.nativeEvent;
        const { width, height } = latest.current.dimensions;
        phase.current = 'waiting';
        release.current = null;
        const version = ++attempt.current;
        timer.current = setTimeout(() => {
          timer.current = null;
          phase.current = 'preparing';
          collapse.value = 0;
          landing.value = 0;
          pickup.value = {
            active: true,
            x,
            y,
            anchorX: x / width,
            anchorY: y / height,
            tilt: 0,
          };
          setPickedUp(true);
          latest.current.interactive
            .beginBack()
            .then((session) => {
              if (!mounted.current || attempt.current !== version) return;
              if (!session) {
                phase.current = 'idle';
                pickup.value = IDLE;
                setPickedUp(false);
              }
            })
            .catch(() => {
              if (!mounted.current || attempt.current !== version) return;
              latest.current.interactive.cancel();
              phase.current = 'idle';
              pickup.value = IDLE;
              setPickedUp(false);
            });
        }, 250);
      },
      onPanResponderMove: (event, gesture) => {
        if (event.nativeEvent.touches.length !== 1) {
          drop(true);
          return;
        }
        if (phase.current === 'waiting') {
          if (Math.hypot(gesture.dx, gesture.dy) > 10) drop(true);
          return;
        }
        if (phase.current !== 'preparing' && phase.current !== 'held') return;
        pickup.value = {
          ...pickup.value,
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
          tilt: latest.current.reduceMotion
            ? 0
            : Math.max(-3, Math.min(3, gesture.dx / 40)),
        };
      },
      onPanResponderRelease: () => drop(false),
      onPanResponderTerminate: () => drop(true),
      onPanResponderTerminationRequest: () =>
        phase.current === 'waiting' || phase.current === 'idle',
    });
  }, [activityHeight, collapse, landing, pickup, settle]);

  const metadata = useMemo<TripPickupMetadata>(
    () => ({ pickup, landing, activityHeight }),
    [pickup, landing, activityHeight]
  );
  const photoTop = topInset + 60;
  const activitiesTop = Math.max(topInset + 210, dimensions.height * 0.39);
  const lowerPhotoStyle = useAnimatedStyle(() => ({
    top: activitiesTop + activityHeight.value,
  }));
  return {
    panHandlers: panResponder.panHandlers,
    metadata,
    pickedUp,
    upperPhotoStyle: { top: photoTop, height: activitiesTop - photoTop },
    lowerPhotoStyle,
  };
}
