import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type {
  RegisteredElement,
  TransitionSessionData,
  TransitionConfig,
} from '../types';

/**
 * Stable callbacks that never change after provider initialisation.
 * SharedElement subscribes to this narrow context to avoid re-rendering
 * whenever transition state changes.
 */
export interface ChoreographyActionsType {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (id: string, screenId: string) => void;
  isElementHidden: (id: string, screenId: string) => SharedValue<number>;
}

export const ChoreographyActionsContext =
  createContext<ChoreographyActionsType | null>(null);

export interface ChoreographyContextType {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (id: string, screenId: string) => void;
  setScreenReady: (screenId: string, ready: boolean) => void;
  unregisterScreen: (screenId: string) => void;
  waitForScreenReady: (screenId: string) => Promise<void>;
  isElementHidden: (id: string, screenId: string) => SharedValue<number>;
  activeSession: TransitionSessionData | null;
  pendingTargetScreenId: string | null;
  setPendingTargetScreen: (screenId: string | null) => void;
  progress: SharedValue<number>;
  preMeasureGroup: (groupId: string, screenId: string) => Promise<void>;
  refreshActiveSessionMetrics: (side: 'source' | 'target') => Promise<void>;
  waitForOverlayReady: (sessionId: string) => Promise<void>;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
    transitionConfig?: TransitionConfig;
  }) => Promise<TransitionSessionData | null>;
  completeTransition: () => void;
  cancelTransition: () => void;
  debug: boolean;
}

export const ChoreographyContext =
  createContext<ChoreographyContextType | null>(null);
