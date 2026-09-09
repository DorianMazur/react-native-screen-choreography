import { createContext } from 'react';
import type { ProgressOwnership } from './ProgressOwnership';
import type { NavigationSessionController } from './NavigationSessionController';
import type { SharedValue } from 'react-native-reanimated';
import type { View } from 'react-native';
import type { ReverseTransitionController } from './ReverseTransitionController';
import type { ReverseCommitRequest } from '../hooks/useReverseTransitionCommit';
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
  setScreenReady: (
    screenId: string,
    ready: boolean,
    screenName?: string
  ) => void;
  unregisterScreen: (screenId: string) => void;
  acquireScreenBlocker: (screenId: string) => () => void;
  getSettledScreenId: () => string | null;
  waitForScreenReady: (screenId: string) => Promise<boolean>;
  registerScreenPresentation: (
    screenId: string,
    ref: React.RefObject<React.ComponentRef<typeof View> | null>
  ) => () => void;
}

export const ChoreographyActionsContext =
  createContext<ChoreographyActionsType | null>(null);

export interface ChoreographyControlsType {
  progress: SharedValue<number>;
  settleTransition: (screenId: string) => void;
}

export const ChoreographyControlsContext =
  createContext<ChoreographyControlsType | null>(null);

export interface ChoreographyContextType {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (
    id: string,
    screenId: string,
    groupId: string | undefined
  ) => void;
  setScreenReady: (
    screenId: string,
    ready: boolean,
    screenName?: string
  ) => void;
  resolveScreenId: (
    screenId: string,
    preferredInstanceId?: string
  ) => string | null;
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
  pendingSourceScreenId: string | null;
  setPendingTargetScreen: (
    screenId: string | null,
    sourceScreenId?: string
  ) => void;
  setNavigationLineage: (lineage: ChoreographyNavigationLineage) => void;
  getNavigationLineage: (
    screenId: string
  ) => ChoreographyNavigationLineage | null;
  progress: SharedValue<number>;
  progressOwnership: ProgressOwnership;
  navigationController: NavigationSessionController;
  reverseController: ReverseTransitionController;
  commitReverseTransition: (request: ReverseCommitRequest) => Promise<void>;
  interactionOwner: SharedValue<string | null>;
  preMeasureGroup: (groupId: string, screenId: string) => Promise<void>;
  refreshActiveSessionMetrics: (side: 'source' | 'target') => Promise<void>;
  waitForOverlayReady: (sessionId: string) => Promise<boolean>;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
    onUnavailable?: (sessionId: string) => void;
  }) => Promise<TransitionSessionData | null>;
  completeTransition: (sessionId?: string) => void;
  cancelTransition: (sessionId?: string) => void;
  debug: ChoreographyDebugConfig;
}

export const ChoreographyContext =
  createContext<ChoreographyContextType | null>(null);
