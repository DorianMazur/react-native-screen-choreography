import { StandInContainer } from '../standin/StandInContainer';
import { resolveSurfaceStyle } from '../standin/resolveSurfaceStyle';
import type { SharedElementTransition } from '../types';

export interface SurfaceTransitionFallback {
  backgroundColor?: string;
  borderRadius?: number;
}

export function makeSurfaceTransition(
  collapsedFallback: SurfaceTransitionFallback = {},
  expandedFallback: SurfaceTransitionFallback = {}
): SharedElementTransition {
  return {
    zIndex: 0,
    renderer: function SurfaceTransition({
      progress,
      direction,
      source,
      target,
      zIndex,
    }) {
      const isBackward = direction === 'backward';
      return (
        <StandInContainer
          progress={progress}
          direction={direction}
          sourceMetrics={source.metrics}
          targetMetrics={target.metrics}
          sourceStyle={resolveSurfaceStyle(
            source.style,
            isBackward ? expandedFallback : collapsedFallback
          )}
          targetStyle={resolveSurfaceStyle(
            target.style,
            isBackward ? collapsedFallback : expandedFallback
          )}
          zIndex={zIndex}
        />
      );
    },
  };
}
