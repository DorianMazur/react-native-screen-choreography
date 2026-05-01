import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import {
  ChoreographyScreen,
  SharedElement,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientBlock } from '../GradientBlock';
import { theme } from '../theme';
import { TRACKS, type Track } from './data';
import {
  musicCardTransition,
  musicArtworkTransition,
  musicTitleTransition,
  musicArtistTransition,
} from './musicTransitions';

export function MusicListScreen({ navigation }: { navigation: any }) {
  const { navigate } = useChoreographyNavigation(navigation);

  return (
    <ChoreographyScreen screenId="MusicList">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
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
                  'NowPlaying',
                  { trackId: item.id },
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
  return (
    <Pressable onPress={onPress} style={styles.rowPressable}>
      <SharedElement
        id={`track.${track.id}.card`}
        groupId={`track.${track.id}`}
        transition={musicCardTransition}
        style={styles.row}
      >
        <View style={styles.rowInner}>
          <SharedElement
            id={`track.${track.id}.artwork`}
            groupId={`track.${track.id}`}
            transition={musicArtworkTransition}
          >
            <GradientBlock
              from={track.gradientFrom}
              to={track.gradientTo}
              style={styles.artwork}
              borderRadius={theme.radius.sm}
            >
              <View style={styles.artGlyphWrap}>
                <Text style={styles.artGlyph}>{track.glyph}</Text>
              </View>
            </GradientBlock>
          </SharedElement>

          <View style={styles.meta}>
            <SharedElement
              id={`track.${track.id}.title`}
              groupId={`track.${track.id}`}
              transition={musicTitleTransition}
            >
              <Text style={styles.title2}>{track.title}</Text>
            </SharedElement>
            <SharedElement
              id={`track.${track.id}.artist`}
              groupId={`track.${track.id}`}
              transition={musicArtistTransition}
            >
              <Text style={styles.artist}>{track.artist}</Text>
            </SharedElement>
          </View>

          <Text style={styles.duration}>{track.duration}</Text>
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
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  artwork: {
    width: 56,
    height: 56,
  },
  artGlyphWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: {
    fontSize: 26,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '300',
  },
  meta: {
    flex: 1,
  },
  title2: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  artist: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  duration: {
    color: theme.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
