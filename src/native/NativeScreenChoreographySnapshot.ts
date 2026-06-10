import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { Double } from 'react-native/Libraries/Types/CodegenTypes';

export type SnapshotResult = {
  /** file:// URI of the captured PNG. */
  uri: string;
  /** Width in density-independent points. */
  width: Double;
  /** Height in density-independent points. */
  height: Double;
};

export interface Spec extends TurboModule {
  /** Capture a bitmap of the view subtree identified by `reactTag`. */
  captureView(reactTag: Double): Promise<SnapshotResult>;
  /** Delete a previously captured snapshot file. */
  releaseSnapshot(uri: string): void;
}

export default TurboModuleRegistry.get<Spec>('ScreenChoreographySnapshot');
