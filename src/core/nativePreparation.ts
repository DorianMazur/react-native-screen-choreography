import { findNodeHandle, Platform } from 'react-native';
import NativePreparation from '../native/NativeChoreographyPreparation';
import type { ElementMetrics, NodeHandleRef } from '../types';
import { measureElementsBatched, type BatchMeasureEntry } from './measurement';
import type { PreparationTrace } from './preparationTrace';

let requestCounter = 0;
const NATIVE_TIMEOUT_MS = 500;

export function hasNativePreparation(): boolean {
  return (
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    NativePreparation != null
  );
}

function nodeFor(ref: NodeHandleRef): unknown {
  try {
    return typeof ref === 'function' ? ref() : ref.current;
  } catch {
    return null;
  }
}

function tagFor(ref: NodeHandleRef): number | null {
  try {
    const node = nodeFor(ref) as Parameters<typeof findNodeHandle>[0];
    const tag = node ? findNodeHandle(node) : null;
    return typeof tag === 'number' && Number.isInteger(tag) && tag > 0
      ? tag
      : null;
  } catch {
    return null;
  }
}

export type PreparedTargets = Map<
  string,
  BatchMeasureEntry & { metrics: ElementMetrics; isCurrent?: () => boolean }
>;

/** Native attachment/layout validation, then a single read in RN's coordinate space. */
export async function prepareNativeTargets({
  screenRef,
  entries,
  isCurrent,
  cancellers,
  trace,
  onTimeout,
}: {
  screenRef: NodeHandleRef | undefined;
  entries: BatchMeasureEntry[];
  isCurrent: () => boolean;
  cancellers: Set<() => void>;
  trace?: PreparationTrace;
  onTimeout?: () => void;
}): Promise<PreparedTargets | null> {
  if (
    !hasNativePreparation() ||
    !screenRef ||
    entries.length === 0 ||
    !isCurrent()
  )
    return null;
  const screenNode = nodeFor(screenRef);
  const nodes = entries.map((entry) => nodeFor(entry.ref));
  const screenTag = tagFor(screenRef);
  const tags = entries.map((entry) => tagFor(entry.ref));
  if (screenTag === null || tags.some((tag) => tag === null)) return null;
  const currentTagsMatch = () =>
    isCurrent() &&
    nodeFor(screenRef) === screenNode &&
    tagFor(screenRef) === screenTag &&
    entries.every(
      (entry, index) =>
        nodeFor(entry.ref) === nodes[index] && tagFor(entry.ref) === tags[index]
    );
  const requestId = `preparation_${++requestCounter}`;
  const endNative = trace?.start('native-layout');
  let cancel = () => {};
  try {
    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      cancel = () => {
        try {
          NativePreparation!.cancel(requestId);
        } catch {
          /* module teardown */
        }
        finish(false);
      };
      // Native also owns a deadline; this guard covers module teardown/rejection.
      const timer = setTimeout(() => {
        onTimeout?.();
        cancel();
      }, NATIVE_TIMEOUT_MS + 50);
      cancellers.add(cancel);
      try {
        NativePreparation!
          .awaitLayout(
            requestId,
            screenTag,
            tags as number[],
            NATIVE_TIMEOUT_MS
          )
          .then((result) => {
            if (settled) return;
            if (!result.ready && result.elapsedMs >= NATIVE_TIMEOUT_MS)
              onTimeout?.();
            endNative?.({
              ready: result.ready,
              samples: result.sampleCount,
              nativeElapsedMs: result.elapsedMs,
            });
            finish(result.ready);
          }, cancel);
      } catch {
        cancel();
      }
    });
    endNative?.();
    if (!ready || !currentTagsMatch()) return null;
    const endMeasure = trace?.start('native-target-measure');
    const results = await measureElementsBatched(entries);
    endMeasure?.();
    if (!currentTagsMatch()) return null;
    const prepared: PreparedTargets = new Map();
    for (const entry of entries) {
      const metrics = results.get(entry.id);
      if (
        !metrics ||
        !Object.values(metrics).every(Number.isFinite) ||
        metrics.width <= 0 ||
        metrics.height <= 0
      )
        return null;
      prepared.set(entry.id, {
        ...entry,
        metrics,
        isCurrent: currentTagsMatch,
      });
    }
    return prepared;
  } finally {
    cancellers.delete(cancel);
  }
}
