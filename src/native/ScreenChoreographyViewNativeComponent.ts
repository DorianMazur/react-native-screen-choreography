import { codegenNativeComponent } from 'react-native';
import type { ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Double,
} from 'react-native/Libraries/Types/CodegenTypes';

export type PresentationReadyEvent = Readonly<{
  timestamp: Double;
  sessionId: string;
  stage: string;
}>;

interface NativeProps extends ViewProps {
  active?: boolean;
  foreground?: boolean;
  sessionId?: string;
  expectedHostNames?: ReadonlyArray<string>;
  onPresentationReady?: DirectEventHandler<PresentationReadyEvent>;
}

export default codegenNativeComponent<NativeProps>('ScreenChoreographyView');
