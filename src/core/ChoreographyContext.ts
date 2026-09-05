import { createContext } from 'react';
import type { ProgressOwnership } from './ProgressOwnership';
import type { SharedValue } from 'react-native-reanimated';
import type {
  ChoreographyDebugConfig,
  ChoreographyNavigationLineage,
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
  waitForScreenReady: (screenId: string) => Promise<boolean>;
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
  waitForScreenReady: (screenId: string) => Promise<boolean>;
  isElementHidden: (
    id: string,
    screenId: string,
    groupId?: string
  ) => SharedValue<number>;
  activeSession: TransitionSessionData | null;
  pendingTargetScreenId: string | null;
  setPendingTargetScreen: (screenId: string | null) => void;
  setNavigationLineage: (lineage: ChoreographyNavigationLineage) => void;
  getNavigationLineage: (
    screenId: string
  ) => ChoreographyNavigationLineage | null;
  progress: SharedValue<number>;
  progressOwnership: ProgressOwnership;
  preMeasureGroup: (groupId: string, screenId: string) => Promise<void>;
  refreshActiveSessionMetrics: (side: 'source' | 'target') => Promise<void>;
  waitForOverlayReady: (sessionId: string) => Promise<boolean>;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
  }) => Promise<TransitionSessionData | null>;
  completeTransition: (sessionId?: string) => void;
  cancelTransition: (sessionId?: string) => void;
  debug: ChoreographyDebugConfig;
}

export const ChoreographyContext =
  createContext<ChoreographyContextType | null>(null);
