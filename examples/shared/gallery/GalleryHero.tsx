import { useEffect } from 'react';
import { useRenderObservation } from '../useRenderObservation';
import type { ExampleObservation } from '../ExampleObservation';
import { useDerivedValue } from 'react-native-reanimated';
import { useSharedElementPresentation } from '../runtime';
import { GalleryHeroArtwork } from './GalleryHeroArtwork';
import { interpolateHero } from './galleryHeroGeometry';
import type { Photo } from './data';

export function GalleryHero({
  photo,
  width: initialWidth,
  height: initialHeight,
  observation,
}: {
  photo: Photo;
  width: number;
  height: number;
  observation?: ExampleObservation;
}) {
  useRenderObservation(
    observation?.rendered
      ? (phase) => observation.rendered?.('hero', phase, photo.id)
      : undefined
  );
  useEffect(() => observation?.mounted(photo.id), [observation, photo.id]);
  const { presentationProgress, collapsed, expanded } =
    useSharedElementPresentation();
  const from = {
    width: collapsed.metrics?.width ?? initialWidth,
    height: collapsed.metrics?.height ?? initialHeight,
    expansion: 0,
  };
  const to = {
    width: expanded.metrics?.width ?? initialWidth,
    height: expanded.metrics?.height ?? initialHeight,
    expansion: 1,
  };
  const frame = useDerivedValue(() =>
    interpolateHero(from, to, presentationProgress.value)
  );
  return (
    <GalleryHeroArtwork
      photo={photo}
      frame={frame}
      onLoad={observation ? () => observation.loaded(photo.id) : undefined}
      onError={observation ? () => observation.failed(photo.id) : undefined}
    />
  );
}
