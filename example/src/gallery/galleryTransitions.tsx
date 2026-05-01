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

// Photo stretches independently in X and Y so it tracks the morphing frame
// (tile aspect → full-width hero aspect) instead of locking to source aspect.
// Radii match the frame so the overlay clips to rounded corners mid-flight.
// `singleContent` carries only the larger gradient+glyph (no crossfade) so
// the icon morphs in place instead of doubling-up mid-flight.
export const galleryPhotoTransition = makeStretchTransition({
  sourceBorderRadius: theme.radius.lg,
  targetBorderRadius: 0,
  singleContent: true,
});
// Identical text in both screens — single-element scale, no crossfade.
export const galleryTitleTransition = textMorphTransition;
export const galleryLocationTransition = textMorphTransition;
