import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  SharedElementTransitionRendererProps,
} from '../types';

interface TransitionOverlayProps {
  session: TransitionSessionData | null;
  progress: SharedValue<number>;
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
          sessionGroupId={session.groupId}
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
  sessionGroupId: string;
}

function StandInRenderer({
  pair,
  progress,
  direction,
  sessionGroupId,
}: StandInRendererProps) {
  const Renderer = pair.transition.renderer;
  const rendererProps: SharedElementTransitionRendererProps = {
    id: pair.id,
    groupId: pair.source.groupId ?? pair.target.groupId ?? sessionGroupId,
    progress,
    direction,
    zIndex: getPairZIndex(pair),
    source: {
      screenId: pair.source.screenId,
      metrics: pair.sourceMetrics,
      style: pair.sourcePresentation.style,
      content: pair.sourcePresentation.content,
    },
    target: {
      screenId: pair.target.screenId,
      metrics: pair.targetMetrics,
      style: pair.targetPresentation.style,
      content: pair.targetPresentation.content,
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
