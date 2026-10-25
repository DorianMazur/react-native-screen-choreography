import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  defineTransition,
  useSharedElementPresentation,
} from 'react-native-screen-choreography/core';
import { AppIcon } from '../AppChrome';
import { trayTheme } from './TrayChrome';

export const galleryPlusGroup = 'gallery-plus';
export const galleryPlusTransition = defineTransition({
  shared: { hero: { kind: 'bounds' } },
});

const postcards = [
  { image: require('../assets/photos/forest.jpg'), x: -110, y: 36, angle: -17 },
  { image: require('../assets/photos/dunes.jpg'), x: 100, y: 24, angle: 15 },
  { image: require('../assets/photos/aurora.jpg'), x: -61, y: 3, angle: -9 },
  { image: require('../assets/photos/coast.jpg'), x: 58, y: -6, angle: 12 },
] as const;

function Postcard({ card }: { card: (typeof postcards)[number] }) {
  const { presentationProgress } = useSharedElementPresentation();
  const motion = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, presentationProgress.value));
    return {
      transform: [
        { translateX: card.x * (1 - 0.32 * progress) },
        { translateY: card.y * (1 - 0.5 * progress) },
        { rotate: `${card.angle * (1 - 0.35 * progress)}deg` },
        { scale: 1 - 0.35 * progress },
      ],
    };
  });
  return (
    <Animated.View style={[styles.postcard, motion]}>
      <Image source={card.image} style={styles.photo} resizeMode="cover" />
      <View style={styles.captionLine} />
    </Animated.View>
  );
}

/** One live composition travels into the plans screen and back. */
export function GalleryPlusHero() {
  const { presentationProgress } = useSharedElementPresentation();
  const artwork = useAnimatedStyle(() => ({
    height: 184 - 72 * Math.max(0, Math.min(1, presentationProgress.value)),
  }));
  const badge = useAnimatedStyle(() => ({
    transform: [
      {
        scale: 1 - 0.16 * Math.max(0, Math.min(1, presentationProgress.value)),
      },
    ],
  }));
  const halo = useAnimatedStyle(() => ({
    transform: [
      { rotate: '-12deg' },
      {
        scale: 1 - 0.35 * Math.max(0, Math.min(1, presentationProgress.value)),
      },
    ],
  }));

  return (
    <View style={styles.hero}>
      <Animated.View
        style={[styles.artwork, artwork]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.halo, halo]} />
        {postcards.map((card, index) => (
          <Postcard key={index} card={card} />
        ))}
        <Animated.View style={[styles.badge, badge]}>
          <AppIcon name="camera" color={trayTheme.onAccent} size={30} />
          <View style={styles.plus}>
            <AppIcon name="plus" color={trayTheme.accent} size={13} />
          </View>
        </Animated.View>
      </Animated.View>
      <Text accessibilityRole="header" style={styles.title}>
        Gallery <Text style={styles.plusText}>Plus</Text>
      </Text>
      <Text style={styles.subtitle}>For everything worth keeping.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: '100%', alignItems: 'center' },
  artwork: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 230,
    height: 100,
    borderRadius: 80,
    backgroundColor: trayTheme.accentSoft,
  },
  postcard: {
    position: 'absolute',
    width: 74,
    height: 94,
    padding: 5,
    borderRadius: 8,
    backgroundColor: trayTheme.surfaceRaised,
    borderWidth: 1,
    borderColor: trayTheme.borderStrong,
  },
  photo: { width: '100%', flex: 1, borderRadius: 4 },
  captionLine: {
    width: 24,
    height: 2,
    marginTop: 6,
    marginBottom: 3,
    backgroundColor: trayTheme.muted,
  },
  badge: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: trayTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.25)',
  },
  plus: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: trayTheme.onAccent,
    borderWidth: 2,
    borderColor: trayTheme.accent,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    color: trayTheme.text,
    letterSpacing: -1,
    lineHeight: 42,
  },
  plusText: { color: trayTheme.accent },
  subtitle: {
    fontSize: 13,
    lineHeight: 22,
    color: trayTheme.muted,
    textAlign: 'center',
  },
});
