import type { ComponentType } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { PortalHost } from 'react-native-teleport';
import { getExpansionProgress } from '../core/expansionProgress';
import { getLiveOverlayHostName } from '../core/liveHostNames';
import type {
  LiveTransition,
  LiveTransitionRendererProps,
  SharedElementTransitionRendererProps,
  SharedElementTransitionSide,
} from '../types';

interface LiveTransitionAdapterSide extends SharedElementTransitionSide {
  metadata?: unknown;
}

interface LiveTransitionAdapterRendererProps extends Omit<
  SharedElementTransitionRendererProps,
  'source' | 'target'
> {
  source: LiveTransitionAdapterSide;
  target: LiveTransitionAdapterSide;
}

export interface MakeLiveTransitionOptions {
  /** Must render the supplied host children exactly once throughout the session. */
  renderer: ComponentType<LiveTransitionRendererProps>;
  /** Overlay stacking order. Defaults to 100, including for custom motion. */
  zIndex?: number;
}

/**
 * Adapts custom motion while the library owns the sole live portal host.
 * Create outside render or memoize, and reuse on both live endpoints.
 */
export function makeLiveTransition({
  renderer: Renderer,
  zIndex = 100,
}: MakeLiveTransitionOptions): LiveTransition {
  function LiveTransitionAdapter({
    id,
    groupId,
    progress,
    direction,
    zIndex: rendererZIndex,
    source,
    target,
  }: LiveTransitionAdapterRendererProps) {
    const sourceSide = {
      screenId: source.screenId,
      metrics: source.metrics,
      style: source.style,
      metadata: source.metadata,
    };
    const targetSide = {
      screenId: target.screenId,
      metrics: target.metrics,
      style: target.style,
      metadata: target.metadata,
    };

    return (
      <Renderer
        id={id}
        groupId={groupId}
        progress={progress}
        direction={direction}
        zIndex={rendererZIndex}
        source={sourceSide}
        target={targetSide}
      >
        <PortalHost
          name={getLiveOverlayHostName(
            source.screenId,
            target.screenId,
            id,
            groupId
          )}
          style={styles.liveHost}
        />
      </Renderer>
    );
  }

  return {
    mode: 'live',
    zIndex,
    renderer: LiveTransitionAdapter,
  } as LiveTransition;
}

function BoundsLiveTransition({
  progress,
  direction,
  source,
  target,
  zIndex,
  children,
}: LiveTransitionRendererProps) {
  const sourceX = source.metrics.pageX;
  const sourceY = source.metrics.pageY;
  const sourceWidth = source.metrics.width;
  const sourceHeight = source.metrics.height;
  const targetX = target.metrics.pageX;
  const targetY = target.metrics.pageY;
  const targetWidth = target.metrics.width;
  const targetHeight = target.metrics.height;
  const timeline = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );
  const animatedStyle = useAnimatedStyle(() => {
    const heightProgress = getExpansionProgress(
      timeline.value,
      sourceHeight,
      targetHeight
    );

    return {
      left: interpolate(timeline.value, [0, 1], [sourceX, targetX], 'clamp'),
      top: interpolate(timeline.value, [0, 1], [sourceY, targetY], 'clamp'),
      width: interpolate(
        timeline.value,
        [0, 1],
        [sourceWidth, targetWidth],
        'clamp'
      ),
      height: interpolate(
        heightProgress,
        [0, 1],
        [sourceHeight, targetHeight],
        'clamp'
      ),
    };
  });

  return (
    <Animated.View style={[styles.liveOverlayHost, { zIndex }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export const defaultLiveTransition = makeLiveTransition({
  renderer: BoundsLiveTransition,
});

const styles = StyleSheet.create({
  liveOverlayHost: {
    position: 'absolute',
    overflow: 'hidden',
  },
  liveHost: {
    ...StyleSheet.absoluteFill,
  },
});
