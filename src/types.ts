import type { ComponentType, ReactElement } from 'react';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

export type SpringConfig = {
  mass?: number;
  velocity?: number;
  overshootClamping?: boolean;
  restDisplacementThreshold?: number;
  restSpeedThreshold?: number;
} & (
  | {
      damping?: number;
      stiffness?: number;
      duration?: never;
      dampingRatio?: never;
    }
  | {
      duration?: number;
      dampingRatio?: number;
      damping?: never;
      stiffness?: never;
    }
);

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
  metadata?: unknown;
}

export interface TransitionAnchor {
  readonly collapsed: Readonly<ElementMetrics>;
  readonly expanded: Readonly<ElementMetrics>;
}

export interface SharedElementTransitionRendererProps {
  id: string;
  groupId: string;
  progress: SharedValue<number>;
  direction: 'forward' | 'backward';
  zIndex: number;
  source: SharedElementTransitionSide;
  target: SharedElementTransitionSide;
  /**
   * Current session's matched geometry, keyed by element ID. Collapsed/expanded
   * are independent of navigation direction and update with rendered metrics.
   * Unmatched IDs are absent. Contains no registrations, refs, or React content.
   */
  anchors?: Readonly<Partial<Record<string, TransitionAnchor>>>;
}

export type SharedElementTransitionRenderer =
  ComponentType<SharedElementTransitionRendererProps>;

export interface SharedElementTransition {
  renderer: SharedElementTransitionRenderer;
  zIndex?: number;
}

declare const liveTransitionBrand: unique symbol;

/** A live transition created by `makeTransition`. */
export interface Transition extends SharedElementTransition {
  readonly [liveTransitionBrand]: true;
}

export interface TransitionEndpoint extends SharedElementTransitionSide {
  metadata?: unknown;
}

export interface TransitionRendererProps extends Omit<
  SharedElementTransitionRendererProps,
  'source' | 'target'
> {
  source: TransitionEndpoint;
  target: TransitionEndpoint;
  /** The library-owned live portal host. Render it exactly once. */
  children: ReactElement;
}

export type NodeHandleRef = React.RefObject<any> | (() => any);

/** Frozen renderer input captured at session start. */
export interface ElementPresentation {
  style?: ViewStyle;
  transition: SharedElementTransition;
  metadata?: unknown;
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
  /** Captures metadata, style, and transition once at session start. */
  getPresentation: () => ElementPresentation;
  /** Read the current pairing policy without capturing a presentation early. */
  getTransition?: () => SharedElementTransition;
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

export interface ChoreographyPreparationStage {
  name: string;
  startedAtMs: number;
  durationMs: number;
  /** False when preparation ended before the stage's awaited work finished. */
  completed: boolean;
  details?: Readonly<Record<string, string | number | boolean>>;
}

/** Optional startup diagnostics; timestamps share the JavaScript performance clock. */
export interface ChoreographyPreparationTrace {
  traceId: string;
  sessionId: string | null;
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  direction: 'forward' | 'backward';
  clock: 'js-performance-now';
  startedAtMs: number;
  completedAtMs: number;
  outcome:
    | 'overlay-ready'
    | 'overlay-timeout'
    | 'cancelled'
    | 'unavailable'
    | 'failed';
  stages: readonly ChoreographyPreparationStage[];
  droppedStages: number;
}

export interface ChoreographyNavigationLineage {
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  sourceRouteKey?: string;
  spring?: SpringConfig;
}

export interface InteractiveBackOptions {
  /** Group to control. Defaults to the route metadata set by navigate(). */
  group?: string;
  /** Screen being returned to. Defaults to the route metadata. */
  targetScreenId?: string;
  /** Cancels preparation only; use the returned handle to cancel an active gesture. */
  signal?: AbortSignal;
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

export interface InteractiveTransitionHandle extends InteractiveTransitionSession {
  /** Worklet-compatible; available immediately when beginBack resolves. */
  setProgress(value: number): void;
  /** Complete this session's Back navigation. Call on the React Native runtime. */
  finish(options?: InteractiveTransitionSettleOptions): void;
  /** Return this session to its starting screen. Call on the React Native runtime. */
  cancel(options?: InteractiveTransitionSettleOptions): void;
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
