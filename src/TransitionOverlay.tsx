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
  /** Called once the overlay has committed pairs for the given session. */
  onReady?: (sessionId: string) => void;
}

export function TransitionOverlay({
  session,
  progress,
  onReady,
}: TransitionOverlayProps) {
  const sessionId = session?.id ?? null;
  const hasPairs = !!session && session.pairs.length > 0;

  React.useLayoutEffect(() => {
    if (sessionId && hasPairs) {
      onReady?.(sessionId);
    }
  }, [hasPairs, onReady, sessionId]);

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
      style: pair.sourceSnapshot.style,
      content: pair.sourceSnapshot.content,
    },
    target: {
      screenId: pair.target.screenId,
      metrics: pair.targetMetrics,
      style: pair.targetSnapshot.style,
      content: pair.targetSnapshot.content,
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
