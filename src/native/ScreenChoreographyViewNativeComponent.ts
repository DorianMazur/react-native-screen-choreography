import { codegenNativeComponent } from 'react-native';
import type { ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Double,
} from 'react-native/Libraries/Types/CodegenTypes';

export type PresentationReadyEvent = Readonly<{
  timestamp: Double;
}>;

interface NativeProps extends ViewProps {
  active?: boolean;
  onPresentationReady?: DirectEventHandler<PresentationReadyEvent>;
}

export default codegenNativeComponent<NativeProps>('ScreenChoreographyView');
