import { useDerivedValue } from 'react-native-reanimated';
import { useScreenAnimation } from 'react-native-screen-transitions';
import { GalleryHeroArtwork } from '../../../shared/gallery/GalleryHeroArtwork';
import { interpolateHero } from '../../../shared/gallery/galleryHeroGeometry';
import type { Photo } from '../../../shared/gallery/data';

export function GalleryHero({
  photo,
  width,
  height,
}: {
  photo: Photo;
  width: number;
  height: number;
}) {
  const animation = useScreenAnimation();
  const frame = useDerivedValue(() => {
    const { next, bounds } = animation.value;
    // The live artwork keeps its source screen's context after handoff.
    // Other tiles must remain collapsed when a different photo opens.
    const params = next?.route.params;
    if (
      !next ||
      !params ||
      !('photoId' in params) ||
      params.photoId !== photo.id
    ) {
      return { width, height, expansion: 0 };
    }
    const link = bounds(`photo.${photo.id}`).link();
    const source = link?.source?.bounds;
    const destination = link?.destination?.bounds;
    return interpolateHero(
      {
        width: source?.width ?? width,
        height: source?.height ?? height,
        expansion: 0,
      },
      {
        width: destination?.width ?? width,
        height: destination?.height ?? height,
        expansion: 1,
      },
      next.progress
    );
  });

  return <GalleryHeroArtwork photo={photo} frame={frame} />;
}
