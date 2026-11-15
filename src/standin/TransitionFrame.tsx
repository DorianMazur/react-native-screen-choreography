import React from 'react';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';
import {
  prepareBorderGeometry,
  interpolateBorder,
  type BorderGeometry,
} from './borderGeometry';
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
  sourceStyle?: BorderGeometry;
  targetStyle?: BorderGeometry;
  /** A uniform radius overrides this endpoint's individual corners. */
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
  sourceStyle,
  targetStyle,
  sourceBorderRadius,
  targetBorderRadius,
}: TransitionFrameProps) {
  const { radii, border } = prepareBorderGeometry(
    sourceStyle,
    targetStyle,
    sourceBorderRadius,
    targetBorderRadius
  );

  const baseStyle = {
    ...transitionLayoutStyle(),
    zIndex,
    ...(radii.length ? { overflow: 'hidden' as const } : {}),
  };

  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );

  const animatedStyle = useAnimatedStyle(() => ({
    ...transitionGeometryStyle(sourceMetrics, targetMetrics, t.value),
    ...interpolateBorder(border, t.value),
  }));

  return (
    <Animated.View style={[baseStyle, animatedStyle]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}
