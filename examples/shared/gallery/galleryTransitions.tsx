import {
  defineTransition,
  surface,
  image,
  text,
  crossfade,
  Springs,
  textMorphTransition,
} from '../runtime';
import { theme } from '../theme';
import { GalleryScrim } from './GalleryScrim';

// One module-scope definition is shared by both navigator examples and endpoints.
export const galleryTransition = defineTransition({
  motion: { spring: Springs.default },
  shared: {
    frame: surface({ radius: [theme.radius.lg, 0] }),
    photo: image({
      mode: 'morph',
      radius: [theme.radius.lg, 0],
      zIndex: 2,
      overlay: <GalleryScrim />,
    }),
    glyph: crossfade({ zIndex: 4 }),
    title: text({ zIndex: 4 }),
  },
});

// The location is identical plain text at both endpoints, so use one morphing
// text layer instead of crossfading the two endpoint layouts.
export const galleryLocationTransition = { ...textMorphTransition, zIndex: 4 };
