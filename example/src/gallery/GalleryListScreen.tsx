import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import {
  ChoreographyScreen,
  SharedElement,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientBlock } from '../GradientBlock';
import { theme } from '../theme';
import { PHOTOS, type Photo } from './data';
import {
  galleryFrameTransition,
  galleryPhotoTransition,
  galleryTitleTransition,
  galleryLocationTransition,
  galleryGlyphTransition,
} from './galleryTransitions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TILE_GAP = 12;
const TILES_PER_ROW = 2;
const TILE_W = (SCREEN_WIDTH - 32 - TILE_GAP) / TILES_PER_ROW;

export function GalleryListScreen({ navigation }: { navigation: any }) {
  const { navigate } = useChoreographyNavigation(navigation);

  return (
    <ChoreographyScreen screenId="GalleryList">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Field Notes</Text>
          <Text style={styles.subtitle}>Long-exposure work, 2023 – 2025</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {PHOTOS.map((photo, i) => (
            <Tile
              key={photo.id}
              photo={photo}
              tall={i % 3 === 0}
              onPress={() =>
                navigate(
                  'GalleryDetail',
                  { photoId: photo.id },
                  {
                    transitionConfig: { group: `photo.${photo.id}` },
                  }
                )
              }
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ChoreographyScreen>
  );
}

function Tile({
  photo,
  tall,
  onPress,
}: {
  photo: Photo;
  tall: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tileWrapper, tall && styles.tileWrapperTall]}
    >
      <SharedElement
        id={`photo.${photo.id}.frame`}
        groupId={`photo.${photo.id}`}
        transition={galleryFrameTransition}
        style={styles.tileFrame}
      >
        <View style={styles.tileFrameInner}>
          <SharedElement
            id={`photo.${photo.id}.photo`}
            groupId={`photo.${photo.id}`}
            transition={galleryPhotoTransition}
            style={StyleSheet.absoluteFill}
          >
            <GradientBlock
              from={photo.gradientFrom}
              to={photo.gradientTo}
              style={styles.tilePhoto}
            />
            <View style={styles.tileScrim} pointerEvents="none" />
          </SharedElement>
          <View style={styles.tileGlyphWrap} pointerEvents="none">
            <SharedElement
              id={`photo.${photo.id}.glyph`}
              groupId={`photo.${photo.id}`}
              transition={galleryGlyphTransition}
              style={styles.tileGlyphBox}
            >
              <View style={styles.glyphCenter}>
                <Text style={styles.tileGlyph}>{photo.glyph}</Text>
              </View>
            </SharedElement>
          </View>
          <View style={styles.tileMeta}>
            <SharedElement
              id={`photo.${photo.id}.title`}
              groupId={`photo.${photo.id}`}
              transition={galleryTitleTransition}
            >
              <Text style={styles.tileTitle}>{photo.title}</Text>
            </SharedElement>
            <SharedElement
              id={`photo.${photo.id}.location`}
              groupId={`photo.${photo.id}`}
              transition={galleryLocationTransition}
            >
              <Text style={styles.tileLocation}>{photo.location}</Text>
            </SharedElement>
          </View>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  back: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
  },
  title: {
    color: theme.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  grid: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tileWrapper: {
    width: TILE_W,
    height: TILE_W * 1.2,
  },
  tileWrapperTall: {
    height: TILE_W * 1.5,
  },
  tileFrame: {
    flex: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  tileFrameInner: {
    flex: 1,
    position: 'relative',
  },
  tilePhoto: {
    flex: 1,
  },
  tileGlyphWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized so list:detail ratio (72/160) matches fontSize ratio (54/120),
  // making the overlay's scaled-down detail glyph pixel-identical to the
  // real list glyph at handoff — no pop at session start/end.
  tileGlyphBox: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Children of a SharedElement get re-rendered standalone inside the
  // overlay (without the wrapping box's flex layout), so we centre the
  // glyph here so both the live and the carried copies stay anchored to
  // the same point.
  glyphCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: {
    fontSize: 54,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '200',
    textAlign: 'center',
    includeFontPadding: false,
  },
  tileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)',
  },
  tileMeta: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  tileTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tileLocation: {
    color: theme.text,
    fontSize: 12,
    marginTop: 2,
  },
});
