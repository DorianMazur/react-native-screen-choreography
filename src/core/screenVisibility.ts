import type { TransitionSessionData } from '../types';

export type ScreenRole = 'source' | 'target' | 'inactive';

export type SessionPhase =
  | 'idle'
  | 'preparing'
  | 'active'
  | 'completing'
  | 'cancelling';

export type TransitionDirection = 'forward' | 'backward';

export function getScreenRole(
  session: TransitionSessionData | null,
  screenId: string
): ScreenRole {
  if (!session) {
    return 'inactive';
  }
  if (session.sourceScreenId === screenId) {
    return 'source';
  }
  if (session.targetScreenId === screenId) {
    return 'target';
  }
  return 'inactive';
}

export function getSessionPhase(
  session: TransitionSessionData | null,
  pendingTargetScreenId: string | null,
  screenId: string
): SessionPhase {
  if (pendingTargetScreenId === screenId) {
    return 'preparing';
  }
  if (!session) {
    return 'idle';
  }
  if (session.state === 'measuring' || session.state === 'preparing') {
    return 'preparing';
  }
  if (session.state === 'active') {
    return 'active';
  }
  if (session.state === 'completing') {
    return 'completing';
  }
  if (session.state === 'cancelling') {
    return 'cancelling';
  }
  return 'idle';
}

export function deriveScreenOpacity(
  direction: TransitionDirection,
  role: ScreenRole,
  phase: SessionPhase,
  progressValue: number
): number {
  'worklet';
  if (
    role === 'inactive' ||
    phase === 'idle' ||
    phase === 'completing' ||
    phase === 'cancelling'
  ) {
    return 1;
  }
  if (phase === 'preparing') {
    if (role === 'target') {
      return direction === 'backward' ? 1 : 0;
    }
    return 1;
  }
  const t = direction === 'forward' ? progressValue : 1 - progressValue;
  if (role === 'target') {
    if (t <= 0) return 0;
    if (t >= 0.4) return 1;
    return t / 0.4;
  }
  if (t <= 0) return 1;
  if (t >= 0.4) return 0;
  return 1 - t / 0.4;
}

export function shouldBlockInteraction(
  role: ScreenRole,
  phase: SessionPhase
): boolean {
  if (role === 'inactive') return false;
  return phase === 'preparing' || phase === 'active';
}
