import { findNodeHandle } from 'react-native';
import NativePreparation from '../native/NativeChoreographyPreparation';
import type { ElementMetrics, NodeHandleRef } from '../types';

type FabricCapture = (screenTags: number[], viewTags: number[]) => unknown;
interface NativeCaptureReader {
  (): ElementMetrics[] | null;
  (validate: true): boolean;
  (cancel: false): void;
}
type FabricGlobal = typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: FabricCapture;
  __screenChoreographyRequestFabricLayout?: (
    screenTags: number[],
    viewTags: number[]
  ) => NativeCaptureReader | null;
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

export interface NativeLayoutSnapshot extends FabricLayoutSnapshot {
  validateNative: () => boolean;
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

interface FabricLayoutRequest {
  entries: FabricLayoutEntry[];
  isCurrent: () => boolean;
  cancellers: Set<() => void>;
  timeoutMs?: number;
}

export function requestFabricLayout(
  request: FabricLayoutRequest
): Promise<NativeLayoutSnapshot | null> {
  return Promise.resolve(prepareFabricLayout(request));
}

/** Ready mounted snapshots stay in the caller's commit; pending mounts wait. */
export function prepareFabricLayout({
  entries,
  isCurrent,
  cancellers,
  timeoutMs = 1000,
}: FabricLayoutRequest):
  | NativeLayoutSnapshot
  | null
  | Promise<NativeLayoutSnapshot | null> {
  if (!entries.length || !hasFabricLayoutCapture() || !isCurrent()) return null;
  const globals = globalThis as FabricGlobal;
  const prepare = globals.__screenChoreographyRequestFabricLayout;
  const subscribe = globals.__screenChoreographySubscribeFabricMount;
  if (!prepare || !subscribe) return null;
  let immediate: NativeLayoutSnapshot | null | undefined;
  const pending = new Promise<NativeLayoutSnapshot | null>((resolve) => {
    let reader: NativeCaptureReader | null = null;
    let unsubscribe: (() => void) | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const cleanup = (cancelNative = true) => {
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      try {
        unsubscribe?.();
      } catch {
        /* Runtime may already be disposed. */
      }
      try {
        if (cancelNative) reader?.(false);
      } catch {
        /* Still settle the caller. */
      }
      reader = null;
      cancellers.delete(cancel);
    };
    const finish = (snapshot: NativeLayoutSnapshot | null) => {
      if (settled) return;
      cleanup(snapshot === null);
      immediate = snapshot;
      resolve(snapshot);
    };
    const cancel = () => finish(null);
    try {
      const nodes = entries.map((entry) => nodeFor(entry.ref));
      const screens = entries.map((entry) => nodeFor(entry.screenRef));
      const tags = nodes.map((node) => node && findNodeHandle(node));
      const screenTags = screens.map((node) => node && findNodeHandle(node));
      if (
        [...tags, ...screenTags].some(
          (tag) => !Number.isInteger(tag) || tag <= 0
        ) ||
        new Set(entries.map((entry) => entry.id)).size !== entries.length
      ) {
        finish(null);
        return;
      }
      // Subscribe before requesting so a mount racing setup cannot be missed.
      const currentRefs = () =>
        entries.every(
          (entry, i) =>
            nodeFor(entry.ref) === nodes[i] &&
            nodeFor(entry.screenRef) === screens[i] &&
            findNodeHandle(nodes[i]) === tags[i] &&
            findNodeHandle(screens[i]) === screenTags[i]
        );
      const attempt = () => {
        if (settled || !reader) return;
        try {
          if (!isCurrent() || !currentRefs() || !reader(true)) {
            finish(null);
            return;
          }
          const batch = reader();
          if (batch === null) return;
          if (
            !Array.isArray(batch) ||
            batch.length !== entries.length ||
            batch.some(
              (m) =>
                !m ||
                ![m.pageX, m.pageY, m.width, m.height].every(Number.isFinite) ||
                m.width <= 0 ||
                m.height <= 0
            ) ||
            !isCurrent() ||
            !currentRefs()
          ) {
            finish(null);
            return;
          }
          const nativeReader = reader;
          const validateNative = () => {
            'worklet';
            return nativeReader(true);
          };
          finish({
            validateNative,
            metrics: new Map(entries.map((entry, i) => [entry.id, batch[i]!])),
            isCurrent: currentRefs,
          });
        } catch {
          finish(null);
        }
      };
      cancellers.add(cancel);
      unsubscribe = subscribe(attempt);
      reader = prepare(screenTags as number[], tags as number[]);
      if (!reader) {
        finish(null);
        return;
      }
      deadline = setTimeout(cancel, timeoutMs);
      attempt();
    } catch {
      finish(null);
    }
  });
  return immediate === undefined ? pending : immediate;
}

/** Native mount events are coalesced and delivered on the React Native JS thread. */
export function subscribeToFabricMounts(callback: () => void): () => void {
  return (
    (globalThis as FabricGlobal).__screenChoreographySubscribeFabricMount?.(
      callback
    ) ?? (() => {})
  );
}
