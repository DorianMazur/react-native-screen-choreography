import { makeMutable, type SharedValue } from 'react-native-reanimated';
import type { SpringConfig } from '../types';

export const PRESENTATION_TIMEOUT_MS = 1000;

export type PresentationFailureReason = 'timeout' | 'invalidated';
export type PresentationFailureDetails = {
  reason: PresentationFailureReason;
  phase: 'mounting' | 'attaching' | 'transferring' | 'presented';
  contentReady: boolean;
  hostAcknowledged: boolean;
};

export interface PresentationAnimation {
  token: number;
  completionId: number;
  target: number;
  spring: SpringConfig;
  duration?: number;
}

export interface NativePresentation {
  /** 0: mount; -1: attaching; 1: transfer; 2: presented. */
  phase: SharedValue<number>;
  valid: SharedValue<boolean>;
  animation: SharedValue<PresentationAnimation | null>;
  hostNames: string[];
  validate: () => boolean;
  /** Opt-in startup diagnostics; written on the UI runtime only. */
  timing?: SharedValue<PresentationUITiming>;
}

export interface PresentationJSTiming {
  publishedAtMs: number;
  hostsCommitAtMs: number | null;
  contentCommitAtMs: number | null;
  acknowledgedAtMs: number | null;
}

export interface PresentationUITiming {
  animationDispatchedAtMs: number | null;
  animationQueuedAtMs: number | null;
  presentedAtMs: number | null;
  animationStartedAtMs: number | null;
  /** Native timestamps share only their platform's monotonic clock. */
  native: {
    preparedAtMs: number;
    attachedAtMs: number;
    contentReadyAtMs: number;
    presentedAtMs: number;
  } | null;
}

export function createNativePresentation(
  hostNames: string[],
  validate: () => boolean,
  trace = false
): NativePresentation {
  return {
    hostNames,
    validate,
    phase: makeMutable(0),
    valid: makeMutable(true),
    animation: makeMutable<PresentationAnimation | null>(null),
    ...(trace
      ? {
          timing: makeMutable<PresentationUITiming>({
            animationDispatchedAtMs: null,
            animationQueuedAtMs: null,
            presentedAtMs: null,
            animationStartedAtMs: null,
            native: null,
          }),
        }
      : {}),
  };
}
