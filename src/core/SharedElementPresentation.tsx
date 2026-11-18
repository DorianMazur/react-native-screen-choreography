import { createContext, useContext } from 'react';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { ElementPresentation, ElementMetrics } from '../types';

export interface SharedElementEndpoint {
  metrics: ElementMetrics | null;
  metadata?: unknown;
  style?: ElementPresentation['style'];
}

export interface SharedElementPresentation {
  /** Expansion clock, screen-protected for target children; other groups also drive it. */
  progress: SharedValue<number>;
  /**
   * This element's expansion: follows progress while participating, otherwise
   * stays at 0 (collapsed/source) or 1 (expanded/destination).
   */
  presentationProgress: DerivedValue<number>;
  /**
   * UI-thread size matching `TransitionFrame`, available from preparation through
   * motion. Null when unpaired or using reduced motion. Custom renderer geometry
   * may differ.
   */
  frame: DerivedValue<{ width: number; height: number } | null>;
  /** The paired transition is active; target children remain in their route. */
  transitioning: boolean;
  /** Participating session direction; null when this owner is settled. */
  direction: 'forward' | 'backward' | null;
  collapsed: SharedElementEndpoint;
  expanded: SharedElementEndpoint;
  /** Endpoint currently owning the component when no animation is active. */
  settled: 'collapsed' | 'expanded';
}

export const SharedElementPresentationContext =
  createContext<SharedElementPresentation | null>(null);

/** Read endpoint data inside an owner or route-owned Target children. */
export function useSharedElementPresentation(): SharedElementPresentation {
  const value = useContext(SharedElementPresentationContext);
  if (!value)
    throw new Error(
      'useSharedElementPresentation requires a SharedElement owner or Target content.'
    );
  return value;
}
