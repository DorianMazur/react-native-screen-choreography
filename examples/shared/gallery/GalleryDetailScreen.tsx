import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Modal,
  Share,
  StatusBar,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  SharedElement,
  useChoreographyControls,
  useExampleNavigation,
  useLatchedReveal,
  useStaggeredReveal,
} from '../runtime';
import { SafeAreaView } from '../runtime';
import { AppIcon, IconButton, ScreenHeader } from '../AppChrome';
import { theme } from '../theme';
import { PHOTOS } from './data';
import {
  galleryFrameTransition,
  galleryPhotoTransition,
  galleryTitleTransition,
  galleryLocationTransition,
  galleryGlyphTransition,
} from './galleryTransitions';

export function GalleryDetailScreen({
  photoId = 'aurora',
}: {
  photoId?: string;
}) {
  const photo = PHOTOS.find((item) => item.id === photoId) ?? PHOTOS[0]!;
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const { goBack } = useExampleNavigation();
  const { settleTransition } = useChoreographyControls();
  const showSections = useLatchedReveal({ resetKey: photo.id });
  const { getItemStyle } = useStaggeredReveal(3, { stagger: 0.06 });
  const notesStyle = getItemStyle(0);
  const exposureStyle = getItemStyle(1);
  const actionsStyle = getItemStyle(2);

  return (
    <>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader
          title="Field notes"
          onBack={() => goBack()}
          backLabel="Back to gallery"
        />
        <ScrollView
          onScrollBeginDrag={settleTransition}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <SharedElement
            id={`photo.${photo.id}.frame`}
            groupId={`photo.${photo.id}`}
            transition={galleryFrameTransition}
            style={styles.frame}
          >
            <View style={styles.frameInner}>
              <SharedElement
                id={`photo.${photo.id}.photo`}
                groupId={`photo.${photo.id}`}
                transition={galleryPhotoTransition}
                style={StyleSheet.absoluteFill}
              >
                <Image
                  source={photo.image}
                  resizeMode="cover"
                  style={styles.heroPhoto}
                />
                <View style={styles.heroScrim} pointerEvents="none" />
              </SharedElement>

              <View style={styles.heroGlyphWrap} pointerEvents="none">
                <SharedElement
                  id={`photo.${photo.id}.glyph`}
                  groupId={`photo.${photo.id}`}
                  transition={galleryGlyphTransition}
                  style={styles.heroGlyphBox}
                >
                  <View style={styles.glyphCenter}>
                    <AppIcon name="camera" size={21} />
                  </View>
                </SharedElement>
              </View>

              <View style={styles.heroMeta}>
                <SharedElement
                  id={`photo.${photo.id}.title`}
                  groupId={`photo.${photo.id}`}
                  transition={galleryTitleTransition}
                >
                  <Text style={styles.heroTitle}>{photo.title}</Text>
                </SharedElement>
                <SharedElement
                  id={`photo.${photo.id}.location`}
                  groupId={`photo.${photo.id}`}
                  transition={galleryLocationTransition}
                >
                  <Text style={styles.heroLocation}>{photo.location}</Text>
                </SharedElement>
              </View>
            </View>
          </SharedElement>

          {showSections ? (
            <>
              <Animated.View style={[styles.section, notesStyle]}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.body}>{photo.description}</Text>
              </Animated.View>

              <Animated.View style={[styles.section, exposureStyle]}>
                <Text style={styles.sectionTitle}>Exposure</Text>
                <View style={styles.exifRow}>
                  <ExifChip label="ISO" value={photo.iso.replace('ISO ', '')} />
                  <ExifChip label="Shutter" value={photo.shutter} />
                  <ExifChip label="Aperture" value={photo.aperture} />
                </View>
              </Animated.View>

              <Animated.View
                style={[styles.section, styles.actionRow, actionsStyle]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View full photo"
                  onPress={() => setLightboxVisible(true)}
                  style={styles.primaryAction}
                >
                  <AppIcon name="expand" size={18} color={theme.ink} />
                  <Text style={styles.primaryActionText}>View photo</Text>
                </Pressable>
                <IconButton
                  icon="share"
                  label="Share photo notes"
                  onPress={() => {
                    void Share.share({
                      message: `${photo.title} - ${photo.location}\n\n${photo.description}`,
                    }).catch(() => {});
                  }}
                />
              </Animated.View>
            </>
          ) : null}
        </ScrollView>
        <Modal
          visible={lightboxVisible}
          animationType="fade"
          onRequestClose={() => setLightboxVisible(false)}
        >
          <SafeAreaView style={styles.container}>
            <ScreenHeader
              title={photo.title}
              onBack={() => setLightboxVisible(false)}
              backLabel="Close full photo"
            />
            <Image
              source={photo.image}
              accessibilityLabel={photo.title}
              resizeMode="contain"
              style={styles.lightbox}
            />
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </>
  );
}

function ExifChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.exifChip}>
      <Text style={styles.exifLabel}>{label}</Text>
      <Text style={styles.exifValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scroll: {
    paddingBottom: 40,
  },
  frame: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
  },
  frameInner: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
  },
  heroGlyphWrap: {
    position: 'absolute',
    top: 18,
    right: 18,
  },
  heroGlyphBox: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)',
  },
  lightbox: { flex: 1, width: '100%' },
  heroMeta: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
  },
  heroTitle: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 32,
    fontWeight: '600',
  },
  heroLocation: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 15,
    marginTop: 4,
  },
  section: {
    marginHorizontal: 24,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sectionTitle: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  exifRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exifChip: {
    flex: 1,
    paddingTop: 12,
  },
  exifLabel: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  exifValue: {
    fontFamily: theme.numbers,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    fontFamily: theme.font,
    color: theme.ink,
    fontWeight: '600',
    fontSize: 15,
  },
});
