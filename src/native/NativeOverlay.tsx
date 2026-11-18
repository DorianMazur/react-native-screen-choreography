import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import NativeScreenChoreographyView from './ScreenChoreographyViewNativeComponent';
import { OVERLAY_LAYER_Z_INDEX } from '../core/layers';

export function NativeOverlay({
  children,
  modal = false,
}: {
  children: ReactNode;
  modal?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  return (
    <NativeScreenChoreographyView
      active
      foreground
      modal={modal}
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
