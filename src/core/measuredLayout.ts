import type { View } from 'react-native';
import {
  makeMutable,
  measure,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import type { ElementMetrics, NodeHandleRef } from '../types';

export interface MeasuredLayoutEntry {
  id: string;
  ref: NodeHandleRef;
  measurementRef: AnimatedRef<View>;
}

export interface MeasuredLayoutSnapshot {
  metrics: Map<string, ElementMetrics>;
  /** The snapshot belongs to these endpoint instances, not recycled tags. */
  isCurrent: () => boolean;
}

interface MeasuredLayoutRequest {
  entries: MeasuredLayoutEntry[];
  isCurrent: () => boolean;
  cancellers: Set<() => void>;
  timeoutMs?: number;
}

type MeasurementReceiver = (batch: ElementMetrics[] | null) => void;
// Retain RN callbacks until completion; scheduled worklets hold remote refs.
const receivers = new Map<number, MeasurementReceiver>();
let nextRequestId = 0;

function receiveMeasurements(id: number, batch: ElementMetrics[] | null) {
  receivers.get(id)?.(batch);
}

function measureBatchOnUI(
  id: number,
  refs: AnimatedRef<View>[],
  active: SharedValue<boolean>,
  expiresAt: number
) {
  'worklet';
  const attempt = () => {
    'worklet';
    if (!active.value) return;
    if (Date.now() >= expiresAt) {
      active.value = false;
      scheduleOnRN(receiveMeasurements, id, null);
      return;
    }
    const batch: ElementMetrics[] = [];
    try {
      for (const ref of refs) {
        const measured = measure(ref);
        if (
          !measured ||
          !Number.isFinite(measured.pageX) ||
          !Number.isFinite(measured.pageY) ||
          !Number.isFinite(measured.width) ||
          !Number.isFinite(measured.height) ||
          measured.width <= 0 ||
          measured.height <= 0
        ) {
          // Retry the whole batch so endpoints never mix observation frames.
          requestAnimationFrame(attempt);
          return;
        }
        batch.push({
          pageX: measured.pageX,
          pageY: measured.pageY,
          width: measured.width,
          height: measured.height,
        });
      }
      active.value = false;
      scheduleOnRN(receiveMeasurements, id, batch);
    } catch {
      active.value = false;
      scheduleOnRN(receiveMeasurements, id, null);
    }
  };
  attempt();
}

function nodeFor(ref: NodeHandleRef): any {
  return typeof ref === 'function' ? ref() : ref.current;
}

/** Measure every endpoint in one UI task, retrying only unavailable batches. */
export function requestMeasuredLayout({
  entries,
  isCurrent,
  cancellers,
  timeoutMs = 1000,
}: MeasuredLayoutRequest): Promise<MeasuredLayoutSnapshot | null> {
  if (
    !entries.length ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  )
    return Promise.resolve(null);

  try {
    const endpoints = entries.map((entry) => ({
      entry,
      id: entry.id,
      ref: entry.ref,
      measurementRef: entry.measurementRef,
      node: nodeFor(entry.ref),
    }));
    const currentRefs = () => {
      try {
        return endpoints.every(
          ({ entry, id, ref, measurementRef, node }) =>
            !!node &&
            entry.id === id &&
            entry.ref === ref &&
            entry.measurementRef === measurementRef &&
            nodeFor(ref) === node &&
            measurementRef?.current === node
        );
      } catch {
        return false;
      }
    };
    if (!isCurrent() || !currentRefs()) return Promise.resolve(null);

    const id = ++nextRequestId;
    const active = makeMutable(true);
    return new Promise((resolve) => {
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const finish = (snapshot: MeasuredLayoutSnapshot | null) => {
        if (settled) return;
        settled = true;
        receivers.delete(id);
        if (deadline !== undefined) clearTimeout(deadline);
        cancellers.delete(cancel);
        try {
          active.value = false;
        } catch {
          // A disposed UI runtime must not leave the RN caller waiting.
        }
        resolve(snapshot);
      };
      const cancel = () => finish(null);
      receivers.set(id, (batch) => {
        try {
          if (!batch || !isCurrent() || !currentRefs()) {
            finish(null);
            return;
          }
          finish({
            metrics: new Map(
              endpoints.map((endpoint, index) => [endpoint.id, batch[index]!])
            ),
            isCurrent: currentRefs,
          });
        } catch {
          finish(null);
        }
      });
      cancellers.add(cancel);
      deadline = setTimeout(cancel, timeoutMs);
      try {
        scheduleOnUI(
          measureBatchOnUI,
          id,
          endpoints.map((endpoint) => endpoint.measurementRef),
          active,
          Date.now() + timeoutMs
        );
      } catch {
        finish(null);
      }
    });
  } catch {
    return Promise.resolve(null);
  }
}
