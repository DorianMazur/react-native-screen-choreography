import React from 'react';
import type {
  SharedElementTransition,
  SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';
import { StandInElement } from '../runtime';
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

// Glyph is rendered inside square wraps on both screens, so the stretch
// renderer's W/H interpolation naturally produces a *uniform* scale and the
// icon never squishes — even when the source tile is taller than the target
// hero (the tall tiles in the grid don't share an aspect ratio with the
// detail hero box).
export const galleryGlyphTransition = makeStretchTransition({
  singleContent: true,
});
