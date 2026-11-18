import { createContext, type ComponentProps, type ComponentType } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { ChoreographyProvider } from '../components/ChoreographyProvider';
import type { TrayAction, TrayStackState } from './stack';

/** Internal, opt-in instrumentation. No observer is installed by normal apps. */
export interface TrayDiagnostics {
  dispatch: (
    action: TrayAction,
    previous: TrayStackState,
    next: TrayStackState
  ) => void;
  choreography: Pick<
    ComponentProps<typeof ChoreographyProvider>,
    'onTransitionStart' | 'onTransitionEnd' | 'onPreparationTrace'
  >;
  Observer: ComponentType<{
    state: TrayStackState;
    progress: SharedValue<number>;
  }>;
}

export const TrayDiagnosticsContext = createContext<TrayDiagnostics | null>(
  null
);
