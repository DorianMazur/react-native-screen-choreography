import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useInteractiveGestureLifecycle } from 'react-native-screen-choreography/core';
import {
  useExampleInteractiveTransition,
  useExampleNavigation,
} from '../runtime';

const DISMISS_DISTANCE = 280;

export function useWalletDismiss(tokenId: string) {
  const controller = useExampleInteractiveTransition();
  const { goBack } = useExampleNavigation();
  const reduceMotion = useReducedMotion();
  const ticket = useRef(0);
  const { begin, update, release } = useInteractiveGestureLifecycle(
    controller,
    {
      scopeKey: tokenId,
      threshold: 0.5,
      velocityImpact: 0,
      duration: reduceMotion ? 1 : undefined,
      onFallbackFinish: () => goBack(),
    }
  );
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !ticket.current &&
          gesture.numberActiveTouches === 1 &&
          gesture.dy > 4 &&
          gesture.dy > Math.abs(gesture.dx),
        onPanResponderGrant: (_event, gesture) => {
          ticket.current = begin();
          update(ticket.current, gesture.dy / DISMISS_DISTANCE);
        },
        onPanResponderMove: (_event, gesture) => {
          if (gesture.numberActiveTouches > 1) {
            release(ticket.current, { cancelled: true });
            ticket.current = 0;
          } else {
            update(ticket.current, gesture.dy / DISMISS_DISTANCE);
          }
        },
        onPanResponderRelease: (_event, gesture) => {
          release(ticket.current, { progress: gesture.dy / DISMISS_DISTANCE });
          ticket.current = 0;
        },
        onPanResponderTerminate: () => {
          release(ticket.current, { cancelled: true });
          ticket.current = 0;
        },
        onPanResponderTerminationRequest: () => false,
      }).panHandlers,
    [begin, update, release]
  );
}
