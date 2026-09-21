import { findNodeHandle } from 'react-native';
import NativePreparation from '../native/NativeChoreographyPreparation';
import type { ElementMetrics, NodeHandleRef } from '../types';

type FabricCapture = (screenTags: number[], viewTags: number[]) => unknown;
type FabricGlobal = typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: FabricCapture;
  __screenChoreographySubscribeFabricMount?: (
    callback: () => void
  ) => () => void;
};

export interface FabricLayoutEntry {
  id: string;
  ref: NodeHandleRef;
  screenRef: NodeHandleRef;
}

export interface FabricLayoutSnapshot {
  metrics: Map<string, ElementMetrics>;
  /** Numeric tags can be recycled; retain native node identity too. */
  isCurrent: () => boolean;
}

export function hasFabricLayoutCapture(): boolean {
  const globals = globalThis as FabricGlobal;
  if (typeof globals.__screenChoreographyCaptureFabricLayout === 'function')
    return true;
  try {
    NativePreparation?.install();
  } catch {
    return false;
  }
  return typeof globals.__screenChoreographyCaptureFabricLayout === 'function';
}

function nodeFor(ref: NodeHandleRef): any {
  return typeof ref === 'function' ? ref() : ref.current;
}

/** All endpoints are read synchronously from a single completed mounted root. */
export function captureFabricLayout(
  entries: FabricLayoutEntry[]
): FabricLayoutSnapshot | null {
  if (!entries.length || !hasFabricLayoutCapture()) return null;
  try {
    const nodes = entries.map((entry) => nodeFor(entry.ref));
    const screens = entries.map((entry) => nodeFor(entry.screenRef));
    const tags = nodes.map((node) => (node ? findNodeHandle(node) : null));
    const screenTags = screens.map((node) =>
      node ? findNodeHandle(node) : null
    );
    if (
      [...tags, ...screenTags].some(
        (tag) => typeof tag !== 'number' || !Number.isInteger(tag) || tag <= 0
      ) ||
      new Set(entries.map((entry) => entry.id)).size !== entries.length
    )
      return null;
    const isCurrent = () => {
      try {
        return entries.every(
          (entry, index) =>
            nodeFor(entry.ref) === nodes[index] &&
            nodeFor(entry.screenRef) === screens[index] &&
            findNodeHandle(nodes[index]) === tags[index] &&
            findNodeHandle(screens[index]) === screenTags[index]
        );
      } catch {
        return false;
      }
    };
    const result = (globalThis as FabricGlobal)
      .__screenChoreographyCaptureFabricLayout!(
      screenTags as number[],
      tags as number[]
    );
    if (
      !Array.isArray(result) ||
      result.length !== entries.length ||
      !isCurrent()
    )
      return null;
    const metrics = new Map<string, ElementMetrics>();
    for (let i = 0; i < entries.length; i++) {
      const item = result[i];
      if (
        !item ||
        ![item.pageX, item.pageY, item.width, item.height].every(
          (value) => typeof value === 'number' && Number.isFinite(value)
        ) ||
        item.width <= 0 ||
        item.height <= 0
      )
        return null;
      metrics.set(entries[i]!.id, {
        pageX: item.pageX,
        pageY: item.pageY,
        width: item.width,
        height: item.height,
      });
    }
    return { metrics, isCurrent };
  } catch {
    return null;
  }
}

/** Retry pending mounts, not measurements or equal-geometry stability samples. */
export function waitForFabricLayout<T>({
  read,
  isCurrent,
  cancellers,
  timeoutMs = 500,
}: {
  read: () => T | null;
  isCurrent: () => boolean;
  cancellers: Set<() => void>;
  timeoutMs?: number;
}): Promise<T | null> {
  if (!hasFabricLayoutCapture() || !isCurrent()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let settled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      settled = true;
      clearTimeout(retry);
      clearTimeout(deadline);
      cancellers.delete(cancel);
    };
    const finish = (value: T | null) => {
      if (settled) return;
      cleanup();
      resolve(value);
    };
    const cancel = () => finish(null);
    const attempt = () => {
      if (settled) return;
      if (!isCurrent()) {
        finish(null);
        return;
      }
      try {
        const value = read();
        if (settled) return;
        if (!isCurrent()) {
          finish(null);
          return;
        }
        if (value !== null) {
          finish(value);
          return;
        }
        retry = setTimeout(attempt, 16);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    cancellers.add(cancel);
    deadline = setTimeout(cancel, timeoutMs);
    attempt();
  });
}

/** Native mount events are coalesced and delivered on the React Native JS thread. */
export function subscribeToFabricMounts(callback: () => void): () => void {
  return (
    (globalThis as FabricGlobal).__screenChoreographySubscribeFabricMount?.(
      callback
    ) ?? (() => {})
  );
}
