import { interpolate } from 'react-native-reanimated';
import type { ElementMetrics } from '../types';

/**
 * Cross-fade interpolation for text and content elements.
 * Source fades out while target fades in, at interpolated positions.
 */
export function crossfadeInterpolation(
  progress: number,
  source: ElementMetrics,
  target: ElementMetrics,
  fadeRange: [number, number] = [0.15, 0.55]
) {
  'worklet';

  const position = {
    left: interpolate(progress, [0, 1], [source.pageX, target.pageX]),
    top: interpolate(progress, [0, 1], [source.pageY, target.pageY]),
    width: interpolate(progress, [0, 1], [source.width, target.width]),
    height: interpolate(progress, [0, 1], [source.height, target.height]),
  };

  const sourceOpacity = interpolate(
    progress,
    [fadeRange[0], fadeRange[1]],
    [1, 0],
    'clamp'
  );

  const targetOpacity = interpolate(
    progress,
    [fadeRange[0], fadeRange[1]],
    [0, 1],
    'clamp'
  );

  return {
    ...position,
    sourceOpacity,
    targetOpacity,
  };
}
