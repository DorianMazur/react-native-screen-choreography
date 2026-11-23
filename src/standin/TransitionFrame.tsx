import React from 'react';
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';
import {
  transitionGeometryStyle,
  transitionLayoutStyle,
} from './TransitionSurface';

interface TransitionFrameProps {
  progress: SharedValue<number>;
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  children?: React.ReactNode;
  direction?: 'forward' | 'backward';
  /** Custom z-index for layering */
  zIndex?: number;
  /** Optional border radius interpolation */
  sourceBorderRadius?: number;
  targetBorderRadius?: number;
}

export function TransitionFrame({
  progress,
  sourceMetrics,
  targetMetrics,
  children,
  direction = 'forward',
  zIndex = 1,
  sourceBorderRadius,
  targetBorderRadius,
}: TransitionFrameProps) {
  const backward = direction === 'backward';
  const hasRadius =
    sourceBorderRadius !== undefined || targetBorderRadius !== undefined;
  const sRadius = sourceBorderRadius ?? 0;
  const tRadius = targetBorderRadius ?? 0;
  const animateRadius = hasRadius && sRadius !== tRadius;

  const baseStyle = {
    ...transitionLayoutStyle(),
    zIndex,
    ...(hasRadius
      ? {
          overflow: 'hidden' as const,
          ...(animateRadius ? {} : { borderRadius: sRadius }),
        }
      : {}),
  };

  const animatedStyle = useAnimatedStyle(() => {
    const t = backward ? 1 - progress.value : progress.value;
    const geometry = transitionGeometryStyle(sourceMetrics, targetMetrics, t);
    if (!animateRadius) return geometry;
    return {
      ...geometry,
      borderRadius: interpolate(t, [0, 1], [sRadius, tRadius], 'clamp'),
    };
  });

  return (
    <Animated.View style={[baseStyle, animatedStyle]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}
