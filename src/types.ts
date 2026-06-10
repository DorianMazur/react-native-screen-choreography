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

/**
 * Controls native bitmap snapshotting for a shared element.
 * - `'none'` (default): the overlay renders React stand-ins only.
 * - `'bitmap'`: the coordinator captures a native bitmap of the real view
 *   at session start and exposes it to the transition renderer as
 *   `source.bitmap` / `target.bitmap` for pixel-faithful stand-ins.
 */
export type SharedElementSnapshotMode = 'none' | 'bitmap';

/** A captured native bitmap of a shared element's view subtree. */
export interface ElementBitmap {
  /** file:// URI of the captured PNG. */
  uri: string;
  /** Width in density-independent points. */
  width: number;
  /** Height in density-independent points. */
  height: number;
}

export interface SharedElementTransitionSide {
  screenId: string;
  metrics: ElementMetrics;
  style?: ViewStyle;
  content?: ReactNode;
  /** Native bitmap captured at session start when `snapshotMode: 'bitmap'`. */
  bitmap?: ElementBitmap;
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
  /** Native bitmap capture preference for this element. */
  snapshotMode?: SharedElementSnapshotMode;
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
  /** Native bitmap of the source element when `snapshotMode: 'bitmap'`. */
  sourceBitmap?: ElementBitmap;
  /** Native bitmap of the target element when `snapshotMode: 'bitmap'`. */
  targetBitmap?: ElementBitmap;
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
