import { StyleSheet, View } from 'react-native';

/** The same bottom shade fills the image in endpoints and its moving clip. */
export function GalleryScrim() {
  return <View pointerEvents="none" style={styles.scrim} />;
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)',
  },
});
