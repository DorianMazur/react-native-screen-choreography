import type {
  SharedElementTransition,
  SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';
import {
  StandInElement,
  makeStretchTransition,
  makeSurfaceTransition,
  textMorphTransition,
} from 'react-native-screen-choreography';
import { theme } from '../../../shared/theme';

export const galleryFrameTransition = makeSurfaceTransition(
  { backgroundColor: theme.surface, borderRadius: theme.radius.lg },
  { backgroundColor: theme.surface, borderRadius: 0 }
);

export const galleryPhotoTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function GalleryPhotoRenderer({
    progress,
    direction,
    source,
    target,
    zIndex,
  }: SharedElementTransitionRendererProps) {
    const isBackward = direction === 'backward';
    return (
      <StandInElement
        progress={progress}
        direction={direction}
        sourceMetrics={source.metrics}
        targetMetrics={target.metrics}
        sourceBorderRadius={isBackward ? 0 : theme.radius.lg}
        targetBorderRadius={isBackward ? theme.radius.lg : 0}
        zIndex={zIndex}
      >
        {source.content ?? target.content}
      </StandInElement>
    );
  },
};

export const galleryTitleTransition = textMorphTransition;
export const galleryLocationTransition = textMorphTransition;

export const galleryGlyphTransition = makeStretchTransition();
