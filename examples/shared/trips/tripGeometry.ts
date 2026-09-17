/** Close the side gutters before the vertical expansion finishes. */
export function tripHorizontalProgress(expansion: number): number {
  'worklet';
  const t = Math.max(0, Math.min(1, expansion / 0.75));
  return 1 - (1 - t) * (1 - t);
}

/** Cancel the frame's faster horizontal motion for content in screen space. */
export function tripContentOffset(
  fromX: number,
  toX: number,
  expansion: number
): number {
  'worklet';
  const t = Math.max(0, Math.min(1, expansion));
  return (toX - fromX) * (t - tripHorizontalProgress(t));
}

interface TripPhotoBounds {
  pageX: number;
  width: number;
  height: number;
}

/** Interpolate endpoint crops instead of switching cover axes mid-animation. */
export function tripPhotoGeometry(
  from: TripPhotoBounds,
  to: TripPhotoBounds,
  imageWidth: number,
  imageHeight: number,
  expansion: number
) {
  'worklet';
  const t = Math.max(0, Math.min(1, expansion));
  const horizontal = tripHorizontalProgress(t);
  const frameX = from.pageX + (to.pageX - from.pageX) * horizontal;
  const width = from.width + (to.width - from.width) * horizontal;
  const height = from.height + (to.height - from.height) * t;
  const fromScale = Math.max(
    from.width / imageWidth,
    from.height / imageHeight
  );
  const toScale = Math.max(to.width / imageWidth, to.height / imageHeight);
  const centerX =
    from.pageX +
    from.width / 2 +
    (to.pageX + to.width / 2 - from.pageX - from.width / 2) * t -
    frameX;
  // Preserve coverage even with unusual aspect ratios or an off-center source.
  const scale = Math.max(
    fromScale + (toScale - fromScale) * t,
    (2 * Math.max(centerX, width - centerX)) / imageWidth,
    height / imageHeight
  );
  return {
    x: centerX - (imageWidth * scale) / 2,
    y: (height - imageHeight * scale) / 2,
    scale,
  };
}

/** Springs accelerate away from either endpoint. A wider reverse range keeps
 * the exit comparable to the entrance instead of rushing through its tail.
 * The last card starts folding first; the first card finishes last. */
export function tripActivityProgress(
  expansion: number,
  index: number,
  backward = false
): number {
  'worklet';
  const progress = Math.max(0, Math.min(1, expansion));
  const start = backward ? 0.22 + index * 0.04 : 0.45 + index * 0.06;
  const span = backward ? 0.68 : 0.43;
  const t = Math.max(0, Math.min(1, (progress - start) / span));
  return t * t * (3 - 2 * t);
}
