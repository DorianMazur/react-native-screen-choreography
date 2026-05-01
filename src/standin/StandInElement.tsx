import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';

interface StandInElementProps {
  progress: SharedValue<number>;
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  children?: React.ReactNode;
  sourceContent?: React.ReactNode;
  targetContent?: React.ReactNode;
  direction?: 'forward' | 'backward';
  /** Custom z-index for layering */
  zIndex?: number;
  /** Optional border radius interpolation */
  sourceBorderRadius?: number;
  targetBorderRadius?: number;
  fadeRange?: [number, number];
}

export function StandInElement({
  progress,
  sourceMetrics,
  targetMetrics,
  children,
  sourceContent,
  targetContent,
  direction = 'forward',
  zIndex = 1,
  sourceBorderRadius,
  targetBorderRadius,
  fadeRange = [0.15, 0.55],
}: StandInElementProps) {
  const hasRadius =
    sourceBorderRadius !== undefined || targetBorderRadius !== undefined;
  const sRadius = sourceBorderRadius ?? 0;
  const tRadius = targetBorderRadius ?? 0;

  const baseStyle = {
    position: 'absolute' as const,
    zIndex,
    ...(hasRadius ? { overflow: 'hidden' as const } : {}),
  };

  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );

  const animatedStyle = useAnimatedStyle(() => ({
    left: interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.pageX, targetMetrics.pageX],
      'clamp'
    ),
    top: interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.pageY, targetMetrics.pageY],
      'clamp'
    ),
    width: interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.width, targetMetrics.width],
      'clamp'
    ),
    height: interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.height, targetMetrics.height],
      'clamp'
    ),
    ...(hasRadius
      ? {
          borderRadius: interpolate(
            t.value,
            [0, 1],
            [sRadius, tRadius],
            'clamp'
          ),
        }
      : {}),
  }));

  const sourceContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, fadeRange, [1, 0], 'clamp'),
  }));

  const targetContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, fadeRange, [0, 1], 'clamp'),
  }));

  return (
    <Animated.View style={[baseStyle, animatedStyle]}>
      {children}
      {!children && sourceContent ? (
        <Animated.View style={[styles.content, sourceContentStyle]}>
          {sourceContent}
        </Animated.View>
      ) : null}
      {!children && targetContent ? (
        <Animated.View style={[styles.content, targetContentStyle]}>
          {targetContent}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
