import {
  cancelAnimation,
  Easing,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import type { SpringConfig } from '../types';
import {
  finishVisibilityHandoff,
  resumeVisibilityHandoff,
  type VisibilityHandoff,
} from './ElementVisibilityRegistry';

// Keep callbacks alive until delivery: the worklet's remote-function registry
// holds weak references. Only this stable dispatcher crosses back to JS.
// IDs are global because animation tokens are local to each provider.
type Completion = (token: number, sessionId: string) => void;
let nextCompletionId = 0;
const completions = new Map<
  number,
  { callback: Completion; token: number; sessionId: string }
>();
function dispatchCompletion(id: number): void {
  const completion = completions.get(id);
  completions.delete(id);
  completion?.callback(completion.token, completion.sessionId);
}

export class ProgressOwnership {
  private generation = 0;
  private sessionId: string | null = null;
  private completionId: number | null = null;

  constructor(
    readonly owner: SharedValue<number>,
    private readonly progress: SharedValue<number>,
    readonly handoff?: SharedValue<VisibilityHandoff>
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
    // Cancel only this provider's callback, including one already queued on JS.
    if (this.completionId !== null) completions.delete(this.completionId);
    this.completionId = null;
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
    const { owner, handoff } = this;
    const token = this.generation;
    if (handoff) {
      scheduleOnUI(() => {
        'worklet';
        if (owner.value === token) resumeVisibilityHandoff(handoff, sessionId);
      });
    }
    return this.generation;
  }

  isSession(sessionId: string): boolean {
    return this.sessionId === sessionId;
  }

  isCurrent(token: number, sessionId: string): boolean {
    return this.generation === token && this.isSession(sessionId);
  }

  retainCompletion(
    token: number,
    sessionId: string,
    callback: Completion
  ): number {
    if (this.completionId !== null) completions.delete(this.completionId);
    const id = ++nextCompletionId;
    completions.set(id, { callback, token, sessionId });
    this.completionId = id;
    return id;
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
  const { owner, handoff } = ownership;
  const completionId = onComplete
    ? ownership.retainCompletion(token, sessionId, onComplete)
    : null;
  scheduleOnUI(() => {
    'worklet';
    if (owner.value !== token) return;
    progress.value = value;
    if (completionId !== null) {
      if (value === 0 || value === 1)
        finishVisibilityHandoff(handoff, sessionId);
      scheduleOnRN(dispatchCompletion, completionId);
    }
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
  handoffOnComplete = true,
  onCompleteUI,
  onComplete,
}: {
  ownership: ProgressOwnership;
  token: number;
  sessionId: string;
  progress: SharedValue<number>;
  target: number;
  spring: SpringConfig;
  duration?: number;
  /** Navigation-owned reverse commits hand off only after native presentation. */
  handoffOnComplete?: boolean;
  /** Runs on the UI runtime before the RN completion is scheduled. */
  onCompleteUI?: () => void;
  onComplete: (token: number, sessionId: string) => void;
}): void {
  if (!ownership.isCurrent(token, sessionId)) return;
  const { owner, handoff } = ownership;
  const completionId = ownership.retainCompletion(token, sessionId, onComplete);
  scheduleOnUI(() => {
    'worklet';
    if (owner.value !== token) return;
    const complete = (finished?: boolean) => {
      'worklet';
      if (finished && owner.value === token) {
        if (handoffOnComplete && (target === 0 || target === 1)) {
          finishVisibilityHandoff(handoff, sessionId);
        }
        onCompleteUI?.();
        scheduleOnRN(dispatchCompletion, completionId);
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
