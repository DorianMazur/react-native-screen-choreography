import { useCallback, useContext, useLayoutEffect, useState } from 'react';
import { type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { ChoreographyContext } from '../../../../src/core/ChoreographyContext';
import type { BenchmarkCollector } from './collector';
import {
  installMotionObserver,
  type MotionObservation,
  type MotionRequest,
} from './motion';

declare const performance: { now: () => number };

// Reanimated's mapper listener IDs are positive. Each fixture owns a distinct ID.
let nextListenerId = 0;

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
  const [listenerId] = useState(() => --nextListenerId);
  const deliver = useCallback(
    (sample: MotionObservation) => collector.motion(sample),
    [collector]
  );
  useLayoutEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      // Animated reactions run in a later mapper batch. RN cleanup can clear
      // handoff in that batch, losing a successfully completed transition.
      // Shared-value listeners observe each UI mutation synchronously instead.
      installMotionObserver({
        request,
        progress,
        handoff,
        listenerId,
        now: () => performance.now(),
        deliver: (sample) => scheduleOnRN(deliver, sample),
      });
    });
    return () => {
      scheduleOnUI(() => {
        'worklet';
        request.removeListener(listenerId);
        progress.removeListener(listenerId);
        handoff?.removeListener(listenerId);
      });
    };
  }, [request, progress, handoff, listenerId, deliver]);
  return null;
}
