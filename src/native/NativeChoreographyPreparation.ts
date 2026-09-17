import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type {
  Double,
  EventEmitter,
} from 'react-native/Libraries/Types/CodegenTypes';

export type LayoutPreparationResult = {
  ready: boolean;
  sampleCount: Double;
  elapsedMs: Double;
};

export interface Spec extends TurboModule {
  readonly onOverlayPresented: EventEmitter<{
    sessionId: string;
    timestamp: Double;
  }>;
  awaitLayout(
    requestId: string,
    screenTag: Double,
    viewTags: ReadonlyArray<Double>,
    timeoutMs: Double
  ): Promise<LayoutPreparationResult>;
  cancel(requestId: string): void;
}

export default TurboModuleRegistry.get<Spec>('ScreenChoreographyPreparation');
