import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon, ScreenHeader } from '../AppChrome';
import { SafeAreaView, SharedElement, useExampleNavigation } from '../runtime';
import { theme } from '../theme';
import {
  LIVE_PLAYER_GROUP,
  LIVE_PLAYER_SPRING,
  LivePlayerSurface,
} from './LivePlayerSurface';

export function LivePlayerListScreen() {
  const { goBack, navigate } = useExampleNavigation();

  return (
    <>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Live player" onBack={() => goBack()} />
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.kicker}>THE LIVE SESSIONS</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Listening room
            </Text>
            <Text style={styles.subtitle}>A little space to slow down</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                In session
              </Text>
              <Text style={styles.sessionLabel}>DEMO / 01</Text>
            </View>
            <SharedElement.Live
              id="player"
              groupId={LIVE_PLAYER_GROUP}
              style={styles.player}
            >
              <LivePlayerSurface />
            </SharedElement.Live>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open player"
              style={styles.openButton}
              onPress={() =>
                navigate(
                  { screen: 'LivePlayerDetail' },
                  {
                    transitionConfig: { group: LIVE_PLAYER_GROUP },
                    spring: LIVE_PLAYER_SPRING,
                  }
                )
              }
            >
              <AppIcon name="expand" color={theme.ink} size={18} />
              <Text style={styles.openLabel}>Open player</Text>
            </Pressable>
            <View style={styles.queue}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Up next
              </Text>
              <View style={styles.queueRow}>
                <Image
                  source={require('../assets/photos/coast.jpg')}
                  style={styles.queueArt}
                />
                <View style={styles.queueCopy}>
                  <Text style={styles.trackTitle}>Glass Signals</Text>
                  <Text style={styles.subtitle}>Mara Ell</Text>
                </View>
                <Text style={styles.duration}>4:08</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scroll: { paddingBottom: 32 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  kicker: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
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
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 21,
    fontWeight: '600',
    color: theme.text,
  },
  sessionLabel: {
    fontFamily: theme.numbers,
    fontSize: 10,
    color: theme.accent,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  player: {
    height: 160,
  },
  openButton: {
    minHeight: 48,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.accent,
  },
  openLabel: {
    fontFamily: theme.font,
    color: theme.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  queue: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  queueRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  queueArt: { width: 48, height: 48, borderRadius: 8 },
  queueCopy: { flex: 1 },
  trackTitle: {
    fontFamily: theme.font,
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  duration: {
    fontFamily: theme.numbers,
    fontSize: 11,
    color: theme.textSecondary,
  },
});
