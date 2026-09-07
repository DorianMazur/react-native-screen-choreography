import { View, Text, StyleSheet, FlatList, StatusBar } from 'react-native';
import { ScreenHeader } from '../AppChrome';
import { SharedElement, SafeAreaView, useExampleNavigation } from '../runtime';
import { theme } from '../theme';
import { TRACKS, type Track } from './data';
import { musicBackgroundTransition } from './musicTransitions';
import { TrackItem } from './TrackItem';

export function MusicListScreen() {
  const { goBack, navigate } = useExampleNavigation();

  return (
    <>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Music" onBack={() => goBack()} />
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YOUR DAILY ROTATION</Text>
          <Text accessibilityRole="header" style={styles.title}>
            On repeat
          </Text>
          <View style={styles.summary}>
            <Text style={styles.subtitle}>Quiet picks for late evening</Text>
            <Text style={styles.count}>{TRACKS.length} TRACKS</Text>
          </View>
        </View>

        <FlatList
          data={TRACKS}
          keyExtractor={(track) => track.id}
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Library
              </Text>
              <Text style={styles.eyebrow}>DURATION</Text>
            </View>
          }
          contentContainerStyle={styles.list}
          removeClippedSubviews={false}
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
    </>
  );
}

function Row({ track, onPress }: { track: Track; onPress: () => void }) {
  const groupId = `track.${track.id}`;

  return (
    <View style={styles.rowPressable}>
      <View style={styles.row}>
        <SharedElement
          id="background"
          groupId={groupId}
          transition={musicBackgroundTransition}
          style={styles.rowBackground}
        >
          <View style={styles.fill} />
        </SharedElement>

        <SharedElement.Live
          id="item"
          groupId={groupId}
          style={styles.itemLayer}
        >
          <TrackItem track={track} onOpen={onPress} />
        </SharedElement.Live>
      </View>
    </View>
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
  count: { fontFamily: theme.numbers, fontSize: 10, color: theme.music.accent },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 24,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 21,
    fontWeight: '600',
    color: theme.text,
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  rowPressable: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  row: {
    height: 76,
    position: 'relative',
  },
  rowBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.surfaceMuted,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  itemLayer: {
    ...StyleSheet.absoluteFill,
  },
  fill: {
    flex: 1,
  },
});
