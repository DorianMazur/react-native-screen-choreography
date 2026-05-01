import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  SharedElementTransitionRendererProps,
} from './types';

interface TransitionOverlayProps {
  session: TransitionSessionData | null;
  progress: SharedValue<number>;
  onReady?: () => void;
}

export function TransitionOverlay({
  session,
  progress,
  onReady,
}: TransitionOverlayProps) {
  React.useLayoutEffect(() => {
    if (session && session.pairs.length > 0) {
      onReady?.();
    }
  }, [onReady, session]);

  if (!session || session.pairs.length === 0) {
    return null;
  }

  // Sort pairs by z-index (containers first/back, then other elements on top)
  const sortedPairs = [...session.pairs].sort((a, b) => {
    const aZ = getPairZIndex(a);
    const bZ = getPairZIndex(b);
    return aZ - bZ;
  });

  return (
    <>
      <Animated.View style={styles.overlay} pointerEvents="none">
        {sortedPairs.map((pair) => (
          <StandInRenderer
            key={pair.id}
            pair={pair}
            progress={progress}
            direction={session.direction}
          />
        ))}
      </Animated.View>
    </>
  );
}

function getPairZIndex(pair: ElementTransitionPair): number {
  return pair.transition.zIndex ?? 0;
}

interface StandInRendererProps {
  pair: ElementTransitionPair;
  progress: SharedValue<number>;
  direction: TransitionSessionData['direction'];
}

function StandInRenderer({ pair, progress, direction }: StandInRendererProps) {
  const Renderer = pair.transition.renderer;
  const rendererProps: SharedElementTransitionRendererProps = {
    id: pair.id,
    progress,
    direction,
    zIndex: getPairZIndex(pair),
    source: {
      screenId: pair.source.screenId,
      metrics: pair.sourceMetrics,
      style: pair.source.style,
      content: pair.source.renderContent?.(),
    },
    target: {
      screenId: pair.target.screenId,
      metrics: pair.targetMetrics,
      style: pair.target.style,
      content: pair.target.renderContent?.(),
    },
  };

  return <Renderer {...rendererProps} />;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
});
