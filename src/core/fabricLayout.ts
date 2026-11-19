import { findNodeHandle } from 'react-native';
import type { ScrollAnchor } from '../native/ScreenChoreographyScrollTrackNativeComponent';
import NativePreparation from '../native/NativeChoreographyPreparation';
import type { ElementMetrics, NodeHandleRef } from '../types';

type FabricCapture = (screenTags: number[], viewTags: number[]) => unknown;
interface NativeCaptureReader {
  (): ElementMetrics[] | null;
  (validate: true): boolean;
  (cancel: false): void;
  (diagnostics: 'diagnostics'): Record<string, string | number | boolean>;
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
  scrollAnchors?: Map<string, readonly ScrollAnchor[]>;
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

function readLayoutBatch(entries: FabricLayoutEntry[], result: unknown) {
  if (!Array.isArray(result) || result.length !== entries.length) return null;
  const metrics = new Map<string, ElementMetrics>();
  let scrollAnchors: Map<string, readonly ScrollAnchor[]> | undefined;
  for (const [index, item] of result.entries()) {
    if (!item) return null;
    const { pageX, pageY, width, height } = item;
    if (
      ![pageX, pageY, width, height].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    )
      return null;
    const key = entries[index]!.id;
    metrics.set(key, { pageX, pageY, width, height });
    if (item.scrollAnchors !== undefined) {
      if (
        !Array.isArray(item.scrollAnchors) ||
        !item.scrollAnchors.every(
          (a: ScrollAnchor) =>
            a &&
            Number.isInteger(a.tag) &&
            a.tag > 0 &&
            [a.x, a.y, a.xx, a.xy, a.yx, a.yy].every(Number.isFinite)
        )
      )
        return null;
      if (item.scrollAnchors.length) {
        scrollAnchors ??= new Map();
        scrollAnchors.set(key, item.scrollAnchors);
      }
    }
  }
  return { metrics, scrollAnchors };
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
    const batch = readLayoutBatch(entries, result);
    return batch && isCurrent() ? { ...batch, isCurrent } : null;
  } catch {
    return null;
  }
}

interface FabricLayoutRequest {
  entries: FabricLayoutEntry[];
  isCurrent: () => boolean;
  cancellers: Set<() => void>;
  timeoutMs?: number;
  onFailure?: (details: Record<string, string | number | boolean>) => void;
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
  onFailure,
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
    const finish = (
      snapshot: NativeLayoutSnapshot | null,
      reason = 'invalid'
    ) => {
      if (settled) return;
      if (snapshot === null && onFailure) {
        try {
          onFailure({ ...reader?.('diagnostics'), reason });
        } catch {
          // Diagnostic observers must not interfere with cancellation.
        }
      }
      cleanup(snapshot === null);
      immediate = snapshot;
      resolve(snapshot);
    };
    const cancel = () => finish(null, 'cancelled');
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
        finish(null, 'invalid-endpoint-tags');
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
          if (!isCurrent()) {
            finish(null, 'stale-operation');
            return;
          }
          if (!currentRefs()) {
            finish(null, 'endpoint-ref-changed');
            return;
          }
          if (!reader(true)) {
            finish(null, 'native-identity-invalid');
            return;
          }
          const batch = reader();
          if (batch === null) return;
          const layout = readLayoutBatch(entries, batch);
          if (!layout || !isCurrent() || !currentRefs()) {
            finish(null, 'invalid-or-stale-native-batch');
            return;
          }
          const nativeReader = reader;
          const validateNative = () => {
            'worklet';
            return nativeReader(true);
          };
          finish({
            validateNative,
            ...layout,
            isCurrent: currentRefs,
          });
        } catch {
          finish(null, 'native-read-failed');
        }
      };
      cancellers.add(cancel);
      unsubscribe = subscribe(attempt);
      reader = prepare(screenTags as number[], tags as number[]);
      if (!reader) {
        finish(null, 'native-request-unavailable');
        return;
      }
      deadline = setTimeout(() => {
        // Native may have completed the batch before its coalesced mount
        // notification reaches JS. Check once before declaring it unavailable;
        // this uses the same ownership, identity and mounted-root validation.
        attempt();
        finish(null, 'timeout');
      }, timeoutMs);
      attempt();
    } catch {
      finish(null, 'native-request-failed');
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
