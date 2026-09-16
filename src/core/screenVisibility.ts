import type { TransitionSessionData } from '../types';

export type ScreenRole = 'source' | 'target' | 'inactive';

export type SessionPhase =
  | 'idle'
  | 'preparing'
  | 'active'
  | 'completing'
  | 'cancelling';

export type TransitionDirection = 'forward' | 'backward';

export type ScreenFadeConfig = false | { during: readonly [number, number] };

export function validateScreenFade(screenFade: ScreenFadeConfig): void {
  if (screenFade === false) return;
  const range = screenFade.during;
  if (
    range.length !== 2 ||
    !range.every(Number.isFinite) ||
    range[0] < 0 ||
    range[1] > 1 ||
    range[0] >= range[1]
  ) {
    throw new Error('Screen fade intervals must increase within [0, 1].');
  }
}

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
  progressValue: number,
  screenFade?: ScreenFadeConfig
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
  if (screenFade === false) return 1;
  const isExpandedScreen =
    direction === 'forward' ? role === 'target' : role === 'source';
  const [start, end] = screenFade?.during ?? [0, 0.4];
  const expandedOpacity = Math.max(
    0,
    Math.min(1, (progressValue - start) / (end - start))
  );
  return isExpandedScreen ? expandedOpacity : 1 - expandedOpacity;
}

export function shouldBlockInteraction(
  role: ScreenRole,
  phase: SessionPhase
): boolean {
  if (role === 'inactive') return false;
  return phase === 'preparing' || phase === 'active';
}
