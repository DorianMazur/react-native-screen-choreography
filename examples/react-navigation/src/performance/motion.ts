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

interface MotionSignal<T> {
  readonly value: T;
  addListener: (id: number, listener: (value: T) => void) => void;
  removeListener: (id: number) => void;
}

type MotionHandoff = { sessionId: string | null; completed: boolean };

/** Install on the UI runtime so terminal changes cannot be coalesced with cleanup. */
export function installMotionObserver({
  request,
  progress,
  handoff,
  listenerId,
  now,
  deliver,
}: {
  request: MotionSignal<MotionRequest | null>;
  progress: MotionSignal<number>;
  handoff: MotionSignal<MotionHandoff> | undefined;
  listenerId: number;
  now: () => number;
  deliver: (sample: MotionObservation) => void;
}): () => void {
  'worklet';
  let observation: MotionObservation | null = null;
  const observe = () => {
    const current = request.value;
    if (!current) {
      observation = null;
      return;
    }
    if (
      observation?.requestId === current.requestId &&
      observation.handoffMs !== null
    )
      return;
    const previous = observation;
    const next = observeMotion(
      current,
      previous,
      progress.value,
      handoff?.value,
      now()
    );
    observation = next;
    if (next.handoffMs !== null) deliver(next);
  };
  request.addListener(listenerId, observe);
  progress.addListener(listenerId, observe);
  handoff?.addListener(listenerId, observe);
  observe();
  return () => {
    request.removeListener(listenerId);
    progress.removeListener(listenerId);
    handoff?.removeListener(listenerId);
  };
}

/** Runs on the UI runtime. Exact endpoints distinguish settling from overshoot. */
export function observeMotion(
  request: MotionRequest,
  previous: MotionObservation | null,
  progress: number,
  handoff: MotionHandoff | undefined,
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
