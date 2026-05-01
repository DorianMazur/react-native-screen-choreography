import { Easing } from 'react-native-reanimated';

import type { SpringConfig } from '../types';
import { DEFAULT_SPRING, SNAPPY_SPRING, FAST_SPRING } from '../constants';

export const Springs = {
  /** Default spring for primary geometry transitions */
  default: DEFAULT_SPRING,
  /** Slightly snappier spring for focal elements and quick emphasis */
  snappy: SNAPPY_SPRING,
  /** Fast spring for reverse transitions */
  fast: FAST_SPRING,
  /** Gentle spring for subtle movements */
  gentle: {
    damping: 28,
    mass: 1,
    stiffness: 180,
  } satisfies SpringConfig,
} as const;

export const Easings = {
  /** Standard ease-out for content reveals */
  contentReveal: Easing.out(Easing.cubic),
  /** Ease-in-out for smooth interpolation */
  smooth: Easing.inOut(Easing.cubic),
  /** Sharp ease-out for quick actions */
  sharp: Easing.out(Easing.quad),
} as const;
