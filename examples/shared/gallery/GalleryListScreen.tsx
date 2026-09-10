import { GalleryScrim } from './GalleryScrim';
import React from 'react';
import {
  Image,
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
import { AppIcon, ScreenHeader } from '../AppChrome';
import { theme } from '../theme';
import { PHOTOS, type Photo } from './data';
import {
  galleryTransition,
  galleryLocationTransition,
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
                    ...galleryTransition.navigationOptions,
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
      <galleryTransition.Element
        name="frame"
        groupId={`photo.${photo.id}`}
        style={styles.tileFrame}
      >
        <View style={styles.tileFrameInner}>
          <galleryTransition.Element
            name="photo"
            groupId={`photo.${photo.id}`}
            style={StyleSheet.absoluteFill}
          >
            <Image
              source={photo.image}
              resizeMode="cover"
              fadeDuration={0}
              style={StyleSheet.absoluteFill}
            />
          </galleryTransition.Element>
          <GalleryScrim />
          <View style={styles.tileGlyphWrap} pointerEvents="none">
            <galleryTransition.Element
              name="glyph"
              groupId={`photo.${photo.id}`}
              style={styles.tileGlyphBox}
            >
              <View style={styles.glyphCenter}>
                <AppIcon name="camera" size={14} />
              </View>
            </galleryTransition.Element>
          </View>
          <View style={styles.tileMeta}>
            <galleryTransition.Element
              name="title"
              groupId={`photo.${photo.id}`}
            >
              <Text style={styles.tileTitle}>{photo.title}</Text>
            </galleryTransition.Element>
            <SharedElement
              id="location"
              groupId={`photo.${photo.id}`}
              transition={galleryLocationTransition}
            >
              <Text style={styles.tileLocation}>{photo.location}</Text>
            </SharedElement>
          </View>
        </View>
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
    backgroundColor: theme.surface,
  },
  tileFrameInner: {
    flex: 1,
    position: 'relative',
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
