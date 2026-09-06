import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import type {
  SharedElementTransition,
  SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';
import { resolveSurfaceStyle } from '../runtime';
import { theme } from '../theme';

function ExpandingBackground({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  const sourceX = source.metrics.pageX;
  const sourceY = source.metrics.pageY;
  const sourceWidth = source.metrics.width;
  const sourceHeight = source.metrics.height;
  const targetX = target.metrics.pageX;
  const targetY = target.metrics.pageY;
  const targetWidth = target.metrics.width;
  const targetHeight = target.metrics.height;
  const sourceSurface = resolveSurfaceStyle(source.style, {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
  });
  const targetSurface = resolveSurfaceStyle(target.style, {
    backgroundColor: theme.surface,
    borderRadius: 0,
  });
  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );
  const animatedStyle = useAnimatedStyle(() => ({
    left: interpolate(t.value, [0, 1], [sourceX, targetX], 'clamp'),
    top: interpolate(t.value, [0, 1], [sourceY, targetY], 'clamp'),
    width: interpolate(t.value, [0, 1], [sourceWidth, targetWidth], 'clamp'),
    height: interpolate(t.value, [0, 1], [sourceHeight, targetHeight], 'clamp'),
    borderRadius: interpolate(
      t.value,
      [0, 1],
      [sourceSurface.borderRadius ?? 0, targetSurface.borderRadius ?? 0],
      'clamp'
    ),
    backgroundColor: interpolateColor(
      t.value,
      [0, 1],
      [
        sourceSurface.backgroundColor ?? theme.surface,
        targetSurface.backgroundColor ?? theme.surface,
      ]
    ),
  }));

  return <Animated.View style={[styles.layer, { zIndex }, animatedStyle]} />;
}

function AnchoredContent({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  const sourceX = source.metrics.pageX;
  const sourceY = source.metrics.pageY;
  const sourceWidth = source.metrics.width;
  const sourceHeight = source.metrics.height;
  const targetX = target.metrics.pageX;
  const targetY = target.metrics.pageY;
  const targetWidth = target.metrics.width;
  const targetHeight = target.metrics.height;
  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );
  const expandedSide = direction === 'backward' ? source : target;
  const clipStyle = useAnimatedStyle(() => ({
    left: interpolate(t.value, [0, 1], [sourceX, targetX], 'clamp'),
    top: interpolate(t.value, [0, 1], [sourceY, targetY], 'clamp'),
    width: interpolate(t.value, [0, 1], [sourceWidth, targetWidth], 'clamp'),
    height: interpolate(t.value, [0, 1], [sourceHeight, targetHeight], 'clamp'),
  }));

  return (
    <Animated.View style={[styles.layer, { zIndex }, clipStyle]}>
      <Animated.View
        style={[
          styles.fixedContent,
          {
            width: expandedSide.metrics.width,
            height: expandedSide.metrics.height,
          },
        ]}
      >
        {expandedSide.content}
      </Animated.View>
    </Animated.View>
  );
}

function MovingItem({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  const sourceX = source.metrics.pageX;
  const sourceY = source.metrics.pageY;
  const sourceWidth = source.metrics.width;
  const sourceHeight = source.metrics.height;
  const targetX = target.metrics.pageX;
  const targetY = target.metrics.pageY;
  const targetWidth = target.metrics.width;
  const targetHeight = target.metrics.height;
  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );
  const animatedStyle = useAnimatedStyle(() => ({
    left: interpolate(t.value, [0, 1], [sourceX, targetX], 'clamp'),
    top: interpolate(t.value, [0, 1], [sourceY, targetY], 'clamp'),
    width: interpolate(t.value, [0, 1], [sourceWidth, targetWidth], 'clamp'),
    height: interpolate(t.value, [0, 1], [sourceHeight, targetHeight], 'clamp'),
  }));

  return (
    <Animated.View style={[styles.layer, { zIndex }, animatedStyle]}>
      {source.content}
    </Animated.View>
  );
}

export const musicBackgroundTransition: SharedElementTransition = {
  zIndex: 0,
  renderer: ExpandingBackground,
};

export const musicItemTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: MovingItem,
};

export const musicContentTransition: SharedElementTransition = {
  zIndex: 1,
  renderer: AnchoredContent,
};

function FadingHeader({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  const expandedSide = direction === 'backward' ? source : target;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp'),
  }));

  return (
    <Animated.View
      style={[
        styles.layer,
        {
          zIndex,
          left: expandedSide.metrics.pageX,
          top: expandedSide.metrics.pageY,
          width: expandedSide.metrics.width,
          height: expandedSide.metrics.height,
        },
        animatedStyle,
      ]}
    >
      {expandedSide.content}
    </Animated.View>
  );
}

export const musicHeaderTransition: SharedElementTransition = {
  zIndex: 3,
  renderer: FadingHeader,
};

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    overflow: 'hidden',
  },
  fixedContent: {
    flex: 1,
  },
});
