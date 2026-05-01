import { interpolate, type SharedValue } from 'react-native-reanimated';
import type { ElementMetrics } from '../types';

/**
 * Creates interpolation values for morph animation (bounds + radius + bg).
 * Used for container elements that expand/contract.
 */
export function morphInterpolation(
  progress: number,
  source: ElementMetrics,
  target: ElementMetrics,
  sourceRadius: number,
  targetRadius: number
) {
  'worklet';

  return {
    left: interpolate(progress, [0, 1], [source.pageX, target.pageX]),
    top: interpolate(progress, [0, 1], [source.pageY, target.pageY]),
    width: interpolate(progress, [0, 1], [source.width, target.width]),
    height: interpolate(progress, [0, 1], [source.height, target.height]),
    borderRadius: interpolate(progress, [0, 1], [sourceRadius, targetRadius]),
  };
}

/**
 * Creates a morph style object for use in useAnimatedStyle.
 */
export function createMorphStyle(
  progress: SharedValue<number>,
  source: ElementMetrics,
  target: ElementMetrics,
  config: {
    sourceRadius?: number;
    targetRadius?: number;
    sourceBg?: string;
    targetBg?: string;
  } = {}
) {
  const { sourceRadius = 0, targetRadius = 0 } = config;

  return {
    source,
    target,
    sourceRadius,
    targetRadius,
    progress,
  };
}
