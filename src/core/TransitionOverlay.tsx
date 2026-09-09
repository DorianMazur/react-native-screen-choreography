import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { VisibilityHandoff } from './ElementVisibilityRegistry';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  SharedElementTransitionRendererProps,
} from '../types';

interface TransitionOverlayProps {
  session: TransitionSessionData | null;
  progress: SharedValue<number>;
  handoff: SharedValue<VisibilityHandoff>;
  onReady?: (sessionId: string) => void;
}

export function TransitionOverlay({
  session,
  progress,
  handoff,
  onReady,
}: TransitionOverlayProps) {
  const sessionId = session?.id ?? null;
  const hasPairs = !!session && session.pairs.length > 0;
  const visibilityStyle = useAnimatedStyle(() => ({
    opacity: handoff.value.sessionId === sessionId ? 1 : 0,
  }));

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
    <Animated.View
      style={[styles.overlay, visibilityStyle]}
      pointerEvents="none"
    >
      {sortedPairs.map((pair) => (
        <StandInRenderer
          key={pair.id}
          pair={pair}
          progress={progress}
          direction={session.direction}
          sessionGroupId={session.groupId}
          handoff={handoff}
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
  handoff: SharedValue<VisibilityHandoff>;
}

function StandInRenderer({
  pair,
  progress,
  direction,
  sessionGroupId,
  handoff,
}: StandInRendererProps) {
  const Renderer = pair.transition.renderer;
  const isLive = pair.transition.mode === 'live';
  const visibilityStyle = useAnimatedStyle(() => ({
    opacity: isLive || !handoff.value.completed ? 1 : 0,
  }));
  const source = {
    screenId: pair.source.screenId,
    metrics: pair.sourceMetrics,
    style: pair.sourcePresentation.style,
    content: pair.sourcePresentation.content,
    metadata: pair.sourcePresentation.metadata,
  };
  const target = {
    screenId: pair.target.screenId,
    metrics: pair.targetMetrics,
    style: pair.targetPresentation.style,
    content: pair.targetPresentation.content,
    metadata: pair.targetPresentation.metadata,
  };
  const rendererProps: SharedElementTransitionRendererProps = {
    id: pair.id,
    groupId: pair.source.groupId ?? pair.target.groupId ?? sessionGroupId,
    progress,
    direction,
    zIndex: getPairZIndex(pair),
    source,
    target,
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { zIndex: rendererProps.zIndex },
        visibilityStyle,
      ]}
    >
      <Renderer {...rendererProps} />
    </Animated.View>
  );
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
