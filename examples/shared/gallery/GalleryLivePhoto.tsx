import { Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

export interface GalleryPhotoViewport {
  readonly value: { width: number; height: number };
}

export function GalleryLivePhoto({
  source,
  viewport,
  onLoad,
  onError,
}: {
  source: ImageSourcePropType;
  viewport: GalleryPhotoViewport;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const asset = Image.resolveAssetSource(source);
  if (!asset?.width || !asset.height) {
    throw new Error('Gallery photos require an image with known dimensions.');
  }
  // Fixed native layout avoids new Fabric image requests as the host resizes.
  const width = 800;
  const height = (width * asset.height) / asset.width;
  const style = useAnimatedStyle(() => {
    const size = viewport.value;
    const scale = Math.max(size.width / width, size.height / height);
    return {
      transform: [
        { translateX: (size.width - width * scale) / 2 },
        { translateY: (size.height - height * scale) / 2 },
        { scale },
      ],
    };
  });
  return (
    <Animated.Image
      source={source}
      onLoad={onLoad}
      onError={onError}
      fadeDuration={0}
      resizeMode="cover"
      style={[styles.image, { width, height }, style]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
});
