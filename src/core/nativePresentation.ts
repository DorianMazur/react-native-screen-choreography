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
}

export function createNativePresentation(
  hostNames: string[],
  validate: () => boolean
): NativePresentation {
  return {
    hostNames,
    validate,
    phase: makeMutable(0),
    valid: makeMutable(true),
    animation: makeMutable<PresentationAnimation | null>(null),
  };
}
