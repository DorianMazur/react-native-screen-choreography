import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import NativeScrollTrack, {
  type ScrollAnchor,
} from '../native/ScreenChoreographyScrollTrackNativeComponent';
import type { ReverseHandoffState } from './ReverseTransitionHandoff';
import type {
  ElementMetrics,
  ElementTransitionPair,
  TransitionAnchor,
  TransitionSessionData,
} from '../types';

const AnimatedScrollTrack = Animated.createAnimatedComponent(NativeScrollTrack);

function ScrollTrack({
  anchors,
  sessionId,
  backward,
  reverseHandoff,
  zIndex,
  children,
}: {
  anchors: readonly ScrollAnchor[];
  sessionId: string;
  backward: boolean;
  reverseHandoff?: SharedValue<ReverseHandoffState | null>;
  zIndex: number;
  children: ReactNode;
}) {
  const animatedProps = useAnimatedProps(() => ({
    following: backward || reverseHandoff?.value?.sessionId === sessionId,
  }));
  return (
    <AnimatedScrollTrack
      anchors={anchors}
      animatedProps={animatedProps}
      following={backward}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex }]}
    >
      {children}
    </AnimatedScrollTrack>
  );
}

// Settlement keeps renderer inputs and host identity, never endpoint refs.
export type OverlayPresentation = Omit<TransitionSessionData, 'pairs'> & {
  pairs: Array<
    Omit<ElementTransitionPair, 'source' | 'target'> & {
      source: Pick<ElementTransitionPair['source'], 'screenId'>;
      target: Pick<ElementTransitionPair['target'], 'screenId'>;
    }
  >;
};

export function retainOverlayPresentation(
  session: TransitionSessionData
): OverlayPresentation {
  return {
    id: session.id,
    groupId: session.groupId,
    sourceScreenId: session.sourceScreenId,
    targetScreenId: session.targetScreenId,
    state: session.state,
    direction: session.direction,
    progress: session.progress,
    reducedMotion: session.reducedMotion,
    pairs: session.pairs.map((pair) => ({
      id: pair.id,
      source: { screenId: pair.source.screenId },
      target: { screenId: pair.target.screenId },
      sourceMetrics: pair.sourceMetrics,
      targetMetrics: pair.targetMetrics,
      sourcePresentation: pair.sourcePresentation,
      targetPresentation: pair.targetPresentation,
      transition: pair.transition,
      collapsedScrollAnchors: pair.collapsedScrollAnchors,
    })),
  };
}

interface TransitionOverlayProps {
  session: OverlayPresentation | null;
  progress: SharedValue<number>;
  reverseHandoff?: SharedValue<ReverseHandoffState | null>;
  onReady?: (sessionId: string) => void;
}

export function TransitionOverlay({
  session,
  progress,
  onReady,
  reverseHandoff,
}: TransitionOverlayProps) {
  const pairs = session?.pairs;
  const direction = session?.direction;
  const anchors = useMemo(() => {
    const geometry: Partial<Record<string, TransitionAnchor>> =
      Object.create(null);
    const backward = direction === 'backward';
    for (const pair of pairs ?? []) {
      geometry[pair.id] = {
        collapsed: anchorMetrics(
          backward ? pair.targetMetrics : pair.sourceMetrics
        ),
        expanded: anchorMetrics(
          backward ? pair.sourceMetrics : pair.targetMetrics
        ),
      };
    }
    return geometry;
  }, [pairs, direction]);
  const id = session?.id;
  const hasPairs = Boolean(session?.pairs.length);
  // Hosts mount empty while preparing; content arrives with the active commit.
  const active = session?.state === 'active';
  const timing = session?.presentationTiming;
  useLayoutEffect(() => {
    if (timing && hasPairs && !session?.reducedMotion) {
      timing.hostsCommitAtMs ??= globalThis.performance.now();
      if (active) timing.contentCommitAtMs ??= globalThis.performance.now();
    }
    if (id && hasPairs && active) onReady?.(id);
  }, [id, hasPairs, active, onReady, timing, session?.reducedMotion]);
  if (!session || !hasPairs || session.reducedMotion) return null;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      {[...session.pairs]
        .sort((a, b) => (a.transition.zIndex ?? 0) - (b.transition.zIndex ?? 0))
        .map((pair) => {
          const Renderer = pair.transition.renderer;
          const trackKey = `${session.id}:${pair.id}`;
          const renderer = (
            <Renderer
              key={trackKey}
              id={pair.id}
              groupId={session.groupId}
              progress={progress}
              anchors={anchors}
              direction={session.direction}
              zIndex={pair.transition.zIndex ?? 0}
              source={{
                screenId: pair.source.screenId,
                metrics: pair.sourceMetrics,
                style: pair.sourcePresentation.style,
                metadata: pair.sourcePresentation.metadata,
              }}
              target={{
                screenId: pair.target.screenId,
                metrics: pair.targetMetrics,
                style: pair.targetPresentation.style,
                metadata: pair.targetPresentation.metadata,
              }}
            />
          );
          if (!pair.collapsedScrollAnchors?.length) return renderer;
          return (
            <ScrollTrack
              key={trackKey}
              anchors={pair.collapsedScrollAnchors}
              sessionId={session.id}
              backward={direction === 'backward'}
              reverseHandoff={reverseHandoff}
              zIndex={pair.transition.zIndex ?? 0}
            >
              {renderer}
            </ScrollTrack>
          );
        })}
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 9999 },
});

function anchorMetrics({
  pageX,
  pageY,
  width,
  height,
}: ElementMetrics): ElementMetrics {
  return { pageX, pageY, width, height };
}
