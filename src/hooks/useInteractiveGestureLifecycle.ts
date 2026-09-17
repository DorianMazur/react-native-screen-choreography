import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { makeMutable, useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { resolveInteractiveTransitionOutcome } from '../core/interactiveProgress';
import type {
  InteractiveBackOptions,
  InteractiveTransitionDecisionOptions,
  InteractiveTransitionHandle,
} from '../types';

/** A controller already bound to the route that the gesture should dismiss. */
export interface InteractiveGestureController {
  beginBack(
    options?: InteractiveBackOptions
  ): Promise<InteractiveTransitionHandle | null>;
}

export interface InteractiveGestureOptions
  extends
    Pick<InteractiveBackOptions, 'group' | 'targetScreenId'>,
    Pick<
      InteractiveTransitionDecisionOptions,
      'spring' | 'duration' | 'threshold' | 'velocityImpact'
    > {
  enabled?: boolean;
  /** False skips the morph but still evaluates releases for fallback dismissal. */
  animate?: boolean;
  /** Change this when an application-specific interaction identity changes. */
  scopeKey?: unknown;
  /** Called once for an accepted release when no interactive session is available. */
  onFallbackFinish?: () => void;
}

export interface InteractiveGestureRelease {
  /** Defaults to the last update. Both progress and velocity use gesture units. */
  progress?: number;
  velocity?: number;
  cancelled?: boolean;
}

type Release = Required<InteractiveGestureRelease>;

interface GestureFrame extends Release {
  enabled: boolean;
  attempt: number;
  phase: 'idle' | 'dragging' | 'released';
}

interface Request {
  attempt: number;
  abort: AbortController;
  handle: InteractiveTransitionHandle | null;
  options: InteractiveGestureOptions;
}

function normalized(value: number): number {
  'worklet';
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Bind custom UI-thread gestures to asynchronous interactive Back preparation.
 * All returned callbacks are worklets. Pass the ticket returned by begin() to
 * update()/release(); obsolete tickets and duplicate releases are ignored.
 */
export function useInteractiveGestureLifecycle(
  controller: InteractiveGestureController,
  options: InteractiveGestureOptions = {}
) {
  const {
    group,
    targetScreenId,
    scopeKey,
    enabled = true,
    animate = true,
  } = options;
  const [binding, setBinding] = useState<{
    attempt: number;
    apply?: InteractiveTransitionHandle['setProgress'];
  }>({ attempt: 0 });
  const serial = useMemo(() => makeMutable(0), []);
  const latest = useRef({ controller, options });
  useLayoutEffect(() => {
    latest.current = { controller, options };
  });
  const scope = useMemo(
    () => ({
      mounted: false,
      request: null as Request | null,
      frame: makeMutable<GestureFrame>({
        enabled: false,
        attempt: 0,
        phase: 'idle',
        progress: 0,
        velocity: 0,
        cancelled: false,
      }),
    }),
    // A controller's React callbacks can change when preparation becomes active.
    // Only changes to the interaction's identity abandon its pending work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, targetScreenId, scopeKey, enabled, animate]
  );
  const { frame } = scope;

  useLayoutEffect(() => {
    scope.mounted = true;
    scheduleOnUI(() => {
      'worklet';
      frame.value = { ...frame.value, enabled };
    });
    return () => {
      scope.mounted = false;
      const request = scope.request;
      scope.request = null;
      scheduleOnUI(() => {
        'worklet';
        frame.value = {
          ...frame.value,
          enabled: false,
          phase: 'idle',
        };
      });
      request?.abort.abort();
      request?.handle?.cancel(request.options);
    };
  }, [scope, frame, enabled]);

  const settle = useCallback(
    (attempt: number, release: Release) => {
      const request = scope.request;
      if (!scope.mounted || !request || request.attempt !== attempt) return;
      // Completion belongs to the session handle from here. Cleanup must not
      // cancel a reverse commit now owned by navigation.
      scope.request = null;
      scheduleOnUI(() => {
        'worklet';
        if (frame.value.attempt !== attempt) return;
        frame.value = { ...frame.value, phase: 'idle' };
      });
      const decision = release.cancelled
        ? 'cancel'
        : resolveInteractiveTransitionOutcome({
            progress: release.progress,
            velocity: release.velocity,
            threshold: request.options.threshold,
            velocityImpact: request.options.velocityImpact,
          });
      const settlement = {
        spring: request.options.spring,
        duration: request.options.duration,
        velocity: release.velocity,
      };
      if (request.handle) {
        request.handle[decision](settlement);
      } else if (decision === 'finish') {
        latest.current.options.onFallbackFinish?.();
      }
    },
    [scope, frame]
  );

  // Only gesture data crosses back to JS. Worklets stored inside a shared
  // value deserialize as objects on JS (for example, in PanResponder callbacks).
  const { attempt: readyAttempt, apply } = binding;
  useAnimatedReaction(
    () => frame.value,
    (current) => {
      if (!current.enabled || current.attempt !== readyAttempt) return;
      if (current.phase === 'idle') return;
      apply?.(current.progress);
      if (current.phase === 'released') {
        scheduleOnRN(settle, current.attempt, current);
      }
    },
    [frame, readyAttempt, apply, settle]
  );

  const prepare = useCallback(
    async (attempt: number) => {
      if (!scope.mounted || !enabled || scope.request) return;
      const request: Request = {
        attempt,
        abort: new AbortController(),
        handle: null,
        options: { ...latest.current.options },
      };
      scope.request = request;
      let handle: InteractiveTransitionHandle | null = null;
      try {
        if (animate) {
          handle = await latest.current.controller.beginBack({
            group,
            targetScreenId,
            signal: request.abort.signal,
          });
        }
      } catch {
        // Unavailable preparation follows the same release/fallback decision.
      }
      if (!scope.mounted || scope.request !== request) {
        handle?.cancel();
        return;
      }
      request.handle = handle;
      setBinding({ attempt, apply: handle?.setProgress });
    },
    [scope, enabled, animate, group, targetScreenId]
  );

  const begin = useCallback(() => {
    'worklet';
    const current = frame.value;
    if (!current.enabled || current.phase !== 'idle') return 0;
    const attempt = serial.value + 1;
    serial.value = attempt;
    frame.value = {
      ...current,
      attempt,
      phase: 'dragging',
      progress: 0,
      velocity: 0,
      cancelled: false,
    };
    scheduleOnRN(prepare, attempt);
    return attempt;
  }, [frame, prepare, serial]);

  const update = useCallback(
    (attempt: number, progress: number) => {
      'worklet';
      const current = frame.value;
      if (
        !attempt ||
        !current.enabled ||
        current.attempt !== attempt ||
        current.phase !== 'dragging'
      )
        return;
      const value = normalized(progress);
      frame.value = { ...current, progress: value };
    },
    [frame]
  );

  const release = useCallback(
    (attempt: number, result: InteractiveGestureRelease = {}) => {
      'worklet';
      const current = frame.value;
      if (
        !attempt ||
        !current.enabled ||
        current.attempt !== attempt ||
        current.phase !== 'dragging'
      )
        return;
      const snapshot: Release = {
        progress: normalized(result.progress ?? current.progress),
        velocity: Number.isFinite(result.velocity) ? result.velocity! : 0,
        cancelled: result.cancelled ?? false,
      };
      frame.value = { ...current, ...snapshot, phase: 'released' };
    },
    [frame]
  );

  return { begin, update, release };
}
