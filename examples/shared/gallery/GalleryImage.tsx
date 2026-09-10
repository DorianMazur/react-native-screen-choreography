import { Image, StyleSheet, View } from 'react-native';
import type { Photo } from './data';

/** Bundled gallery artwork, shared by the demo and native benchmark. */
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
        // Overlay copies must be opaque immediately, including on Android Back.
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
