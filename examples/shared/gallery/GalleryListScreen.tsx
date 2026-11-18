import { GalleryHero } from './GalleryHero';
import { useRenderObservation } from '../useRenderObservation';
import type { ExampleObservation } from '../ExampleObservation';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useExampleNavigation } from '../runtime';
import { SafeAreaView } from '../runtime';
import { ScreenHeader } from '../AppChrome';
import { theme } from '../theme';
import { PHOTOS, type Photo } from './data';
import {
  galleryTransition,
  galleryNavigationOptions,
} from './galleryTransitions';

const TILE_GAP = 12;

export function GalleryListScreen({
  observation,
}: {
  observation?: ExampleObservation;
}) {
  useRenderObservation(
    observation?.rendered
      ? (phase) => observation.rendered?.('list', phase)
      : undefined
  );
  const { goBack, navigate } = useExampleNavigation();
  const { width } = useWindowDimensions();
  const tileWidth = (width - 48 - TILE_GAP) / 2;

  return (
    <>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Gallery" onBack={() => goBack()} />
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Field notes
          </Text>
          <View style={styles.summary}>
            <Text style={styles.subtitle}>Places worth keeping</Text>
            <Text style={styles.count}>{PHOTOS.length} photographs</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {PHOTOS.map((photo, index) => (
            <Tile
              key={photo.id}
              photo={photo}
              observation={observation}
              width={
                index === 0 || index === PHOTOS.length - 1
                  ? width - 48
                  : tileWidth
              }
              featured={index === 0 || index === PHOTOS.length - 1}
              onPress={() =>
                navigate(
                  {
                    screen: 'GalleryDetail',
                    params: { photoId: photo.id },
                  },
                  {
                    ...galleryNavigationOptions,
                    transitionConfig: { group: `photo.${photo.id}` },
                  }
                )
              }
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Tile({
  photo,
  width,
  featured,
  onPress,
  observation,
}: {
  photo: Photo;
  width: number;
  featured: boolean;
  onPress: () => void;
  observation?: ExampleObservation;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${photo.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        { width, aspectRatio: featured ? 1.45 : 0.8 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <galleryTransition.Element
        name="hero"
        groupId={`photo.${photo.id}`}
        style={styles.tileFrame}
      >
        <GalleryHero
          photo={photo}
          width={width}
          height={width / (featured ? 1.45 : 0.8)}
          observation={observation}
        />
      </galleryTransition.Element>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  count: {
    fontFamily: theme.font,
    fontSize: 12,
    color: theme.gallery.accent,
  },
  title: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 14,
  },
  grid: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tileFrame: {
    flex: 1,
  },
});
