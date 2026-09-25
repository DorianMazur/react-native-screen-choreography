import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import NativeScreenChoreographyView from '../native/ScreenChoreographyViewNativeComponent';
import { OVERLAY_LAYER_Z_INDEX } from '../core/layers';

/** Persistent, interactive app controls above shared transitions. */
export function ChoreographyOverlay({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  return (
    <NativeScreenChoreographyView
      active
      foreground
      collapsable={false}
      pointerEvents="box-none"
      style={[
        styles.host,
        Platform.OS === 'ios' ? { width, height } : StyleSheet.absoluteFill,
      ]}
    >
      <View
        collapsable={false}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
      >
        {children}
      </View>
    </NativeScreenChoreographyView>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: OVERLAY_LAYER_Z_INDEX,
  },
});
