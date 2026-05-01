import {
  makeSurfaceTransition,
  aspectMorphTransition,
  crossfadeTransition,
  stretchTransition,
} from '../sharedHelpers';
import { theme } from '../theme';

export const musicCardTransition = makeSurfaceTransition(
  { backgroundColor: theme.surface, borderRadius: theme.radius.md },
  { backgroundColor: 'transparent', borderRadius: theme.radius.xl }
);

export const musicArtworkTransition = aspectMorphTransition;
export const musicTitleTransition = stretchTransition;
export const musicArtistTransition = crossfadeTransition;
