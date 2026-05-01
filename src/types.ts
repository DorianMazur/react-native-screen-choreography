// Types for react-native-screen-choreography

import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

export type AnimationType =
  | 'morph'
  | 'move-resize'
  | 'crossfade'
  | 'fade-in'
  | 'fade-out'
  | 'none';

export type ResizeMode = 'stretch' | 'clip' | 'none';
export type AlignMode = 'center' | 'top-left' | 'top-center' | 'auto';

export interface SpringConfig {
  damping?: number;
  mass?: number;
  stiffness?: number;
  overshootClamping?: boolean;
  restDisplacementThreshold?: number;
  restSpeedThreshold?: number;
}

export interface TimingConfig {
  duration?: number;
  easing?: (t: number) => number;
}

export interface SharedElementConfig {
  animation?: AnimationType;
  resize?: ResizeMode;
  align?: AlignMode;
  zIndex?: number;
  spring?: SpringConfig;
  timing?: TimingConfig;
  /** Delay relative to group progress start (0-1) */
  progressOffset?: number;
  /** Render custom stand-in content during transition */
  renderStandIn?: (progress: SharedValue<number>) => React.ReactNode;
}

// ─── Element Metrics ─────────────────────────────────────────────

export interface ElementMetrics {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

// ─── Registry ────────────────────────────────────────────────────

export interface RegisteredElement {
  id: string;
  groupId?: string;
  screenId: string;
  ref: React.RefObject<any>;
  animatedRef?: AnimatedRef<any>;
  config: SharedElementConfig;
  metrics: ElementMetrics | null;
  style?: ViewStyle;
  /** Render function to create stand-in content */
  renderContent?: () => React.ReactNode;
}

// ─── Transition ──────────────────────────────────────────────────

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
  config: SharedElementConfig;
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

// ─── Choreography ────────────────────────────────────────────────

export interface ChoreographyTiming {
  /** Progress value at which this companion starts (0-1) */
  enterAt?: number;
  /** Progress value at which this companion ends (0-1) */
  exitAt?: number;
  /** Stagger delay between items in seconds */
  stagger?: number;
}

export interface TransitionConfig {
  /** Group ID for matching elements */
  group: string;
  /** Element-specific configs */
  elements?: Array<{
    id: string;
    role?: string;
    animation?: AnimationType;
    config?: SharedElementConfig;
  }>;
  /** Choreography timing for companion animations */
  choreography?: {
    backdrop?: ChoreographyTiming;
    supporting?: ChoreographyTiming;
    content?: ChoreographyTiming;
    [key: string]: ChoreographyTiming | undefined;
  };
  /** Spring config for the main transition */
  spring?: SpringConfig;
  /** Duration override (uses timing instead of spring) */
  duration?: number;
}

// ─── Context ─────────────────────────────────────────────────────

export interface ChoreographyContextValue {
  registerElement: (element: RegisteredElement) => void;
  unregisterElement: (id: string, screenId: string) => void;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
    transitionConfig?: TransitionConfig;
  }) => Promise<void>;
  completeTransition: (sessionId: string) => void;
  cancelTransition: (sessionId: string) => void;
  activeSession: TransitionSessionData | null;
  progress: SharedValue<number>;
  debug: boolean;
}

// ─── Debug ───────────────────────────────────────────────────────

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
