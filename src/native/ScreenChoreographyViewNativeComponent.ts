import type * as React from 'react';
import { codegenNativeCommands, codegenNativeComponent } from 'react-native';
import type { HostComponent, ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Double,
} from 'react-native/Libraries/Types/CodegenTypes';

export type PresentationReadyEvent = Readonly<{
  timestamp: Double;
  sessionId: string;
  stage: string;
  preparedAtMs: Double;
  attachedAtMs: Double;
  contentReadyAtMs: Double;
  presentedAtMs: Double;
}>;

interface NativeProps extends ViewProps {
  active?: boolean;
  foreground?: boolean;
  inputTarget?: string;
  sessionId?: string;
  presentationRequested?: boolean;
  expectedHostNames?: ReadonlyArray<string>;
  onPresentationReady?: DirectEventHandler<PresentationReadyEvent>;
}

interface NativeCommands {
  prepare: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    sessionId: string
  ) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['prepare'],
});

export default codegenNativeComponent<NativeProps>('ScreenChoreographyView');
