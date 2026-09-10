import { GalleryHero } from './GalleryHero';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SharedElement, useExampleNavigation } from '../runtime';
import { SafeAreaView } from '../runtime';
import { ScreenHeader } from '../AppChrome';
import { theme } from '../theme';
import { PHOTOS, type Photo } from './data';
import {
  galleryHeroTransition,
  galleryNavigationOptions,
} from './galleryTransitions';

const TILE_GAP = 12;

export interface GalleryObservation {
  mounted: (photoId: string) => () => void;
  loaded: (photoId: string) => void;
  failed: (photoId: string) => void;
}

export function GalleryListScreen({
  observation,
}: {
  observation?: GalleryObservation;
}) {
  const { goBack, navigate } = useExampleNavigation();
  const { width } = useWindowDimensions();
  const tileWidth = (width - 48 - TILE_GAP) / 2;

  return (
    <>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Gallery" onBack={() => goBack()} />
        <View style={styles.header}>
          <Text style={styles.eyebrow}>THE FIELD JOURNAL</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Field notes
          </Text>
          <View style={styles.summary}>
            <Text style={styles.subtitle}>Places worth keeping</Text>
            <Text style={styles.count}>{PHOTOS.length} PHOTOS</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {PHOTOS.map((photo) => (
            <Tile
              key={photo.id}
              photo={photo}
              observation={observation}
              width={tileWidth}
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
  onPress,
  observation,
}: {
  photo: Photo;
  width: number;
  onPress: () => void;
  observation?: GalleryObservation;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${photo.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tileWrapper,
        { width },
        pressed && { opacity: 0.7 },
      ]}
    >
      <SharedElement
        id="hero"
        groupId={`photo.${photo.id}`}
        transition={galleryHeroTransition}
        style={styles.tileFrame}
      >
        <GalleryHero
          photo={photo}
          width={width}
          height={width / 0.72}
          observation={observation}
        />
      </SharedElement>
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
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  eyebrow: {
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  count: {
    fontFamily: theme.numbers,
    fontSize: 10,
    color: theme.gallery.accent,
  },
  title: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 30,
    fontWeight: '600',
    marginTop: 10,
  },
  subtitle: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 12,
  },
  grid: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tileWrapper: {
    aspectRatio: 0.72,
  },
  tileFrame: {
    flex: 1,
  },
});
