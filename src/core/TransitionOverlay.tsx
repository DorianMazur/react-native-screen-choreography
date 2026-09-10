import React from 'react';
import {
  PresentationReadiness,
  PresentationReadinessContext,
} from './PresentationReadiness';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { VisibilityHandoff } from './ElementVisibilityRegistry';
import { TransitionPresentationContext } from './TransitionPresentationContext';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  SharedElementTransitionRendererProps,
  TransitionAnchor,
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

  const readiness = React.useMemo(
    () =>
      new PresentationReadiness(() => {
        if (sessionId && hasPairs) onReady?.(sessionId);
      }),
    [sessionId, hasPairs, onReady]
  );
  // Child layout effects register image blockers before the parent commits.
  React.useLayoutEffect(() => readiness.mount(), [readiness]);

  if (!session || session.pairs.length === 0) {
    return null;
  }

  const sortedPairs = [...session.pairs].sort((a, b) => {
    const aZ = getPairZIndex(a);
    const bZ = getPairZIndex(b);
    return aZ - bZ;
  });
  const anchors: Record<string, TransitionAnchor> = Object.create(null);
  for (const pair of session.pairs) {
    if (pair.sourcePresent === false || pair.targetPresent === false) continue;
    anchors[pair.id] = {
      collapsed:
        session.direction === 'forward'
          ? pair.sourceMetrics
          : pair.targetMetrics,
      expanded:
        session.direction === 'forward'
          ? pair.targetMetrics
          : pair.sourceMetrics,
    };
  }

  return (
    <PresentationReadinessContext.Provider value={readiness}>
      <Animated.View
        style={[styles.overlay, visibilityStyle]}
        pointerEvents="none"
      >
        {sortedPairs.map((pair) => (
          <StandInRenderer
            key={`${session.id}:${pair.id}`}
            pair={pair}
            progress={progress}
            direction={session.direction}
            sessionGroupId={session.groupId}
            handoff={handoff}
            anchors={anchors}
          />
        ))}
      </Animated.View>
    </PresentationReadinessContext.Provider>
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
  anchors: Readonly<Record<string, TransitionAnchor>>;
}

function StandInRenderer({
  pair,
  progress,
  direction,
  sessionGroupId,
  handoff,
  anchors,
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
    present: pair.sourcePresent !== false,
  };
  const target = {
    screenId: pair.target.screenId,
    metrics: pair.targetMetrics,
    style: pair.targetPresentation.style,
    content: pair.targetPresentation.content,
    metadata: pair.targetPresentation.metadata,
    present: pair.targetPresent !== false,
  };
  const rendererProps: SharedElementTransitionRendererProps = {
    id: pair.id,
    groupId: pair.source.groupId ?? pair.target.groupId ?? sessionGroupId,
    progress,
    direction,
    zIndex: getPairZIndex(pair),
    source,
    target,
    anchors,
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
      <TransitionPresentationContext.Provider value={!isLive}>
        <Renderer {...rendererProps} />
      </TransitionPresentationContext.Provider>
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
