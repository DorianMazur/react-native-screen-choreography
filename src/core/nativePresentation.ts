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
  /** 1: mounting/transferring retained content; 2: presented. */
  phase: SharedValue<number>;
  valid: SharedValue<boolean>;
  animation: SharedValue<PresentationAnimation | null>;
  hostNames: string[];
}

export function createNativePresentation(
  hostNames: string[]
): NativePresentation {
  return {
    hostNames,
    phase: makeMutable(1),
    valid: makeMutable(true),
    animation: makeMutable<PresentationAnimation | null>(null),
  };
}
