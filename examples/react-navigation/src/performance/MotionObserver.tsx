import { useCallback, useContext } from 'react';
import {
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyContext } from '../../../../src/core/ChoreographyContext';
import type { BenchmarkCollector } from './collector';
import {
  observeMotion,
  type MotionObservation,
  type MotionRequest,
} from './motion';

declare const performance: { now: () => number };

/** Benchmark-only observer, mounted before the first tap; no per-frame RN calls. */
export function MotionObserver({
  request,
  collector,
}: {
  request: SharedValue<MotionRequest | null>;
  collector: BenchmarkCollector;
}) {
  const context = useContext(ChoreographyContext)!;
  const { progress } = context;
  const handoff = context.progressOwnership.handoff;
  const observation = useSharedValue<MotionObservation | null>(null);
  const deliver = useCallback(
    (sample: MotionObservation) => collector.motion(sample),
    [collector]
  );
  useAnimatedReaction(
    () => ({
      request: request.value,
      progress: progress.value,
      handoff: handoff?.value,
    }),
    (current) => {
      if (!current.request) return;
      const previous = observation.value;
      const next = observeMotion(
        current.request,
        previous,
        current.progress,
        current.handoff,
        performance.now()
      );
      observation.value = next;
      if (
        next.handoffMs !== null &&
        (previous?.requestId !== next.requestId || previous.handoffMs === null)
      )
        scheduleOnRN(deliver, next);
    },
    [request, progress, handoff, deliver]
  );
  return null;
}
