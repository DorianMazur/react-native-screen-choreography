import * as Fantom from '@react-native/fantom';
import { createRef } from 'react';
import { findNodeHandle, StyleSheet, View } from 'react-native';

const styles = StyleSheet.create({
  unrelated: { width: 1, height: 1 },
  screen: { position: 'absolute', left: 16, top: 24, width: 400, height: 5000 },
  endpoint: { position: 'absolute', width: 10, height: 10 },
});

export function createFixture(count, unrelatedCount = 0) {
  const root = Fantom.createRoot({ viewportWidth: 500, viewportHeight: 6000 });
  const screen = createRef();
  const otherScreen = createRef();
  const refs = Array.from({ length: count }, () => createRef());
  const render = (offset = 0, visibleCount = count, width = 10) => {
    Fantom.runTask(() => {
      root.render(
        <View>
          <View ref={otherScreen} collapsable={false}>
            {Array.from({ length: unrelatedCount }, (_, i) => (
              <View key={i} collapsable={false} style={styles.unrelated} />
            ))}
          </View>
          <View ref={screen} collapsable={false} style={styles.screen}>
            {refs.slice(0, visibleCount).map((ref, i) => (
              <View
                key={i}
                ref={ref}
                collapsable={false}
                style={[
                  styles.endpoint,
                  { left: 8 + offset, top: i * 12, width },
                ]}
              />
            ))}
          </View>
        </View>
      );
    });
    // Drain mount notifications, just as preparation's JS listener would.
    Fantom.runWorkLoop();
    root.takeMountingManagerLogs();
  };
  render();
  const tags = refs.map((ref) => findNodeHandle(ref.current));
  const screens = tags.map(() => findNodeHandle(screen.current));
  if (tags.some((tag) => tag == null) || screens.some((tag) => tag == null)) {
    throw new Error('The benchmark did not mount real Fabric endpoints');
  }
  return {
    root,
    tags,
    screens,
    entries: refs.map((ref, i) => ({
      id: `element-${i}`,
      ref,
      screenRef: screen,
    })),
    otherScreen: findNodeHandle(otherScreen.current),
    render,
    capture: () =>
      global.__screenChoreographyCaptureFabricLayout(screens, tags),
    request: () =>
      global.__screenChoreographyRequestFabricLayout(screens, tags),
    destroy: () => root.destroy(),
  };
}

export function expectedFrames(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    pageX: 24 + offset,
    pageY: 24 + i * 12,
    width: 10,
    height: 10,
  }));
}
