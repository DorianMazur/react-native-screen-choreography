import React from 'react';
import NativeSnapshotView from './ScreenChoreographySnapshotViewNativeComponent';

/** A native presentation retained independently of its source React subtree. */
export function RetainedView(
  props: React.ComponentProps<typeof NativeSnapshotView>
) {
  return (
    <NativeSnapshotView {...props} pointerEvents="none" collapsable={false} />
  );
}
