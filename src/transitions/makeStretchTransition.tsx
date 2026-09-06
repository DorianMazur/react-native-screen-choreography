import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { StandInElement } from '../standin/StandInElement';
import { resolveSurfaceStyle } from '../standin/resolveSurfaceStyle';
import type { SharedElementTransition } from '../types';

export interface StretchTransitionOptions {
  sourceBorderRadius?: number;
  targetBorderRadius?: number;
  zIndex?: number;
}

export function makeStretchTransition({
  sourceBorderRadius,
  targetBorderRadius,
  zIndex = 2,
}: StretchTransitionOptions = {}): SharedElementTransition {
  return {
    zIndex,
    renderer: function StretchTransition({
      progress,
      direction,
      source,
      target,
      zIndex: rendererZ,
    }) {
      const isBackward = direction === 'backward';
      const expanded = isBackward ? source : target;
      const baseWidth = expanded.metrics.width;
      const baseHeight = expanded.metrics.height;
      const sourceWidth = source.metrics.width;
      const sourceHeight = source.metrics.height;
      const targetWidth = target.metrics.width;
      const targetHeight = target.metrics.height;
      const timeline = useDerivedValue(() =>
        isBackward ? 1 - progress.value : progress.value
      );
      const contentStyle = useAnimatedStyle(() => ({
        transform: [
          {
            scaleX:
              baseWidth > 0
                ? interpolate(
                    timeline.value,
                    [0, 1],
                    [sourceWidth, targetWidth],
                    'clamp'
                  ) / baseWidth
                : 1,
          },
          {
            scaleY:
              baseHeight > 0
                ? interpolate(
                    timeline.value,
                    [0, 1],
                    [sourceHeight, targetHeight],
                    'clamp'
                  ) / baseHeight
                : 1,
          },
        ],
      }));

      return (
        <StandInElement
          progress={progress}
          direction={direction}
          sourceMetrics={source.metrics}
          targetMetrics={target.metrics}
          sourceBorderRadius={
            resolveSurfaceStyle(source.style, {
              borderRadius: isBackward
                ? targetBorderRadius
                : sourceBorderRadius,
            }).borderRadius
          }
          targetBorderRadius={
            resolveSurfaceStyle(target.style, {
              borderRadius: isBackward
                ? sourceBorderRadius
                : targetBorderRadius,
            }).borderRadius
          }
          zIndex={rendererZ}
        >
          <Animated.View
            style={[
              styles.content,
              { width: baseWidth, height: baseHeight },
              contentStyle,
            ]}
          >
            {expanded.content}
          </Animated.View>
        </StandInElement>
      );
    },
  };
}

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
});
