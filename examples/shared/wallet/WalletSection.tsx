import type { ReactNode } from 'react';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { useChoreographyProgress } from '../runtime';

export function WalletSection({
  children,
  start = 0.3,
  distance = 10,
}: {
  children: ReactNode;
  start?: number;
  distance?: number;
}) {
  const { progress, phase, direction } = useChoreographyProgress();
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => {
    const reveal =
      phase === 'idle'
        ? 1
        : phase === 'preparing' && direction !== 'backward'
          ? 0
          : interpolate(progress.value, [start, 0.95], [0, 1], 'clamp');
    return {
      opacity: reveal,
      transform: [{ translateY: reduceMotion ? 0 : (1 - reveal) * distance }],
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}
