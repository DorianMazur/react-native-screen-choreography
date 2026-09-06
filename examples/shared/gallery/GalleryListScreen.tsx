import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SharedElement, useExampleNavigation } from '../runtime';
import { SafeAreaView } from '../runtime';
import { AppIcon, ScreenHeader } from '../AppChrome';
import { theme } from '../theme';
import { PHOTOS, type Photo } from './data';
import {
  galleryFrameTransition,
  galleryPhotoTransition,
  galleryTitleTransition,
  galleryLocationTransition,
  galleryGlyphTransition,
} from './galleryTransitions';

const TILE_GAP = 12;

export function GalleryListScreen() {
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
              width={tileWidth}
              onPress={() =>
                navigate(
                  {
                    screen: 'GalleryDetail',
                    params: { photoId: photo.id },
                  },
                  {
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
}: {
  photo: Photo;
  width: number;
  onPress: () => void;
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
            <Image
              source={photo.image}
              resizeMode="cover"
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
                <AppIcon name="camera" size={14} />
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
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  tileFrameInner: {
    flex: 1,
    position: 'relative',
  },
  tilePhoto: {
    width: '100%',
    height: '100%',
  },
  tileGlyphWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  tileGlyphBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  tileLocation: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 11,
    marginTop: 2,
  },
});
