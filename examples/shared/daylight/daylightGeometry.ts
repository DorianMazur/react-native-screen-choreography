import type { ElementMetrics } from 'react-native-screen-choreography/core';

export const daylightGroup = (collectionId: string) =>
  `daylight.${collectionId}`;

export function photoCorner(width: number) {
  'worklet';
  return Math.min(20, width * 0.2);
}

const ICON_FADE_START = 0.24;
const ICON_FADE_END = 0.6;

function smoothstep(value: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function daylightFrame(
  collapsed: ElementMetrics,
  expanded: ElementMetrics,
  progress: number
) {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  const width = collapsed.width + (expanded.width - collapsed.width) * t;
  const photoHeight = collapsed.height * (width / collapsed.width);
  const flightHeight = Math.max(
    Math.min(photoHeight, expanded.height),
    collapsed.height + (expanded.height - collapsed.height) * t ** 1.6
  );
  // The live card's overflow mask must match the scaled icon while they
  // crossfade. Only unfold to the screen's aspect ratio once the icon is gone.
  const unfold = smoothstep((t - ICON_FADE_END) / (1 - ICON_FADE_END));
  const height = photoHeight + (flightHeight - photoHeight) * unfold;
  return {
    x: collapsed.pageX + (expanded.pageX - collapsed.pageX) * t,
    y:
      collapsed.pageY +
      (expanded.pageY - collapsed.pageY) * t +
      (flightHeight - height) / 2,
    width,
    height,
    radius:
      photoCorner(collapsed.width) * (width / collapsed.width) * (1 - unfold),
  };
}

export function daylightOpacities(progress: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  // Keep the card opaque underneath the fading icon. Complementary opacity
  // on two stacked layers exposes the backdrop at the midpoint (75% coverage).
  // Reveal the card underneath the opaque icon before their visual crossfade.
  const card = smoothstep(t / ICON_FADE_START);
  const icon =
    1 - smoothstep((t - ICON_FADE_START) / (ICON_FADE_END - ICON_FADE_START));
  return { card, icon };
}
