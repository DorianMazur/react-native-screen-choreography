import type { AnimatedRef } from 'react-native-reanimated';
import { measure } from 'react-native-reanimated';
import { scheduleOnUI, scheduleOnRN } from 'react-native-worklets';
import type { ElementMetrics } from './types';
import { MEASUREMENT_TIMEOUT } from './constants';

type RawMetrics = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

function normalizeMetrics(metrics: RawMetrics | null): ElementMetrics | null {
  if (!metrics || (metrics.width === 0 && metrics.height === 0)) {
    return null;
  }

  return {
    pageX: metrics.pageX,
    pageY: metrics.pageY,
    width: metrics.width,
    height: metrics.height,
  };
}

function measureElementWithJsRef(
  ref: React.RefObject<any>,
  settle: (metrics: ElementMetrics | null) => void
) {
  try {
    const node = ref.current;
    if (!node) {
      settle(null);
      return;
    }

    if (typeof node.measureInWindow === 'function') {
      node.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          settle(
            normalizeMetrics({
              pageX: x,
              pageY: y,
              width,
              height,
            })
          );
        }
      );
      return;
    }

    if (typeof node.measure === 'function') {
      node.measure(
        (
          _x: number,
          _y: number,
          width: number,
          height: number,
          pageX: number,
          pageY: number
        ) => {
          settle(
            normalizeMetrics({
              pageX,
              pageY,
              width,
              height,
            })
          );
        }
      );
      return;
    }

    settle(null);
  } catch {
    settle(null);
  }
}

export function measureElement(
  ref: React.RefObject<any>,
  animatedRef?: AnimatedRef<any>
): Promise<ElementMetrics | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, MEASUREMENT_TIMEOUT);

    let settled = false;

    const settle = (metrics: ElementMetrics | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(metrics);
    };

    const fallbackToJsRef = () => {
      measureElementWithJsRef(ref, settle);
    };

    const handleUiMeasurement = (measured: RawMetrics | null) => {
      const normalized = normalizeMetrics(measured);
      if (normalized) {
        settle(normalized);
        return;
      }

      fallbackToJsRef();
    };

    if (animatedRef) {
      try {
        scheduleOnUI((uiRef: AnimatedRef<any>) => {
          'worklet';

          const metrics = measure(uiRef);
          scheduleOnRN(
            handleUiMeasurement,
            metrics
              ? {
                  pageX: metrics.pageX,
                  pageY: metrics.pageY,
                  width: metrics.width,
                  height: metrics.height,
                }
              : null
          );
        }, animatedRef);
        return;
      } catch {
        fallbackToJsRef();
        return;
      }
    }

    fallbackToJsRef();
  });
}

export async function measureElements(
  refs: Map<string, React.RefObject<any>>,
  animatedRefs?: Map<string, AnimatedRef<any>>
): Promise<Map<string, ElementMetrics>> {
  const results = new Map<string, ElementMetrics>();
  const entries = Array.from(refs.entries());

  const measurements = await Promise.all(
    entries.map(([id, ref]) => measureElement(ref, animatedRefs?.get(id)))
  );

  entries.forEach(([id], index) => {
    const m = measurements[index];
    if (m) {
      results.set(id, m);
    }
  });

  return results;
}

export interface BatchMeasureEntry {
  id: string;
  ref: React.RefObject<any>;
  animatedRef?: AnimatedRef<any>;
}

export function measureElementsBatched(
  entries: BatchMeasureEntry[]
): Promise<Map<string, ElementMetrics | null>> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(new Map(entries.map((e) => [e.id, null])));
    }, MEASUREMENT_TIMEOUT);

    const results = new Map<string, ElementMetrics | null>();
    let remaining = entries.length;

    if (remaining === 0) {
      clearTimeout(timeout);
      resolve(results);
      return;
    }

    const settle = (id: string, metrics: ElementMetrics | null) => {
      if (results.has(id)) return; // already settled
      results.set(id, metrics);
      remaining--;
      if (remaining <= 0) {
        clearTimeout(timeout);
        resolve(results);
      }
    };

    const uiEntries: {
      id: string;
      animatedRef: AnimatedRef<any>;
      ref: React.RefObject<any>;
    }[] = [];
    const jsOnlyEntries: { id: string; ref: React.RefObject<any> }[] = [];

    for (const entry of entries) {
      if (entry.animatedRef) {
        uiEntries.push({
          id: entry.id,
          animatedRef: entry.animatedRef,
          ref: entry.ref,
        });
      } else {
        jsOnlyEntries.push({ id: entry.id, ref: entry.ref });
      }
    }

    for (const { id, ref } of jsOnlyEntries) {
      measureElementWithJsRef(ref, (metrics) => settle(id, metrics));
    }

    if (uiEntries.length > 0) {
      const uiRefs = uiEntries.map((e) => e.animatedRef);

      const handleBatchResult = (rawResults: (RawMetrics | null)[]) => {
        for (let i = 0; i < uiEntries.length; i++) {
          const entry = uiEntries[i]!;
          const normalized = normalizeMetrics(rawResults[i] ?? null);
          if (normalized) {
            settle(entry.id, normalized);
          } else {
            // UI measurement failed — fall back to JS ref
            measureElementWithJsRef(entry.ref, (metrics) =>
              settle(entry.id, metrics)
            );
          }
        }
      };

      try {
        scheduleOnUI((refs: AnimatedRef<any>[]) => {
          'worklet';
          const measured: (RawMetrics | null)[] = [];
          for (let i = 0; i < refs.length; i++) {
            const m = measure(refs[i]!);
            measured.push(
              m
                ? {
                    pageX: m.pageX,
                    pageY: m.pageY,
                    width: m.width,
                    height: m.height,
                  }
                : null
            );
          }
          scheduleOnRN(handleBatchResult, measured);
        }, uiRefs);
      } catch {
        for (const entry of uiEntries) {
          measureElementWithJsRef(entry.ref, (metrics) =>
            settle(entry.id, metrics)
          );
        }
      }
    }
  });
}
