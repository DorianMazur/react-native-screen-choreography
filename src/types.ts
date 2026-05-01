import type { ComponentType, ReactNode } from 'react';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

export interface SpringConfig {
  damping?: number;
  mass?: number;
  stiffness?: number;
  overshootClamping?: boolean;
  restDisplacementThreshold?: number;
  restSpeedThreshold?: number;
}

export interface ElementMetrics {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

export interface SharedElementTransitionSide {
  screenId: string;
  metrics: ElementMetrics;
  style?: ViewStyle;
  content?: ReactNode;
}

export interface SharedElementTransitionRendererProps {
  id: string;
  progress: SharedValue<number>;
  direction: 'forward' | 'backward';
  zIndex: number;
  source: SharedElementTransitionSide;
  target: SharedElementTransitionSide;
}

export type SharedElementTransitionRenderer =
  ComponentType<SharedElementTransitionRendererProps>;

export interface SharedElementTransition {
  renderer: SharedElementTransitionRenderer;
  zIndex?: number;
}

export type NodeHandleRef = React.RefObject<any> | (() => any);

/** Frozen visual snapshot captured at session start; the overlay reads
 * exclusively from this so re-renders cannot affect an in-flight stand-in. */
export interface ElementSnapshot {
  content: ReactNode;
  style?: ViewStyle;
  transition: SharedElementTransition;
}

export interface RegisteredElement {
  id: string;
  groupId?: string;
  screenId: string;
  ref: NodeHandleRef;
  animatedRef?: AnimatedRef<any>;
  metrics: ElementMetrics | null;
  /** Captures content/style/transition once at session start. */
  getSnapshot: () => ElementSnapshot;
}

export type TransitionState =
  | 'idle'
  | 'preparing'
  | 'measuring'
  | 'active'
  | 'completing'
  | 'cancelling';

export interface ElementTransitionPair {
  id: string;
  source: RegisteredElement;
  target: RegisteredElement;
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  transition: SharedElementTransition;
  /** Frozen source snapshot captured when the session became active. */
  sourceSnapshot: ElementSnapshot;
  /** Frozen target snapshot captured when the session became active. */
  targetSnapshot: ElementSnapshot;
}

export interface TransitionSessionData {
  id: string;
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  state: TransitionState;
  pairs: ElementTransitionPair[];
  progress: SharedValue<number>;
  direction: 'forward' | 'backward';
}

export interface TransitionConfig {
  /** Group ID for matching elements */
  group: string;
}

export interface ChoreographyNavigationOptions {
  transitionConfig?: TransitionConfig;
  /** Spring config for the main transition */
  spring?: SpringConfig;
  /** Duration override (uses timing instead of spring) */
  duration?: number;
}

export interface ChoreographyContextValue {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (id: string, screenId: string) => void;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
  }) => Promise<void>;
  completeTransition: (sessionId: string) => void;
  cancelTransition: (sessionId: string) => void;
  activeSession: TransitionSessionData | null;
  progress: SharedValue<number>;
  debug: boolean;
}

export interface DebugInfo {
  elementCount: number;
  activeTransition: boolean;
  pairs: Array<{
    id: string;
    sourceMetrics: ElementMetrics | null;
    targetMetrics: ElementMetrics | null;
  }>;
  logs: string[];
}

export type ChoreographyDebugLevel = 'error' | 'warn' | 'info' | 'trace';

export type ChoreographyDebugCategory =
  | 'registry'
  | 'measure'
  | 'screen'
  | 'nav'
  | 'overlay'
  | 'animation'
  | 'perf'
  | 'warnings';

/**
 * `true` is shorthand for `{ level: 'info' }`. Use `{ level: 'trace' }`
 * for per-frame measurement traces.
 */
export type ChoreographyDebugConfig =
  | boolean
  | {
      level?: ChoreographyDebugLevel;
      categories?: ChoreographyDebugCategory[];
      /** Disable coalescing of repeated identical messages. */
      logEveryFrame?: boolean;
    };
