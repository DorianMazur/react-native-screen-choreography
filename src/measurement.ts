import type { AnimatedRef } from 'react-native-reanimated';
import { measure } from 'react-native-reanimated';
import { runOnUIAsync } from 'react-native-worklets';
import type { ElementMetrics, NodeHandleRef } from './types';
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

function resolveNode(ref: NodeHandleRef): any {
  return typeof ref === 'function' ? ref() : ref.current;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return new Promise<T>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}

function measureElementWithJsRef(
  ref: NodeHandleRef,
  settle: (metrics: ElementMetrics | null) => void
) {
  try {
    const node = resolveNode(ref);
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

async function measureElementOnUI(
  animatedRef: AnimatedRef<any>
): Promise<ElementMetrics | null> {
  const measured = await runOnUIAsync(() => {
    'worklet';

    const metrics = measure(animatedRef);
    return metrics
      ? {
          pageX: metrics.pageX,
          pageY: metrics.pageY,
          width: metrics.width,
          height: metrics.height,
        }
      : null;
  });

  return normalizeMetrics(measured);
}

export function measureElement(
  ref: NodeHandleRef,
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

    if (animatedRef) {
      withTimeout(measureElementOnUI(animatedRef), MEASUREMENT_TIMEOUT, null)
        .then((metrics) => {
          if (metrics) {
            settle(metrics);
            return;
          }

          measureElementWithJsRef(ref, settle);
        })
        .catch(() => {
          measureElementWithJsRef(ref, settle);
        });
      return;
    }

    measureElementWithJsRef(ref, settle);
  });
}

export async function measureElements(
  refs: Map<string, NodeHandleRef>,
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
  ref: NodeHandleRef;
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
      ref: NodeHandleRef;
    }[] = [];
    const jsOnlyEntries: { id: string; ref: NodeHandleRef }[] = [];

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

      withTimeout(
        runOnUIAsync(() => {
          'worklet';

          const measured: (RawMetrics | null)[] = [];
          for (let i = 0; i < uiRefs.length; i++) {
            const m = measure(uiRefs[i]!);
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
          return measured;
        }),
        MEASUREMENT_TIMEOUT,
        uiEntries.map(() => null)
      )
        .then((rawResults) => {
          for (let i = 0; i < uiEntries.length; i++) {
            const entry = uiEntries[i]!;
            const normalized = normalizeMetrics(rawResults[i] ?? null);
            if (normalized) {
              settle(entry.id, normalized);
            } else {
              measureElementWithJsRef(entry.ref, (metrics) =>
                settle(entry.id, metrics)
              );
            }
          }
        })
        .catch(() => {
          for (const entry of uiEntries) {
            measureElementWithJsRef(entry.ref, (metrics) =>
              settle(entry.id, metrics)
            );
          }
        });
    }
  });
}
