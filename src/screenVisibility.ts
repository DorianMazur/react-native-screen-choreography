import type { TransitionSessionData } from './types';

export type ScreenRole = 'source' | 'target' | 'inactive';

/**
 * - `idle`: no session, no pending target
 * - `preparing`: pending target set or session measuring; overlay not yet painted
 * - `active`: overlay owns the frame, progress animates
 * - `completing` / `cancelling`: session winding down
 */
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

/**
 * Direction-agnostic screen opacity. Maps progress to
 * `t = forward ? progress : 1 - progress`, then:
 *
 * - target + preparing  → 0
 * - target + active     → 1 once t > 0.001
 * - source + active     → fade out over t ∈ [0, 0.4]
 * - everything else     → 1
 */
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
    return role === 'target' ? 0 : 1;
  }
  const t = direction === 'forward' ? progressValue : 1 - progressValue;
  if (role === 'target') {
    return t > 0.001 ? 1 : 0;
  }
  if (t <= 0) return 1;
  if (t >= 0.4) return 0;
  return 1 - t / 0.4;
}

/** Block pointer events on participating screens during preparing/active. */
export function shouldBlockInteraction(
  role: ScreenRole,
  phase: SessionPhase
): boolean {
  if (role === 'inactive') return false;
  return phase === 'preparing' || phase === 'active';
}
