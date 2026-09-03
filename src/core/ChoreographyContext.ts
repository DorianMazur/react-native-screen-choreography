import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type {
  ChoreographyDebugConfig,
  RegisteredElement,
  TransitionSessionData,
} from '../types';

export interface ChoreographyActionsType {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (
    id: string,
    screenId: string,
    groupId: string | undefined
  ) => void;
  isElementHidden: (
    id: string,
    screenId: string,
    groupId?: string
  ) => SharedValue<number>;
  setScreenReady: (screenId: string, ready: boolean) => void;
  unregisterScreen: (screenId: string) => void;
  acquireScreenBlocker: (screenId: string) => () => void;
  getSettledScreenId: () => string | null;
  waitForScreenReady: (screenId: string) => Promise<void>;
}

export const ChoreographyActionsContext =
  createContext<ChoreographyActionsType | null>(null);

export interface ChoreographyContextType {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (
    id: string,
    screenId: string,
    groupId: string | undefined
  ) => void;
  setScreenReady: (screenId: string, ready: boolean) => void;
  unregisterScreen: (screenId: string) => void;
  acquireScreenBlocker: (screenId: string) => () => void;
  waitForScreenReady: (screenId: string) => Promise<void>;
  isElementHidden: (
    id: string,
    screenId: string,
    groupId?: string
  ) => SharedValue<number>;
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
  }) => Promise<TransitionSessionData | null>;
  completeTransition: () => void;
  cancelTransition: () => void;
  debug: ChoreographyDebugConfig;
}

export const ChoreographyContext =
  createContext<ChoreographyContextType | null>(null);
