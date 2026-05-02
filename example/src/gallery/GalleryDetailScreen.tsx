import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ChoreographyScreen,
  SharedElement,
  useChoreographyNavigation,
  useChoreographyProgress,
  useLatchedReveal,
  useStaggeredReveal,
} from 'react-native-screen-choreography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientBlock } from '../GradientBlock';
import { theme } from '../theme';
import { PHOTOS } from './data';
import {
  galleryFrameTransition,
  galleryPhotoTransition,
  galleryTitleTransition,
  galleryLocationTransition,
  galleryGlyphTransition,
} from './galleryTransitions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function GalleryDetailScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const photoId = route.params?.photoId ?? 'aurora';
  const photo = PHOTOS.find((p) => p.id === photoId) ?? PHOTOS[0]!;
  const { goBack } = useChoreographyNavigation(navigation);
  const { settleTransition } = useChoreographyProgress();
  const showSections = useLatchedReveal({ resetKey: photo.id });
  const { getItemStyle } = useStaggeredReveal(3, { stagger: 0.06 });
  const notesStyle = getItemStyle(0);
  const exposureStyle = getItemStyle(1);
  const actionsStyle = getItemStyle(2);

  return (
    <ChoreographyScreen screenId="GalleryDetail">
      <SafeAreaView style={styles.container} edges={['bottom']}>
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
                <GradientBlock
                  from={photo.gradientFrom}
                  to={photo.gradientTo}
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
                    <Text style={styles.heroGlyph}>{photo.glyph}</Text>
                  </View>
                </SharedElement>
              </View>

              <Pressable
                onPress={() => goBack()}
                style={styles.closeButton}
                hitSlop={12}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>

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
                <Pressable style={styles.primaryAction}>
                  <Text style={styles.primaryActionText}>Open in Lightbox</Text>
                </Pressable>
                <Pressable style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>Share</Text>
                </Pressable>
              </Animated.View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ChoreographyScreen>
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
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.2,
    overflow: 'hidden',
  },
  frameInner: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  heroPhoto: {
    flex: 1,
  },
  heroGlyphWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Square box so the source/target SharedElement aspect ratios match and
  // the stretch renderer scales the glyph uniformly. Sized to match the
  // 120pt glyph's natural footprint.
  heroGlyphBox: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The overlay re-renders SharedElement children without the wrapping
  // box's flex layout, so we recentre the glyph inside its own bounds.
  glyphCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlyph: {
    fontSize: 120,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '200',
    textAlign: 'center',
    includeFontPadding: false,
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
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: 'white',
    fontSize: 22,
    fontWeight: '300',
    marginTop: -2,
  },
  heroMeta: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
  },
  heroTitle: {
    color: theme.text,
    fontSize: 32,
    fontWeight: '700',
  },
  heroLocation: {
    color: theme.text,
    fontSize: 15,
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
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
    backgroundColor: theme.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  exifLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  exifValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: theme.gallery.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#1A0A0F',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: theme.surfaceMuted,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 15,
  },
});
