import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';
import type { SurfaceTransitionStyle } from './resolveSurfaceStyle';

interface StandInContainerProps {
  progress: SharedValue<number>;
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  direction?: 'forward' | 'backward';
  sourceStyle?: SurfaceTransitionStyle;
  targetStyle?: SurfaceTransitionStyle;
  children?: React.ReactNode;
}

/**
 * Stand-in for container/card elements during a transition.
 *
 * Shadow strategy: apply the TARGET boxShadow statically and only animate
 * `opacity` (GPU-composited on Android via View.setAlpha). Animating
 * boxShadow per-frame causes OutsetBoxShadowDrawable re-creation on every
 * call, which flickers. Opacity fades to 0 near the transition endpoints
 * to prevent double-shadow during handoff.
 */
export function StandInContainer({
  progress,
  sourceMetrics,
  targetMetrics,
  direction = 'forward',
  sourceStyle = {},
  targetStyle = {},
  children,
}: StandInContainerProps) {
  const sourceRadius = sourceStyle.borderRadius ?? 12;
  const targetRadius = targetStyle.borderRadius ?? 24;

  const bgColor =
    targetStyle.backgroundColor ?? sourceStyle.backgroundColor ?? 'white';

  const targetBoxShadow = targetStyle.boxShadow;

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
      t.value,
      [0, 0.03, 0.1, 0.92, 1.0],
      [0, 0, 1, 1, 0],
      'clamp'
    ),
  }));

  const contentShapeStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      t.value,
      [0, 1],
      [sourceRadius, targetRadius],
      'clamp'
    ),
  }));

  return (
    <Animated.View style={[frameStyle, styles.wrapper]}>
      {targetBoxShadow && (
        <Animated.View
          style={[
            styles.shadowLayer,
            shadowStyle,
            { backgroundColor: bgColor, boxShadow: targetBoxShadow } as any,
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.contentHost,
          contentShapeStyle,
          { backgroundColor: bgColor },
        ]}
      >
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
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  contentHost: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
});
