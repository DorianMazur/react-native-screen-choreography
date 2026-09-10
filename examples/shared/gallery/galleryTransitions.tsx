import { defineTransition, Springs } from '../runtime';

export const galleryTransition = defineTransition({
  motion: { spring: Springs.default },
  shared: { hero: { kind: 'bounds', zIndex: 2 } },
  enter: { details: { during: [0.55, 0.9] } },
});
export const galleryNavigationOptions = galleryTransition.navigationOptions;
