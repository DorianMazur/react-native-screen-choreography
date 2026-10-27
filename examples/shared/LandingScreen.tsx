import React from 'react';
import {
  Image,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from 'react-native';
import { AppIcon } from './AppChrome';
import { SafeAreaView, useExampleNavigation } from './runtime';
import { theme } from './theme';
import { TrayDemoLauncher } from './tray/TrayDemo';
import { GalleryPlusTrayLauncher } from './tray/GalleryPlusTray';

const demos = [
  {
    route: 'GalleryList',
    title: 'Gallery',
    subtitle: 'A field journal',
    image: require('./assets/photos/aurora.jpg'),
  },
  {
    route: 'TripsList',
    title: 'Trips',
    subtitle: 'Your next adventure',
    image: require('./trips/assets/cabin.jpg'),
  },
  {
    route: 'TokenList',
    title: 'Wallet',
    subtitle: 'Demo portfolio',
    image: null,
  },
] as const;

export function LandingScreen() {
  const { open } = useExampleNavigation();

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel="react-native-screen-choreography"
          style={styles.header}
        >
          <Text accessible={false} style={styles.packagePrefix}>
            react-native
          </Text>
          <Text accessible={false} style={styles.title}>
            Screen{'\n'}choreography
          </Text>
          <Text accessible={false} style={styles.intro}>
            Explore shared motion.
          </Text>
        </View>
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Explore the demos
          </Text>
        </View>
        {demos.map((demo) => (
          <Pressable
            key={demo.route}
            accessibilityRole="button"
            accessibilityLabel={demo.title}
            onPress={() => open(demo.route)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {demo.image ? (
              <Image
                accessible={false}
                source={demo.image}
                style={styles.thumbnail}
              />
            ) : (
              <View style={[styles.thumbnail, styles.walletPreview]}>
                <AppIcon name="wallet" color={theme.accent} size={32} />
                <Text accessible={false} style={styles.walletLabel}>
                  USD
                </Text>
              </View>
            )}
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{demo.title}</Text>
              <Text style={styles.secondary}>{demo.subtitle}</Text>
            </View>
            <AppIcon name="arrow" size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
        <View style={[styles.sectionHeader, styles.trayHeader]}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Dynamic trays
          </Text>
          <Text style={styles.sectionMeta}>Keep exploring, in a sheet.</Text>
        </View>
        <View style={styles.trays}>
          <TrayDemoLauncher />
          <GalleryPlusTrayLauncher />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  scroll: { paddingBottom: 32 },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },
  packagePrefix: {
    fontFamily: theme.numbers,
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  title: {
    fontFamily: theme.font,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '600',
    letterSpacing: -1.2,
    color: theme.text,
  },
  intro: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  sectionHeader: { paddingHorizontal: 24, gap: 5, marginBottom: 8 },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 17,
    fontWeight: '600',
    color: theme.text,
  },
  sectionMeta: {
    fontFamily: theme.font,
    fontSize: 12,
    color: theme.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 96,
    marginHorizontal: 24,
    paddingVertical: 12,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  thumbnail: {
    width: 64,
    height: 72,
    borderRadius: 14,
    backgroundColor: theme.surface,
  },
  walletPreview: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  walletLabel: {
    fontFamily: theme.numbers,
    fontSize: 11,
    color: theme.textSecondary,
  },
  rowContent: { flex: 1, gap: 4 },
  rowTitle: {
    fontFamily: theme.font,
    fontSize: 22,
    fontWeight: '600',
    color: theme.text,
  },
  secondary: {
    fontFamily: theme.font,
    fontSize: 13,
    color: theme.textSecondary,
  },
  trayHeader: { marginTop: 28, marginBottom: 14 },
  trays: { gap: 12 },
  pressed: { opacity: 0.65 },
});
