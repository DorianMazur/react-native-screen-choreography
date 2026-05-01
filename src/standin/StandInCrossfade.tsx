import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import type { ElementMetrics } from '../types';

interface StandInCrossfadeProps {
  progress: SharedValue<number>;
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  direction?: 'forward' | 'backward';
  /** Content to show as source (fades out) */
  sourceContent?: React.ReactNode;
  /** Content to show as target (fades in) */
  targetContent?: React.ReactNode;
  /** Progress range for fade [fadeStart, fadeEnd] */
  fadeRange?: [number, number];
  zIndex?: number;
}

export function StandInCrossfade({
  progress,
  sourceMetrics,
  targetMetrics,
  direction = 'forward',
  sourceContent,
  targetContent,
  fadeRange = [0.15, 0.55],
  zIndex = 1,
}: StandInCrossfadeProps) {
  const dx = targetMetrics.pageX - sourceMetrics.pageX;
  const dy = targetMetrics.pageY - sourceMetrics.pageY;

  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );

  const translateStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [0, dx], 'clamp') },
      { translateY: interpolate(t.value, [0, 1], [0, dy], 'clamp') },
    ],
  }));

  const sourceOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, fadeRange, [1, 0], 'clamp'),
  }));

  const targetOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, fadeRange, [0, 1], 'clamp'),
  }));

  const sourceBaseStyle = {
    position: 'absolute' as const,
    left: sourceMetrics.pageX,
    top: sourceMetrics.pageY,
    width: sourceMetrics.width,
    height: sourceMetrics.height,
    zIndex,
  };

  const targetBaseStyle = {
    position: 'absolute' as const,
    left: sourceMetrics.pageX,
    top: sourceMetrics.pageY,
    width: targetMetrics.width,
    height: targetMetrics.height,
    zIndex,
  };

  return (
    <>
      {sourceContent && (
        <Animated.View
          style={[
            styles.container,
            sourceBaseStyle,
            translateStyle,
            sourceOpacity,
          ]}
        >
          {sourceContent}
        </Animated.View>
      )}
      {targetContent && (
        <Animated.View
          style={[
            styles.container,
            targetBaseStyle,
            translateStyle,
            targetOpacity,
          ]}
        >
          {targetContent}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
