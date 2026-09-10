import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';
import type { SurfaceTransitionStyle } from './resolveSurfaceStyle';

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
 * Surface geometry and styling around a live transition host.
 *
 * Shadow strategy: apply the expanded-side boxShadow statically and only animate
 * `opacity` (GPU-composited on Android via View.setAlpha). Animating
 * boxShadow per-frame causes OutsetBoxShadowDrawable re-creation on every
 * call, which flickers. Opacity fades to 0 near the transition endpoints
 * to prevent double-shadow during handoff.
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
  const expandedBoxShadow = expandedStyle.boxShadow;
  const shadowColor = expandedStyle.backgroundColor ?? 'transparent';

  const t = useDerivedValue(() => {
    return direction === 'backward' ? 1 - progress.value : progress.value;
  });

  const frameStyle = useAnimatedStyle(() => ({
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
  }));

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
      style={[frameStyle, styles.wrapper, { zIndex }]}
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
