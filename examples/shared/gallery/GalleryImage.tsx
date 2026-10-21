import { Image, StyleSheet, View } from 'react-native';
import type { Photo } from './data';

export function GalleryImage({
  photo,
  onLoad,
  onError,
}: {
  photo: Photo;
  onLoad?: () => void;
  onError?: () => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        // Avoid Android's image-load fade competing with the shared transition.
        fadeDuration={0}
        source={photo.image}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        onLoad={onLoad}
        onError={onError}
      />
    </View>
  );
}
