export interface MotionRequest {
  requestId: number;
  direction: 'forward' | 'backward';
  sessionId: string | null;
}

export interface MotionObservation {
  requestId: number;
  firstMotionMs: number | null;
  motionEndMs: number | null;
  handoffMs: number | null;
}

/** Runs on the UI runtime. Exact endpoints distinguish settling from overshoot. */
export function observeMotion(
  request: MotionRequest,
  previous: MotionObservation | null,
  progress: number,
  handoff: { sessionId: string | null; completed: boolean } | undefined,
  now: number
): MotionObservation {
  'worklet';
  const observation =
    previous?.requestId === request.requestId
      ? { ...previous }
      : {
          requestId: request.requestId,
          firstMotionMs: null,
          motionEndMs: null,
          handoffMs: null,
        };
  if (!request.sessionId || observation.handoffMs !== null) return observation;
  const endpoint = request.direction === 'forward' ? 1 : 0;
  if (observation.firstMotionMs === null && progress !== 1 - endpoint)
    observation.firstMotionMs = now;
  if (observation.firstMotionMs !== null && progress === endpoint) {
    if (observation.motionEndMs === null) observation.motionEndMs = now;
    if (handoff?.sessionId === request.sessionId && handoff.completed)
      observation.handoffMs = now;
  }
  return observation;
}
