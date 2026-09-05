import type { ComponentType, ReactNode } from 'react';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

export interface SpringConfig {
  damping?: number;
  mass?: number;
  stiffness?: number;
  velocity?: number;
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
  groupId: string;
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
  /** `live` pairs animate the real native view, so they are never hidden. */
  mode?: 'standin' | 'live';
}

export type NodeHandleRef = React.RefObject<any> | (() => any);

/** Frozen renderer input captured at session start. */
export interface ElementPresentation {
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
  /** Resolves a nested measurement target without re-registering the element. */
  getAnimatedRef?: () => AnimatedRef<any> | undefined;
  metrics: ElementMetrics | null;
  /** Captures content, style, and transition once at session start. */
  getPresentation: () => ElementPresentation;
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
  /** Frozen source renderer input captured when the session became active. */
  sourcePresentation: ElementPresentation;
  /** Frozen target renderer input captured when the session became active. */
  targetPresentation: ElementPresentation;
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

export interface ChoreographyNavigationLineage {
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  sourceRouteKey?: string;
}

export interface InteractiveBackOptions {
  /** Group to control. Defaults to the route metadata set by navigate(). */
  group?: string;
  /** Screen being returned to. Defaults to the route metadata. */
  targetScreenId?: string;
}

export interface InteractiveTransitionSettleOptions {
  spring?: SpringConfig;
  duration?: number;
  /** Gesture progress velocity in normalized progress units per second. */
  velocity?: number;
}

export interface InteractiveTransitionDecisionOptions extends InteractiveTransitionSettleOptions {
  /** Progress required to finish when projected velocity is applied. */
  threshold?: number;
  /** Seconds of release velocity used to project the final progress. */
  velocityImpact?: number;
}

export interface InteractiveTransitionSession {
  id: string;
  /** Gesture progress: 0 is untouched detail, 1 is a completed back. */
  progress: SharedValue<number>;
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
