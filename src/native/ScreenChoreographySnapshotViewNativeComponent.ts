import { codegenNativeComponent } from 'react-native';
import type { ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Int32,
} from 'react-native/Libraries/Types/CodegenTypes';

export type CapturedEvent = Readonly<{
  captureId: string;
  success: boolean;
}>;

interface NativeProps extends ViewProps {
  sourceTag?: Int32;
  captureId?: string;
  stretch?: boolean;
  onCaptured?: DirectEventHandler<CapturedEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'ScreenChoreographySnapshotView'
);
