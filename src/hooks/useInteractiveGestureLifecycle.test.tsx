import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import type { InteractiveTransitionHandle } from '../types';
import { useInteractiveGestureLifecycle } from './useInteractiveGestureLifecycle';

jest.mock('react-native-reanimated', () => {
  const { useLayoutEffect } = require('react');
  let reading: Set<Set<() => void>> | null = null;
  return {
    makeMutable: (initial: unknown) => {
      let value = initial;
      const listeners = new Set<() => void>();
      return {
        get value() {
          reading?.add(listeners);
          return value;
        },
        set value(next: unknown) {
          value = JSON.parse(
            JSON.stringify(next, (_key, item) =>
              typeof item === 'function' ? {} : item
            )
          );
          [...listeners].forEach((listener) => listener());
        },
      };
    },
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown) => void,
      deps: unknown[]
    ) => {
      useLayoutEffect(() => {
        const sources = new Set<Set<() => void>>();
        reading = sources;
        const initial = prepare();
        reading = null;
        const listener = () => react(prepare());
        for (const source of sources) {
          source.add(listener);
        }
        react(initial);
        return () => {
          for (const source of sources) {
            source.delete(listener);
          }
        };
        // Reanimated rebuilds this reaction from its explicit worklet dependencies.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps);
    },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: jest.fn(),
  scheduleOnUI: jest.fn(),
}));

type Controller = Parameters<typeof useInteractiveGestureLifecycle>[0];
type Options = NonNullable<
  Parameters<typeof useInteractiveGestureLifecycle>[1]
>;
type Lifecycle = ReturnType<typeof useInteractiveGestureLifecycle>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makeHandle(id = 'session') {
  const progress = { value: 0 } as InteractiveTransitionHandle['progress'];
  return {
    id,
    progress,
    setProgress: jest.fn((value: number) => {
      progress.value = value;
    }),
    finish: jest.fn(),
    cancel: jest.fn(),
  } satisfies InteractiveTransitionHandle;
}

