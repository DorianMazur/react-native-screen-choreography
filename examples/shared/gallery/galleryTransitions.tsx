import {
  defineTransition,
  surface,
  image,
  text,
  crossfade,
  Springs,
} from '../runtime';
import { theme } from '../theme';
import { GalleryScrim } from './GalleryScrim';

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
    location: text({ mode: 'scale', zIndex: 4 }),
  },
});
