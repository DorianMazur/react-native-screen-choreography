import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import type { LiveTransitionRendererProps } from 'react-native-screen-choreography/core';
import { makeLiveTransition } from '../runtime';

export const LIVE_GEOMETRY_WIDTH = 160;
export const LIVE_GEOMETRY_HEIGHT = 64;
export const LIVE_GEOMETRY_TARGET_WIDTH = 280;
export const LIVE_GEOMETRY_TARGET_HEIGHT = 112;

export const liveGeometryMetadata = {
  kind: 'music-live-geometry',
  layoutWidth: LIVE_GEOMETRY_WIDTH,
  layoutHeight: LIVE_GEOMETRY_HEIGHT,
} as const;

function readLiveGeometryMetadata(
  value: unknown
): { layoutWidth: number; layoutHeight: number } | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === liveGeometryMetadata.kind &&
    'layoutWidth' in value &&
    typeof value.layoutWidth === 'number' &&
    Number.isFinite(value.layoutWidth) &&
    value.layoutWidth > 0 &&
    'layoutHeight' in value &&
    typeof value.layoutHeight === 'number' &&
    Number.isFinite(value.layoutHeight) &&
    value.layoutHeight > 0
  ) {
    return {
      layoutWidth: value.layoutWidth,
      layoutHeight: value.layoutHeight,
    };
  }
  return null;
}

function LiveGeometryRenderer({
  children,
  progress,
  direction,
  source,
  target,
  zIndex,
}: LiveTransitionRendererProps) {
  const sourceLayout = readLiveGeometryMetadata(source.metadata);
  const targetLayout = readLiveGeometryMetadata(target.metadata);
  const metadataMatches =
    sourceLayout &&
    targetLayout &&
    sourceLayout.layoutWidth === targetLayout.layoutWidth &&
    sourceLayout.layoutHeight === targetLayout.layoutHeight;
  const layoutWidth = metadataMatches
    ? sourceLayout.layoutWidth
    : LIVE_GEOMETRY_WIDTH;
  const layoutHeight = metadataMatches
    ? sourceLayout.layoutHeight
    : LIVE_GEOMETRY_HEIGHT;
  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );
  const animatedStyle = useAnimatedStyle(() => ({
    left: interpolate(
      t.value,
      [0, 1],
      [source.metrics.pageX, target.metrics.pageX],
      'clamp'
    ),
    top: interpolate(
      t.value,
      [0, 1],
      [source.metrics.pageY, target.metrics.pageY],
      'clamp'
    ),
    transform: [
      {
        scaleX: interpolate(
          t.value,
          [0, 1],
          [
            source.metrics.width / layoutWidth,
            target.metrics.width / layoutWidth,
          ],
          'clamp'
        ),
      },
      {
        scaleY: interpolate(
          t.value,
          [0, 1],
          [
            source.metrics.height / layoutHeight,
            target.metrics.height / layoutHeight,
          ],
          'clamp'
        ),
      },
      {
        rotateZ: `${interpolate(t.value, [0, 0.5, 1], [0, -3, 0], 'clamp')}deg`,
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.portal,
        { width: layoutWidth, height: layoutHeight, zIndex },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export const liveGeometryTransition = makeLiveTransition({
  renderer: LiveGeometryRenderer,
  zIndex: 4,
});

const styles = StyleSheet.create({
  portal: {
    position: 'absolute',
    transformOrigin: 'top left',
  },
});
