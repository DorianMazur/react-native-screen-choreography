import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView, SharedElement, useExampleNavigation } from '../runtime';
import { theme } from '../theme';
import { TRACKS } from './data';
import { musicBackgroundTransition } from './musicTransitions';
import { IconButton } from '../AppChrome';
import { InteractiveBackGesture } from '../InteractiveBackGesture';
import {
  LIVE_GEOMETRY_HEIGHT,
  LIVE_GEOMETRY_TARGET_HEIGHT,
  LIVE_GEOMETRY_TARGET_WIDTH,
  LIVE_GEOMETRY_WIDTH,
  liveGeometryMetadata,
  liveGeometryTransition,
} from './liveGeometryTransition';

export function NowPlayingScreen({
  trackId = TRACKS[0]!.id,
}: {
  trackId?: string;
}) {
  const track = TRACKS.find((item) => item.id === trackId) ?? TRACKS[0]!;
  const { goBack } = useExampleNavigation();
  const groupId = `track.${track.id}`;

  return (
    <InteractiveBackGesture>
      {(panHandlers) => (
        <View style={styles.root}>
          <StatusBar barStyle="light-content" />
          <SafeAreaView style={styles.foreground} pointerEvents="box-none">
            <View style={styles.card}>
              <SharedElement
                id="background"
                groupId={groupId}
                transition={musicBackgroundTransition}
                style={styles.screenBackground}
              >
                <View style={styles.toolbar}>
                  <View style={styles.handleCenter} pointerEvents="box-none">
                    <View
                      testID="music-player-handle"
                      accessibilityLabel="Drag down to close player"
                      style={styles.handleSlot}
                      {...panHandlers}
                    >
                      <View style={styles.handle} />
                    </View>
                  </View>
                  <IconButton
                    icon="close"
                    label="Close player"
                    onPress={() => goBack()}
                  />
                </View>
              </SharedElement>

              <SharedElement.LiveTarget
                id="item"
                groupId={groupId}
                style={styles.player}
              />

              <SharedElement.LiveTarget
                id="geometry-panel"
                groupId={groupId}
                transition={liveGeometryTransition}
                metadata={liveGeometryMetadata}
                style={styles.geometryTarget}
                hostStyle={styles.geometryHost}
              />
            </View>
          </SafeAreaView>
        </View>
      )}
    </InteractiveBackGesture>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  screenBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.bg,
    borderRadius: theme.radius.md,
  },
  foreground: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  toolbar: {
    position: 'absolute',
    top: -56,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  handleCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleSlot: {
    width: 100,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 50,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.borderStrong,
  },
  card: { flex: 1, marginHorizontal: 16, marginTop: 56 },
  player: { flex: 1 },
  geometryTarget: {
    width: LIVE_GEOMETRY_TARGET_WIDTH,
    height: LIVE_GEOMETRY_TARGET_HEIGHT,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  geometryHost: {
    right: 'auto',
    bottom: 'auto',
    width: LIVE_GEOMETRY_WIDTH,
    height: LIVE_GEOMETRY_HEIGHT,
    transformOrigin: 'top left',
    transform: [
      { scaleX: LIVE_GEOMETRY_TARGET_WIDTH / LIVE_GEOMETRY_WIDTH },
      { scaleY: LIVE_GEOMETRY_TARGET_HEIGHT / LIVE_GEOMETRY_HEIGHT },
    ],
  },
});
