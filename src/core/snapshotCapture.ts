import { findNodeHandle } from 'react-native';
import type { ElementBitmap, NodeHandleRef } from '../types';
import NativeScreenChoreographySnapshot from '../native/NativeScreenChoreographySnapshot';
import { debugTrace } from '../debug/logger';

function resolveNode(ref: NodeHandleRef): any {
  return typeof ref === 'function' ? ref() : ref.current;
}

/** Whether the native snapshot module is available in this build. */
export function isSnapshotCaptureAvailable(): boolean {
  return NativeScreenChoreographySnapshot != null;
}

/**
 * Capture a native bitmap of a registered element's view subtree. Returns
 * `null` when the module is unavailable, the node is gone, or capture fails —
 * callers must treat the bitmap as best-effort fidelity enhancement.
 */
export async function captureElementBitmap(
  ref: NodeHandleRef
): Promise<ElementBitmap | null> {
  if (!NativeScreenChoreographySnapshot) {
    return null;
  }

  const node = resolveNode(ref);
  if (!node) {
    return null;
  }

  const reactTag = findNodeHandle(node);
  if (reactTag == null) {
    return null;
  }

  try {
    const result = await NativeScreenChoreographySnapshot.captureView(reactTag);
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    debugTrace(
      () => `[Snapshot] capture failed tag=${reactTag} error=${String(error)}`
    );
    return null;
  }
}

/** Release the file behind a captured bitmap. Safe to call multiple times. */
export function releaseElementBitmap(bitmap: ElementBitmap): void {
  if (!NativeScreenChoreographySnapshot) {
    return;
  }

  try {
    NativeScreenChoreographySnapshot.releaseSnapshot(bitmap.uri);
  } catch {
    // Best-effort cleanup; the OS reclaims the cache directory eventually.
  }
}
