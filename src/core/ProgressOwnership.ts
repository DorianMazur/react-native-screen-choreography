import {
  cancelAnimation,
  Easing,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import type { SpringConfig } from '../types';

export class ProgressOwnership {
  private generation = 0;
  private sessionId: string | null = null;

  constructor(
    readonly owner: SharedValue<number>,
    private readonly progress: SharedValue<number>
  ) {}

  get version(): number {
    return this.generation;
  }

  get hasSession(): boolean {
    return this.sessionId !== null;
  }

  setSession(sessionId: string | null): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.invalidate();
  }

  invalidate(): void {
    const token = ++this.generation;
    const { owner, progress } = this;
    scheduleOnUI(() => {
      'worklet';
      owner.value = token;
      cancelAnimation(progress);
    });
  }

  claim(sessionId: string): number | null {
    if (this.sessionId !== sessionId) return null;
    this.invalidate();
    return this.generation;
  }

  isSession(sessionId: string): boolean {
    return this.sessionId === sessionId;
  }

  isCurrent(token: number, sessionId: string): boolean {
    return this.generation === token && this.isSession(sessionId);
  }
}

export function setOwnedProgress(
  ownership: ProgressOwnership,
  token: number,
  sessionId: string,
  progress: SharedValue<number>,
  value: number,
  onComplete?: (token: number, sessionId: string) => void
): void {
  if (!ownership.isCurrent(token, sessionId)) return;
  const { owner } = ownership;
  scheduleOnUI(() => {
    'worklet';
    if (owner.value !== token) return;
    progress.value = value;
    if (onComplete) scheduleOnRN(onComplete, token, sessionId);
  });
}

export function animateOwnedProgress({
  ownership,
  token,
  sessionId,
  progress,
  target,
  spring,
  duration,
  onComplete,
}: {
  ownership: ProgressOwnership;
  token: number;
  sessionId: string;
  progress: SharedValue<number>;
  target: number;
  spring: SpringConfig;
  duration?: number;
  onComplete: (token: number, sessionId: string) => void;
}): void {
  if (!ownership.isCurrent(token, sessionId)) return;
  const { owner } = ownership;
  scheduleOnUI(() => {
    'worklet';
    if (owner.value !== token) return;
    const complete = (finished?: boolean) => {
      'worklet';
      if (finished && owner.value === token) {
        scheduleOnRN(onComplete, token, sessionId);
      }
    };
    progress.value = duration
      ? withTiming(
          target,
          { duration, easing: Easing.out(Easing.cubic) },
          complete
        )
      : withSpring(target, spring, complete);
  });
}
