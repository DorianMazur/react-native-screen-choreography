import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import {
  ChoreographyScreen,
  SharedElement,
  SafeAreaView,
  useExampleNavigation,
} from '../runtime';
import { theme } from '../theme';
import { TRACKS, type Track } from './data';
import {
  musicBackgroundTransition,
  musicContentTransition,
  musicItemTransition,
} from './musicTransitions';
import { TrackItem } from './TrackItem';

export function MusicListScreen() {
  const { goBack, navigate } = useExampleNavigation('MusicList');

  return (
    <ChoreographyScreen screenId="MusicList">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => goBack()} hitSlop={12}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>For You</Text>
          <Text style={styles.subtitle}>Quiet picks for late evening</Text>
        </View>

        <FlatList
          data={TRACKS}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Row
              track={item}
              onPress={() =>
                navigate(
                  {
                    screen: 'NowPlaying',
                    params: { trackId: item.id },
                  },
                  {
                    transitionConfig: { group: `track.${item.id}` },
                  }
                )
              }
            />
          )}
        />
      </SafeAreaView>
    </ChoreographyScreen>
  );
}

function Row({ track, onPress }: { track: Track; onPress: () => void }) {
  const groupId = `track.${track.id}`;

  return (
    <Pressable onPress={onPress} style={styles.rowPressable}>
      <View style={styles.row}>
        <SharedElement
          id="background"
          groupId={groupId}
          transition={musicBackgroundTransition}
          style={styles.rowBackground}
        >
          <View style={styles.fill} />
        </SharedElement>

        <SharedElement
          id="item"
          groupId={groupId}
          transition={musicItemTransition}
          style={styles.itemLayer}
        >
          <TrackItem track={track} />
        </SharedElement>

        <SharedElement
          id="content"
          groupId={groupId}
          transition={musicContentTransition}
          style={styles.contentAnchor}
        >
          <View />
        </SharedElement>
      </View>
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
  list: {
    paddingHorizontal: 12,
    paddingBottom: 40,
    gap: 6,
  },
  rowPressable: {
    paddingHorizontal: 4,
  },
  row: {
    height: 76,
    position: 'relative',
  },
  rowBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  itemLayer: {
    ...StyleSheet.absoluteFill,
  },
  contentAnchor: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    height: 1,
  },
  fill: {
    flex: 1,
  },
});
