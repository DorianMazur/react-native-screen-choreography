import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';
import type { SurfaceTransitionStyle } from './resolveSurfaceStyle';
export function transitionLayoutStyle(): ViewStyle {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
  };
}

export function transitionFrameSize(
  source: ElementMetrics,
  target: ElementMetrics,
  timeline: number
): { width: number; height: number } {
  'worklet';
  const t = Math.max(0, Math.min(1, timeline));
  return {
    width: source.width + (target.width - source.width) * t,
    height: source.height + (target.height - source.height) * t,
  };
}

/** Translate position while allowing live content to reflow as dimensions change. */
export function transitionGeometryStyle(
  source: ElementMetrics,
  target: ElementMetrics,
  timeline: number
): ViewStyle {
  'worklet';
  const t = Math.max(0, Math.min(1, timeline));
  const x = source.pageX + (target.pageX - source.pageX) * t;
  const y = source.pageY + (target.pageY - source.pageY) * t;
  const { width, height } = transitionFrameSize(source, target, t);
  return {
    width,
    height,
    transform: [{ translateX: x }, { translateY: y }],
  };
}

interface TransitionSurfaceProps {
  progress: SharedValue<number>;
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  direction?: 'forward' | 'backward';
  sourceStyle?: SurfaceTransitionStyle;
  targetStyle?: SurfaceTransitionStyle;
  children?: React.ReactNode;
  zIndex?: number;
}

/**
 * Interpolates bounds, color, and radius around a live transition host.
 * Fades the expanded endpoint's shadow out at both handoffs to avoid doubling it.
 */
export function TransitionSurface({
  progress,
  sourceMetrics,
  targetMetrics,
  direction = 'forward',
  sourceStyle = {},
  targetStyle = {},
  children,
  zIndex = 0,
}: TransitionSurfaceProps) {
  const sourceRadius = sourceStyle.borderRadius ?? 0;
  const targetRadius = targetStyle.borderRadius ?? 0;
  const sourceColor = sourceStyle.backgroundColor ?? 'transparent';
  const targetColor = targetStyle.backgroundColor ?? 'transparent';
  const expandedStyle = direction === 'backward' ? sourceStyle : targetStyle;
  // Keep boxShadow static: Android recreates its drawable when parameters change.
  const expandedBoxShadow = expandedStyle.boxShadow;
  const shadowColor = expandedStyle.backgroundColor ?? 'transparent';

  const t = useDerivedValue(() => {
    return direction === 'backward' ? 1 - progress.value : progress.value;
  });

  const layoutStyle = transitionLayoutStyle();
  const frameStyle = useAnimatedStyle(() =>
    transitionGeometryStyle(sourceMetrics, targetMetrics, t.value)
  );

  const shadowStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      t.value,
      [0, 1],
      [sourceRadius, targetRadius],
      'clamp'
    ),
    opacity: interpolate(
      progress.value,
      [0, 0.08, 0.92, 1],
      [0, 1, 1, 0],
      'clamp'
    ),
  }));

  const contentShapeStyle = useAnimatedStyle(() => ({
    backgroundColor:
      sourceColor === targetColor
        ? sourceColor
        : interpolateColor(
            Math.max(0, Math.min(1, t.value)),
            [0, 1],
            [sourceColor, targetColor]
          ),
    borderRadius: interpolate(
      t.value,
      [0, 1],
      [sourceRadius, targetRadius],
      'clamp'
    ),
  }));

  return (
    <Animated.View
      style={[styles.wrapper, layoutStyle, frameStyle, { zIndex }]}
      pointerEvents="none"
    >
      {expandedBoxShadow && (
        <Animated.View
          style={[
            styles.shadowLayer,
            shadowStyle,
            { backgroundColor: shadowColor, boxShadow: expandedBoxShadow },
          ]}
        />
      )}
      <Animated.View style={[styles.contentHost, contentShapeStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    overflow: 'visible',
  },
  shadowLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'visible',
  },
  contentHost: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
});
