import { interpolate } from 'react-native-reanimated';
import type { ElementMetrics } from '../types';

/**
 * Move + resize interpolation for elements that reposition and resize
 * (e.g., icons, images).
 */
export function moveResizeInterpolation(
  progress: number,
  source: ElementMetrics,
  target: ElementMetrics
) {
  'worklet';

  return {
    left: interpolate(progress, [0, 1], [source.pageX, target.pageX]),
    top: interpolate(progress, [0, 1], [source.pageY, target.pageY]),
    width: interpolate(progress, [0, 1], [source.width, target.width]),
    height: interpolate(progress, [0, 1], [source.height, target.height]),
  };
}
