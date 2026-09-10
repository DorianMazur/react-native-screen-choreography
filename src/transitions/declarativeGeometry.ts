import type { ElementMetrics, TransitionAnchor } from '../types';

export type { TransitionAnchor } from '../types';

export type ProgressRange = readonly [number, number];
export interface OpacityTrack {
  readonly input: readonly number[];
  readonly output: readonly number[];
}
export function sampleTrack(value: number, track: OpacityTrack): number {
  'worklet';
  const { input, output } = track;
  if (value <= input[0]!) return output[0]!;
  for (let index = 1; index < input.length; index += 1) {
    if (value <= input[index]!) {
      const fraction =
        (value - input[index - 1]!) / (input[index]! - input[index - 1]!);
      return (
        output[index - 1]! + fraction * (output[index]! - output[index - 1]!)
      );
    }
  }
  return output[output.length - 1]!;
}

export function mix(start: number, end: number, progress: number): number {
  'worklet';
  return start + (end - start) * Math.max(0, Math.min(1, progress));
}

export function frameAt(
  anchor: TransitionAnchor,
  progress: number
): ElementMetrics {
  'worklet';
  return {
    pageX: mix(anchor.collapsed.pageX, anchor.expanded.pageX, progress),
    pageY: mix(anchor.collapsed.pageY, anchor.expanded.pageY, progress),
    width: mix(anchor.collapsed.width, anchor.expanded.width, progress),
    height: mix(anchor.collapsed.height, anchor.expanded.height, progress),
  };
}

export function fittedScale(
  base: ElementMetrics,
  frame: ElementMetrics,
  fit: 'cover' | 'contain'
): number {
  'worklet';
  if (base.width <= 0 || base.height <= 0) return 1;
  const x = frame.width / base.width;
  const y = frame.height / base.height;
  return fit === 'cover' ? Math.max(x, y) : Math.min(x, y);
}

export function resolveFollowAnchor(
  follow: string | readonly string[] | undefined,
  anchors: Readonly<Record<string, TransitionAnchor>> | undefined
): TransitionAnchor | undefined {
  const ids = typeof follow === 'string' ? [follow] : (follow ?? []);
  for (const id of ids) {
    const anchor = anchors?.[id];
    if (
      anchor &&
      [anchor.collapsed, anchor.expanded].every(
        (metrics) =>
          [metrics.pageX, metrics.pageY, metrics.width, metrics.height].every(
            Number.isFinite
          ) &&
          metrics.width > 0 &&
          metrics.height > 0
      )
    )
      return anchor;
  }
  return undefined;
}

/** Keep an endpoint's original offset from its anchor and its original layout. */
export function followedPosition(
  base: ElementMetrics,
  anchor: TransitionAnchor | undefined,
  endpoint: 'collapsed' | 'expanded',
  progress: number
): { x: number; y: number } {
  'worklet';
  if (!anchor) return { x: base.pageX, y: base.pageY };
  const frame = frameAt(anchor, progress);
  return {
    x: base.pageX + frame.pageX - anchor[endpoint].pageX,
    y: base.pageY + frame.pageY - anchor[endpoint].pageY,
  };
}
