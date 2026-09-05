import {
  makeStretchTransition,
  makeSurfaceTransition,
  textMorphTransition,
} from '../sharedHelpers';
import { theme } from '../theme';

export const galleryFrameTransition = makeSurfaceTransition(
  { backgroundColor: theme.surface, borderRadius: theme.radius.lg },
  { backgroundColor: theme.surface, borderRadius: 0 }
);

export const galleryPhotoTransition = makeStretchTransition({
  sourceBorderRadius: theme.radius.lg,
  targetBorderRadius: 0,
  singleContent: true,
});

export const galleryTitleTransition = textMorphTransition;
export const galleryLocationTransition = textMorphTransition;

// Glyph is rendered inside square wraps on both screens, so the stretch
// renderer's W/H interpolation naturally produces a *uniform* scale and the
// icon never squishes — even when the source tile is taller than the target
// hero (the tall tiles in the grid don't share an aspect ratio with the
// detail hero box).
export const galleryGlyphTransition = makeStretchTransition({
  singleContent: true,
});
