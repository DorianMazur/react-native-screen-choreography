import type { SpringConfig } from './types';

// ─── Default Spring Configs ──────────────────────────────────────

export const DEFAULT_SPRING: SpringConfig = {
  damping: 28,
  mass: 1,
  stiffness: 240,
  overshootClamping: true,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
};

export const SNAPPY_SPRING: SpringConfig = {
  damping: 20,
  mass: 0.8,
  stiffness: 300,
};

export const FAST_SPRING: SpringConfig = {
  damping: 30,
  mass: 1,
  stiffness: 320,
  overshootClamping: true,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
};

// ─── Timing Defaults ─────────────────────────────────────────────

export const DEFAULT_DURATION = 750;
export const REVERSE_DURATION = 500;
export const CONTENT_REVEAL_DURATION = 200;
export const STAGGER_DELAY = 40;

// ─── Progress Ranges ─────────────────────────────────────────────

export const PROGRESS_RANGES = {
  backdrop: { start: 0, end: 0.3 },
  surfaceTransform: { start: 0.05, end: 0.65 },
  anchorTransform: { start: 0.05, end: 0.55 },
  crossfade: { start: 0.1, end: 0.5 },
  supportingReveal: { start: 0.55, end: 0.8 },
  contentReveal: { start: 0.7, end: 1.0 },
} as const;

// ─── Visual Defaults ─────────────────────────────────────────────

export const DEFAULT_BACKDROP_OPACITY = 0.5;
export const DEFAULT_CORNER_RADIUS = 16;
export const MEASUREMENT_TIMEOUT = 500;
