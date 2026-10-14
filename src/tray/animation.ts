import {
  Easing,
  ReduceMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { TrayAnimationConfig } from './types';

const DEFAULT_ANIMATION: TrayAnimationConfig = { type: 'timing' };

export function resolveTrayAnimation(animation = DEFAULT_ANIMATION) {
  if (animation.type === 'spring') {
    const { stiffness = 300, damping = 30 } = animation;
    if (
      !Number.isFinite(stiffness) ||
      stiffness <= 0 ||
      !Number.isFinite(damping) ||
      damping <= 0
    )
      throw new Error(
        'Tray.Stack spring stiffness and damping must be finite numbers greater than zero.'
      );
    return { type: 'spring', stiffness, damping } as const;
  }
  if (animation.type !== 'timing')
    throw new Error('Tray.Stack animation type must be "timing" or "spring".');
  const { duration = 240, easing = Easing.out(Easing.cubic) } = animation;
  if (!Number.isFinite(duration) || duration < 0)
    throw new Error(
      'Tray.Stack animation duration must be a finite number greater than or equal to zero.'
    );
  return { type: 'timing', duration, easing } as const;
}

export type ResolvedTrayAnimation = ReturnType<typeof resolveTrayAnimation>;

export function animateTrayValue(
  value: number,
  animation: ResolvedTrayAnimation,
  onComplete?: (finished?: boolean) => void
) {
  'worklet';
  return animation.type === 'spring'
    ? withSpring(
        value,
        {
          stiffness: animation.stiffness,
          damping: animation.damping,
          mass: 1,
          reduceMotion: ReduceMotion.System,
        },
        onComplete
      )
    : withTiming(
        value,
        {
          duration: animation.duration,
          easing: animation.easing,
          reduceMotion: ReduceMotion.System,
        },
        onComplete
      );
}
