import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
        <View style={styles.header}>
          <Pressable onPress={() => goBack()} hitSlop={12}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.kicker}>Persistent playback</Text>
          <Text style={styles.title}>Listening room</Text>
        </View>

        <View style={styles.content}>
          <SharedElement.Live
            id="player"
            groupId={LIVE_PLAYER_GROUP}
            style={styles.player}
          >
            <LivePlayerSurface />
          </SharedElement.Live>

          <Pressable
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
            <Text style={styles.openLabel}>Open player</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B100E',
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  back: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 28,
  },
  kicker: {
    color: '#9BC7AE',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.text,
    fontSize: 36,
    fontWeight: '700',
    marginTop: 6,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingBottom: 64,
  },
  player: {
    height: 132,
  },
  openButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(216,230,163,0.36)',
  },
  openLabel: {
    color: '#D8E6A3',
    fontSize: 14,
    fontWeight: '700',
  },
});
