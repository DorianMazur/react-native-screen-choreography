import { codegenNativeComponent, type ViewProps } from 'react-native';
import type { Double, Int32 } from 'react-native/Libraries/Types/CodegenTypes';

export type ScrollAnchor = Readonly<{
  tag: Int32;
  x: Double;
  y: Double;
  xx: Double;
  xy: Double;
  yx: Double;
  yy: Double;
}>;

interface NativeProps extends ViewProps {
  anchors: ReadonlyArray<ScrollAnchor>;
  following?: boolean;
}

export default codegenNativeComponent<NativeProps>(
  'ScreenChoreographyScrollTrack'
);