describe('interactive gesture lifecycle', () => {
  let tree: ReactTestRenderer | undefined;
  let lifecycle: Lifecycle;
  let controller: Controller;
  let options: Options;
  let handle: ReturnType<typeof makeHandle>;
  let beginBack: jest.Mock<
    ReturnType<Controller['beginBack']>,
    Parameters<Controller['beginBack']>
  >;
  let fallback: jest.Mock;

  function Harness() {
    lifecycle = useInteractiveGestureLifecycle(controller, options);
    return null;
  }

  async function mount(overrides: Options = {}) {
    options = {
      group: 'article',
      targetScreenId: 'Feed',
      onFallbackFinish: fallback,
      ...overrides,
    };
    await act(async () => {
      tree = create(<Harness />);
    });
  }

  async function rerender(overrides: Partial<Options> = {}) {
    options = { ...options, ...overrides };
    await act(async () => tree!.update(<Harness />));
  }

  async function unmount() {
    await act(async () => tree!.unmount());
    tree = undefined;
  }

  async function begin() {
    let attempt = 0;
    await act(async () => {
      attempt = lifecycle.begin();
    });
    expect(attempt).toBeGreaterThan(0);
    return attempt;
  }

  function queueRN() {
    const jobs: Array<() => void> = [];
    (scheduleOnRN as jest.Mock).mockImplementation(
      (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
        jobs.push(() => callback(...args));
      }
    );
    return async () => {
      await act(async () => {
        while (jobs.length) jobs.shift()!();
      });
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    const execute = (
      callback: (...args: unknown[]) => unknown,
      ...args: unknown[]
    ) => callback(...args);
    (scheduleOnRN as jest.Mock).mockImplementation(execute);
    (scheduleOnUI as jest.Mock).mockImplementation(execute);
    handle = makeHandle();
    beginBack = jest.fn().mockResolvedValue(handle);
    controller = { beginBack };
    fallback = jest.fn();
  });

  afterEach(async () => {
    if (tree) await unmount();
    jest.restoreAllMocks();
  });

  test('rejects overlapping starts before RN admission and while a gesture is active', async () => {
    await mount();
    const flushRN = queueRN();
    const attempt = lifecycle.begin();
    expect(attempt).toBeGreaterThan(0);
    expect(lifecycle.begin()).toBe(0);
    await flushRN();
    expect(beginBack).toHaveBeenCalledTimes(1);
    expect(lifecycle.begin()).toBe(0);
    lifecycle.update(0, 0.9);
    lifecycle.release(0, { progress: 0.9 });
    expect(handle.finish).not.toHaveBeenCalled();
    expect(handle.cancel).not.toHaveBeenCalled();
  });

  test('a begin queued before unmount never acquires a transition', async () => {
    await mount();
    const flushRN = queueRN();
    const attempt = lifecycle.begin();
    lifecycle.release(attempt, { progress: 0.9 });
    await unmount();
    await flushRN();
    expect(beginBack).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(handle.finish).not.toHaveBeenCalled();
  });

  test('replays move-then-hold progress as soon as preparation becomes ready', async () => {
    const pending = deferred<InteractiveTransitionHandle | null>();
    beginBack.mockReturnValue(pending.promise);
    await mount();
    const attempt = await begin();
    lifecycle.update(attempt, 0.2);
    lifecycle.update(attempt, 0.42);
    expect(handle.setProgress).not.toHaveBeenCalled();
    expect(beginBack).toHaveBeenCalledWith(
      expect.objectContaining({
        group: 'article',
        targetScreenId: 'Feed',
        signal: expect.any(AbortSignal),
      })
    );

    await act(async () => pending.resolve(handle));
    expect(handle.setProgress).toHaveBeenLastCalledWith(0.42);
    await act(async () => lifecycle.release(attempt));
    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(handle.finish).not.toHaveBeenCalled();
  });

  test('keeps a release before the RN begin callback and settles from its final progress', async () => {
    await mount();
    const flushRN = queueRN();
    const attempt = lifecycle.begin();
    lifecycle.update(attempt, 0.6);
    lifecycle.release(attempt, { progress: 0.75, velocity: 0.2 });
    lifecycle.update(attempt, 0.1);
    expect(beginBack).not.toHaveBeenCalled();

    await flushRN();
    await flushRN();
    expect(beginBack).toHaveBeenCalledTimes(1);
    expect(handle.setProgress).toHaveBeenLastCalledWith(0.75);
    expect(handle.finish).toHaveBeenCalledTimes(1);
    expect(handle.finish).toHaveBeenCalledWith(
      expect.objectContaining({ velocity: 0.2 })
    );
    expect(handle.setProgress.mock.invocationCallOrder.at(-1)).toBeLessThan(
      handle.finish.mock.invocationCallOrder[0]!
    );
    expect(handle.cancel).not.toHaveBeenCalled();
  });

  test.each(['preparing', 'active'] as const)(
    'deduplicates cancellation in %s and permits a subsequent drag',
    async (phase) => {
      const pending = deferred<InteractiveTransitionHandle | null>();
      if (phase === 'preparing') beginBack.mockReturnValueOnce(pending.promise);
      await mount();
      const attempt = await begin();
      await act(async () => {
        lifecycle.update(attempt, 0.9);
        lifecycle.release(attempt, { cancelled: true, velocity: 10 });
        lifecycle.release(attempt, { cancelled: true });
      });
      if (phase === 'preparing') {
        await act(async () => pending.resolve(handle));
      }
      expect(handle.cancel).toHaveBeenCalledTimes(1);
      expect(handle.finish).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();

      const next = makeHandle('next');
      beginBack.mockResolvedValue(next);
      const nextAttempt = await begin();
      expect(nextAttempt).not.toBe(attempt);
      await act(async () => lifecycle.release(nextAttempt, { progress: 0.8 }));
      expect(next.finish).toHaveBeenCalledTimes(1);
    }
  );

  test('old attempt tickets cannot update or settle a later drag in the same scope', async () => {
    await mount();
    const firstAttempt = await begin();
    await act(async () => lifecycle.release(firstAttempt, { cancelled: true }));
    const next = makeHandle('next');
    beginBack.mockResolvedValue(next);
    const nextAttempt = await begin();
    lifecycle.update(nextAttempt, 0.25);
    await act(async () => {
      lifecycle.update(firstAttempt, 0.95);
      lifecycle.release(firstAttempt, { progress: 0.95 });
      lifecycle.release(firstAttempt, { cancelled: true });
    });
    expect(next.progress.value).toBe(0.25);
    expect(next.cancel).not.toHaveBeenCalled();
    expect(next.finish).not.toHaveBeenCalled();
    await act(async () => lifecycle.release(nextAttempt, { progress: 0.8 }));
    expect(next.finish).toHaveBeenCalledTimes(1);
  });

  test.each([{ group: 'other-article' }, { scopeKey: 'recycled-cell' }])(
    'fences captured callbacks after a scope change: %o',
    async (change) => {
      await mount();
      const oldLifecycle = lifecycle;
      const firstAttempt = await begin();
      await rerender(change);
      expect(handle.cancel).toHaveBeenCalledTimes(1);
      const next = makeHandle('next');
      beginBack.mockResolvedValue(next);
      const nextAttempt = await begin();
      expect(oldLifecycle.begin()).toBe(0);
      await act(async () => {
        oldLifecycle.update(firstAttempt, 0.9);
        oldLifecycle.release(firstAttempt, { progress: 0.9 });
        oldLifecycle.release(firstAttempt, { cancelled: true });
      });
      expect(next.finish).not.toHaveBeenCalled();
      expect(next.cancel).not.toHaveBeenCalled();
      await act(async () => lifecycle.release(nextAttempt, { progress: 0.8 }));
      expect(next.finish).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['ready', 'null', 'rejected'] as const)(
    'ignores an abandoned preparation that becomes %s after a new gesture starts',
    async (outcome) => {
      const pending = deferred<InteractiveTransitionHandle | null>();
      beginBack.mockReturnValueOnce(pending.promise);
      await mount();
      const firstAttempt = await begin();
      lifecycle.release(firstAttempt, { progress: 0.9 });
      const signal = beginBack.mock.calls[0]![0]!.signal!;
      await rerender({ group: 'other-article' });
      expect(signal.aborted).toBe(true);
      const next = makeHandle('next');
      beginBack.mockResolvedValue(next);
      const nextAttempt = await begin();
      lifecycle.update(nextAttempt, 0.3);

      await act(async () => {
        if (outcome === 'rejected')
          pending.reject(new Error('old preparation'));
        else pending.resolve(outcome === 'ready' ? handle : null);
      });
      expect(handle.finish).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
      expect(next.cancel).not.toHaveBeenCalled();
      expect(next.finish).not.toHaveBeenCalled();
      expect(next.progress.value).toBe(0.3);
      await act(async () => lifecycle.release(nextAttempt, { progress: 0.8 }));
      expect(next.finish).toHaveBeenCalledTimes(1);
    }
  );

  test('disable/re-enable aborts pending work and invalidates a queued old start', async () => {
    const pending = deferred<InteractiveTransitionHandle | null>();
    beginBack.mockReturnValueOnce(pending.promise);
    await mount();
    const firstAttempt = await begin();
    const signal = beginBack.mock.calls[0]![0]!.signal!;
    const oldLifecycle = lifecycle;
    await rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    expect(lifecycle.begin()).toBe(0);
    expect(oldLifecycle.begin()).toBe(0);
    await rerender({ enabled: true });
    const next = makeHandle('next');
    beginBack.mockResolvedValue(next);
    const nextAttempt = await begin();
    await act(async () => {
      oldLifecycle.release(firstAttempt, { progress: 0.9 });
      pending.reject(new Error('disabled preparation'));
    });
    expect(next.cancel).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    await act(async () => lifecycle.release(nextAttempt, { progress: 0.8 }));
    expect(next.finish).toHaveBeenCalledTimes(1);
  });

  test('unmount aborts preparation and discards a buffered accepted release', async () => {
    const pending = deferred<InteractiveTransitionHandle | null>();
    beginBack.mockReturnValue(pending.promise);
    await mount();
    const attempt = await begin();
    lifecycle.release(attempt, { progress: 0.9 });
    const signal = beginBack.mock.calls[0]![0]!.signal!;
    await unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(handle));
    expect(handle.finish).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(lifecycle.begin()).toBe(0);
  });

  test.each([false, true])(
    'unmount respects navigation handoff when finish was accepted=%s',
    async (accepted) => {
      await mount();
      const attempt = await begin();
      if (accepted) {
        await act(async () => {
          lifecycle.release(attempt, { progress: 0.9 });
          lifecycle.release(attempt, { progress: 0.9 });
          lifecycle.release(attempt, { cancelled: true });
        });
        await rerender({ group: 'replacement' });
      }
      await unmount();
      expect(handle.finish).toHaveBeenCalledTimes(accepted ? 1 : 0);
      expect(handle.cancel).toHaveBeenCalledTimes(accepted ? 0 : 1);
      expect(fallback).not.toHaveBeenCalled();
    }
  );

  test.each(['null', 'rejected'] as const)(
    'uses the fallback exactly once for an early accepted release when begin is %s',
    async (outcome) => {
      const pending = deferred<InteractiveTransitionHandle | null>();
      beginBack.mockReturnValue(pending.promise);
      await mount();
      const attempt = await begin();
      lifecycle.release(attempt, { progress: 0.8 });
      expect(fallback).not.toHaveBeenCalled();
      await act(async () => {
        if (outcome === 'null') pending.resolve(null);
        else pending.reject(new Error('measurement failed'));
      });
      await act(async () => lifecycle.release(attempt, { progress: 0.8 }));
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(handle.finish).not.toHaveBeenCalled();
      expect(handle.cancel).not.toHaveBeenCalled();
    }
  );

  test.each([
    { progress: 0.2, cancelled: false },
    { progress: 0.9, cancelled: true },
  ])('does not dismiss an unavailable transition for %o', async (release) => {
    beginBack.mockResolvedValue(null);
    await mount();
    const attempt = await begin();
    await act(async () => lifecycle.release(attempt, release));
    expect(fallback).not.toHaveBeenCalled();
    expect(handle.finish).not.toHaveBeenCalled();
    expect(handle.cancel).not.toHaveBeenCalled();
  });

  test.each([
    { progress: 0.8, cancelled: false, accepted: true },
    { progress: 0.2, cancelled: false, accepted: false },
    { progress: 0.8, cancelled: true, accepted: false },
  ])(
    'animate=false uses the same release decision without preparing a morph: %o',
    async ({ accepted, ...release }) => {
      await mount({ animate: false });
      const attempt = await begin();
      await act(async () => lifecycle.release(attempt, release));
      expect(beginBack).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(accepted ? 1 : 0);
      expect(handle.finish).not.toHaveBeenCalled();
      expect(handle.cancel).not.toHaveBeenCalled();
    }
  );

  test('clamps updates on the UI path without scheduling JS work per frame', async () => {
    await mount();
    const attempt = await begin();
    (scheduleOnRN as jest.Mock).mockClear();
    handle.setProgress.mockClear();
    lifecycle.update(attempt, -0.5);
    expect(handle.setProgress).toHaveBeenLastCalledWith(0);
    for (let frame = 0; frame < 60; frame++) {
      lifecycle.update(attempt, frame / 60);
    }
    lifecycle.update(attempt, 1.5);
    expect(handle.setProgress).toHaveBeenLastCalledWith(1);
    expect(scheduleOnRN).not.toHaveBeenCalled();
  });

  test.each([
    { progress: 0.3, velocity: 0.5, accepted: true },
    { progress: 0.3, velocity: 0, accepted: false },
    { progress: 0.6, velocity: -2, accepted: false },
  ])(
    'uses normalized velocity and passes motion options for %o',
    async ({ accepted, ...release }) => {
      const spring = { stiffness: 180 };
      await mount({
        threshold: 0.35,
        velocityImpact: 0.2,
        duration: 120,
        spring,
      });
      const attempt = await begin();
      await act(async () => lifecycle.release(attempt, release));
      const settle = accepted ? handle.finish : handle.cancel;
      expect(settle).toHaveBeenCalledWith({
        velocity: release.velocity,
        duration: 120,
        spring,
      });
      expect(accepted ? handle.cancel : handle.finish).not.toHaveBeenCalled();
    }
  );

  test('refreshing injected callbacks does not cancel pending work and uses the latest fallback', async () => {
    const pending = deferred<InteractiveTransitionHandle | null>();
    beginBack.mockReturnValue(pending.promise);
    await mount();
    const attempt = await begin();
    const signal = beginBack.mock.calls[0]![0]!.signal!;
    const nextBeginBack = jest.fn().mockResolvedValue(handle);
    const nextFallback = jest.fn();
    controller = { beginBack: nextBeginBack };
    await rerender({ onFallbackFinish: nextFallback });
    expect(signal.aborted).toBe(false);
    lifecycle.release(attempt, { progress: 0.8 });
    await act(async () => pending.resolve(null));
    expect(fallback).not.toHaveBeenCalled();
    expect(nextFallback).toHaveBeenCalledTimes(1);
    expect(nextBeginBack).not.toHaveBeenCalled();
    await begin();
    expect(nextBeginBack).toHaveBeenCalledTimes(1);
  });
});
