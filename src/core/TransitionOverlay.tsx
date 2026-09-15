import { useLayoutEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type {
  ElementMetrics,
  TransitionAnchor,
  TransitionSessionData,
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
  useLayoutEffect(() => {
    if (id && hasPairs) onReady?.(id);
  }, [id, hasPairs, onReady]);
  if (!session || !hasPairs) return null;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      {[...session.pairs]
        .sort((a, b) => (a.transition.zIndex ?? 0) - (b.transition.zIndex ?? 0))
        .map((pair) => {
          const Renderer = pair.transition.renderer;
          return (
            <Renderer
              key={`${session.id}:${pair.id}`}
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
        })}
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
});

function anchorMetrics({
  pageX,
  pageY,
  width,
  height,
}: ElementMetrics): ElementMetrics {
  return { pageX, pageY, width, height };
}
