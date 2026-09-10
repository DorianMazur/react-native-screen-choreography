import React from 'react';
import {
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

const demos = [
  {
    route: 'GalleryList',
    title: 'Gallery',
    subtitle: 'A field journal',
    icon: 'camera',
    color: theme.gallery.accent,
  },
  {
    route: 'TokenList',
    title: 'Wallet',
    subtitle: 'Demo portfolio',
    icon: 'wallet',
    color: theme.wallet.accent,
  },
  {
    route: 'WalletSetup',
    title: 'Wallet setup',
    subtitle: 'Make yourself at home',
    icon: 'wallet',
    color: theme.success,
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
          <Text
            accessible={false}
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            screen-choreography
          </Text>
        </View>
        {demos.map((demo, index) => (
          <Pressable
            key={demo.route}
            accessibilityRole="button"
            accessibilityLabel={demo.title}
            onPress={() => open(demo.route)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.icon}>
              <AppIcon name={demo.icon} color={demo.color} size={28} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{demo.title}</Text>
              <Text style={styles.secondary}>{demo.subtitle}</Text>
            </View>
            <Text style={styles.index}>
              {String(index + 1).padStart(2, '0')}
            </Text>
            <AppIcon name="arrow" size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  scroll: { paddingBottom: 32 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  eyebrow: {
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 0,
  },
  packagePrefix: {
    fontFamily: theme.numbers,
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  title: {
    fontFamily: theme.font,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
    color: theme.text,
    marginTop: 6,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    gap: 12,
    flexWrap: 'wrap',
  },
  secondary: {
    fontFamily: theme.font,
    fontSize: 12,
    color: theme.textSecondary,
  },
  count: { fontFamily: theme.numbers, fontSize: 10, color: theme.accent },
  spectrum: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
    marginTop: 28,
    borderRadius: 2,
    overflow: 'hidden',
  },
  segment: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 21,
    fontWeight: '600',
    color: theme.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 104,
    marginHorizontal: 24,
    paddingVertical: 18,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  rowContent: { flex: 1, gap: 6 },
  rowTitle: {
    fontFamily: theme.font,
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  index: { fontFamily: theme.numbers, fontSize: 10, color: theme.textMuted },
  pressed: { opacity: 0.55 },
});
