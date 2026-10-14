import { withSpring } from 'react-native-reanimated';
import { ElementRegistry } from './ElementRegistry';
import { ProgressOwnership } from './ProgressOwnership';
import { NavigationSessionController } from './NavigationSessionController';
import {
  reverseActiveSession,
  runReverseTransition,
} from './runReverseTransition';
import { TransitionCoordinator } from './TransitionCoordinator';
import type { ChoreographyContextType } from './ChoreographyContext';
import type { TransitionSessionData } from '../types';
import { FAST_SPRING } from './constants';
import { ReverseTransitionController } from './ReverseTransitionController';
import { createNativePresentation } from './nativePresentation';

jest.mock('react-native-reanimated', () => ({
  makeMutable: (value: unknown) => ({ value }),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(),
  Easing: {
    out: (easing: (value: number) => number) => easing,
    inOut: (easing: (value: number) => number) => easing,
    cubic: (value: number) => value,
    quad: (value: number) => value,
  },
}));

const mockedWithSpring = withSpring as jest.Mock;

function createSession(id: string): TransitionSessionData {
  return {
    id,
    groupId: 'group',
    sourceScreenId: 'detail',
    targetScreenId: 'list',
    state: 'active',
    pairs: [],
    progress: { value: 1 } as TransitionSessionData['progress'],
    direction: 'backward',
  };
}

function createContext(
  overrides: Partial<ChoreographyContextType> = {}
): ChoreographyContextType {
  const progress = { value: 1 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  return {
    progress,
    progressOwnership,
    navigationController: new NavigationSessionController(),
    reverseController: new ReverseTransitionController(),
    captureSourceGroup: jest.fn(async () => {}),
    startTransition: jest.fn(async () => {
      progressOwnership.setSession('reverse-session');
      return createSession('reverse-session');
    }),
    waitForOverlayReady: jest.fn(async () => true),
    commitReverseTransition: jest.fn(async () => {}),
    completeTransition: jest.fn(),
    cancelTransition: jest.fn(),
    ...overrides,
  } as unknown as ChoreographyContextType;
}

describe('reversing an existing session', () => {
  test.each(['forward', 'backward'] as const)(
    'preserves caller options and provider ownership for %s Back',
    async (direction) => {
      const frames: Array<(timestamp: number) => void> = [];
      const frame = jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      try {
        const ctx = createContext({
          refreshActiveSessionMetrics: jest.fn(async () => {}),
        });
        const session = { ...createSession('opening'), direction };
        ctx.progress.value = 0.01;
        ctx.progressOwnership.setSession(session.id);
        const navigateBack = jest.fn();
        const options = {
          spring: { duration: 800, dampingRatio: 1 },
          duration: 180,
        };
        const reversal = reverseActiveSession({
          ctx,
          session,
          navigateBack,
          options,
        });
        expect(reversal).not.toBeNull();
        expect(
          ctx.progressOwnership.isCurrent(reversal!.token, session.id)
        ).toBe(true);
        if (direction === 'forward') {
          expect(ctx.progress.value).toBe(0.12);
          expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
          frames.shift()!(0);
        } else expect(frames).toHaveLength(0);
        await reversal!.completion;
        expect(ctx.refreshActiveSessionMetrics).toHaveBeenCalledTimes(
          direction === 'forward' ? 1 : 0
        );
        expect(ctx.commitReverseTransition).toHaveBeenCalledWith({
          sessionId: session.id,
          token: reversal!.token,
          navigateBack,
          options,
        });
        expect(ctx.startTransition).not.toHaveBeenCalled();
        expect(navigateBack).not.toHaveBeenCalled();
      } finally {
        frame.mockRestore();
      }
    }
  );
});

describe('native-gated Back delegation', () => {
  function pendingBack(reducedMotion = false) {
    let ready!: (value: boolean) => void;
    const readiness = new Promise<boolean>((resolve) => {
      ready = resolve;
    });
    const presentation = createNativePresentation(['host'], () => true);
    const ctx = createContext({
      waitForOverlayReady: jest.fn(() => readiness),
    });
    jest.mocked(ctx.startTransition).mockImplementation(async () => {
      ctx.progressOwnership.setSession('reverse-session');
      return {
        ...createSession('reverse-session'),
        presentation,
        reducedMotion,
      };
    });
    const cancel = jest.fn();
    const handoff = jest.fn();
    jest.mocked(ctx.commitReverseTransition).mockImplementation((request) =>
      ctx.reverseController.start({
        sessionId: request.sessionId,
        sourceScreenId: 'detail',
        targetScreenId: 'list',
        commitNavigation: async () =>
          (await request.navigateBack()) ?? { removed: true, presented: false },
        animate: jest.fn(),
        settleToTarget: jest.fn(),
        cancel,
        handoff,
        isCurrent: () =>
          ctx.progressOwnership.isCurrent(request.token, request.sessionId),
      })
    );
    const popAction = jest.fn(async () => ({
      removed: true,
      presented: false,
    }));
    const back = runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });
    return { ctx, presentation, back, ready, popAction, cancel, handoff };
  }

  test('arms provider-owned Back before the RN readiness promise resolves', async () => {
    const r = pendingBack();
    await Promise.resolve();
    await Promise.resolve();
    expect(r.ctx.waitForOverlayReady).toHaveBeenCalledTimes(1);
    expect(r.ctx.commitReverseTransition).toHaveBeenCalledWith(
      expect.objectContaining({ presentation: r.presentation })
    );
    expect(r.popAction).not.toHaveBeenCalled();
    r.ready(true);
    await Promise.resolve();
    expect(r.ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    r.ctx.reverseController.dispose();
    await r.back;
  });

  test('reduced motion waits for the content commit and does not queue native presentation', async () => {
    const r = pendingBack(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.ctx.commitReverseTransition).not.toHaveBeenCalled();
    r.ready(true);
    await Promise.resolve();
    expect(r.ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    expect(
      jest.mocked(r.ctx.commitReverseTransition).mock.calls[0]![0].presentation
    ).toBeUndefined();
    r.ctx.reverseController.dispose();
    await r.back;
  });

  test('failed presentation revokes queued motion and releases the operation before fallback', async () => {
    const r = pendingBack();
    await Promise.resolve();
    await Promise.resolve();
    const request = jest.mocked(r.ctx.commitReverseTransition).mock
      .calls[0]![0];
    r.popAction.mockImplementation(async () => {
      expect(r.presentation.valid.value).toBe(false);
      expect(
        r.ctx.progressOwnership.isCurrent(request.token, request.sessionId)
      ).toBe(false);
      expect(r.ctx.reverseController.owns(request.sessionId)).toBe(false);
      return { removed: true, presented: false };
    });
    r.ready(false);
    await r.back;
    expect(r.popAction).toHaveBeenCalledTimes(1);
    expect(r.ctx.completeTransition).toHaveBeenCalledWith('reverse-session');
    expect(r.cancel).not.toHaveBeenCalled();
    expect(r.handoff).not.toHaveBeenCalled();
  });

  test.each(['same session', 'replacement session'])(
    'a new owner in the %s during presentation rejects old navigation callbacks',
    async (replacement) => {
      const r = pendingBack();
      await Promise.resolve();
      await Promise.resolve();
      const request = jest.mocked(r.ctx.commitReverseTransition).mock
        .calls[0]![0];
      if (replacement === 'same session')
        r.ctx.progressOwnership.claim('reverse-session');
      else r.ctx.progressOwnership.setSession('replacement');
      r.ctx.progress.value = 0.6;
      r.ready(false);
      await r.back;
      await expect(request.navigateBack()).resolves.toEqual({
        removed: false,
        presented: false,
      });
      expect(r.popAction).not.toHaveBeenCalled();
      expect(r.ctx.reverseController.owns('reverse-session')).toBe(false);
      expect(r.ctx.progress.value).toBe(0.6);
      expect(r.ctx.cancelTransition).not.toHaveBeenCalled();
      expect(r.ctx.completeTransition).not.toHaveBeenCalled();
    }
  );
});

function createCoordinatorContext() {
  const ctx = createContext();
  const registry = new ElementRegistry();
  const coordinator = new TransitionCoordinator(registry, ctx.progress);
  coordinator.setOnSessionChange((session) => {
    ctx.progressOwnership.setSession(session?.id ?? null);
  });
  ctx.startTransition = (config) => coordinator.startTransition(config);
  return { ctx, coordinator, registry };
}

function registerPendingSource(
  registry: ElementRegistry,
  screenId: string,
  groupId: string
) {
  registry.register({
    id: 'card',
    groupId,
    screenId,
    ref: () => null,
    metrics: null,
    getPresentation: () => ({
      content: null,
      transition: { renderer: () => null },
    }),
  });
}

describe('runReverseTransition ownership', () => {
  beforeEach(() => {
    mockedWithSpring.mockReset();
    mockedWithSpring.mockImplementation((_value, _config, callback) => {
      callback(true);
      return 0;
    });
  });

  test('delegates a prepared reverse to the provider without local animation or navigation', async () => {
    const ctx = createContext();
    const popAction = jest.fn();
    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });

    expect(popAction).not.toHaveBeenCalled();
    expect(ctx.completeTransition).not.toHaveBeenCalled();
    expect(mockedWithSpring).not.toHaveBeenCalled();
    expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    const request = jest.mocked(ctx.commitReverseTransition).mock.calls[0]![0];
    expect(request).toEqual({
      sessionId: 'reverse-session',
      token: expect.any(Number),
      options: { spring: FAST_SPRING },
      navigateBack: expect.any(Function),
    });
    expect(
      ctx.progressOwnership.isCurrent(request.token, request.sessionId)
    ).toBe(true);
    await expect(request.navigateBack()).resolves.toEqual({
      removed: true,
      presented: false,
    });
    await expect(request.navigateBack()).resolves.toEqual({
      removed: false,
      presented: false,
    });
    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.completeTransition).not.toHaveBeenCalled();
  });

  test('reports a rejected legacy removal to the provider without redispatching', async () => {
    const ctx = createContext();
    const popAction = jest.fn();
    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
      isRouteRemoved: () => false,
    });
    const request = jest.mocked(ctx.commitReverseTransition).mock.calls[0]![0];
    await expect(request.navigateBack()).resolves.toEqual({
      removed: false,
      presented: false,
    });
    await request.navigateBack();
    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
    expect(ctx.completeTransition).not.toHaveBeenCalled();
  });

  test('a removed screen cannot dispatch after premeasurement', async () => {
    const ctx = createContext();
    const popAction = jest.fn();
    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
      canContinue: () => false,
    });
    expect(ctx.startTransition).not.toHaveBeenCalled();
    expect(popAction).not.toHaveBeenCalled();
  });

  test('a replaced session cannot dispatch through a previously delegated callback', async () => {
    const ctx = createContext();
    const popAction = jest.fn();

    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });

    const request = jest.mocked(ctx.commitReverseTransition).mock.calls[0]![0];
    ctx.progressOwnership.setSession('replacement-session');
    ctx.progress.value = 0.7;
    await expect(request.navigateBack()).resolves.toEqual({
      removed: false,
      presented: false,
    });

    expect(popAction).not.toHaveBeenCalled();
    expect(ctx.completeTransition).not.toHaveBeenCalled();
    expect(ctx.progress.value).toBe(0.7);
    expect(ctx.progressOwnership.isSession('replacement-session')).toBe(true);
  });

  test('falls back to one pop when the real coordinator finds no reverse pairs', async () => {
    jest.useFakeTimers();
    const { ctx, coordinator } = createCoordinatorContext();
    const popAction = jest.fn();

    try {
      const reverse = runReverseTransition({
        ctx,
        groupId: 'group',
        sourceScreenId: 'list',
        currentScreenId: 'detail',
        popAction,
      });
      await jest.runAllTimersAsync();
      await reverse;

      expect(coordinator.getActiveSession()).toBeNull();
      expect(ctx.progressOwnership.hasSession).toBe(false);
      expect(popAction).toHaveBeenCalledTimes(1);
      expect(mockedWithSpring).not.toHaveBeenCalled();
    } finally {
      coordinator.dispose();
      jest.useRealTimers();
    }
  });

  test.each(['cancel', 'replace'] as const)(
    'does not pop when %s interrupts real reverse preparation',
    async (interruption) => {
      jest.useFakeTimers();
      const { ctx, coordinator, registry } = createCoordinatorContext();
      // Exercise a real registration wait; an empty group now falls back immediately.
      registerPendingSource(registry, 'detail', 'group');
      registerPendingSource(registry, 'list', 'replacement');
      const popAction = jest.fn();
      let replacement:
        | ReturnType<typeof coordinator.startTransition>
        | undefined;

      try {
        const reverse = runReverseTransition({
          ctx,
          groupId: 'group',
          sourceScreenId: 'list',
          currentScreenId: 'detail',
          popAction,
        });
        await Promise.resolve();
        expect(coordinator.getActiveSession()?.state).toBe('measuring');

        if (interruption === 'replace') {
          replacement = coordinator.startTransition({
            groupId: 'replacement',
            sourceScreenId: 'list',
            targetScreenId: 'other-detail',
            direction: 'forward',
          });
        } else {
          coordinator.cancelTransition();
        }
        const currentSession = coordinator.getActiveSession();
        await reverse;

        expect(popAction).not.toHaveBeenCalled();
        expect(coordinator.getActiveSession()).toBe(currentSession);
        expect(mockedWithSpring).not.toHaveBeenCalled();
      } finally {
        coordinator.dispose();
        await replacement;
        jest.useRealTimers();
      }
    }
  );

  test('no-pairs cleanup preserves a session started by fallback navigation', async () => {
    jest.useFakeTimers();
    const { ctx, coordinator, registry } = createCoordinatorContext();
    registerPendingSource(registry, 'list', 'replacement');
    let replacement: ReturnType<typeof coordinator.startTransition> | undefined;
    const popAction = jest.fn(() => {
      replacement = coordinator.startTransition({
        groupId: 'replacement',
        sourceScreenId: 'list',
        targetScreenId: 'other-detail',
        direction: 'forward',
      });
    });

    try {
      const reverse = runReverseTransition({
        ctx,
        groupId: 'group',
        sourceScreenId: 'list',
        currentScreenId: 'detail',
        popAction,
      });
      await jest.advanceTimersByTimeAsync(0);
      await reverse;

      expect(popAction).toHaveBeenCalledTimes(1);
      const session = coordinator.getActiveSession();
      expect(session?.groupId).toBe('replacement');
      expect(ctx.progressOwnership.isSession(session!.id)).toBe(true);
    } finally {
      coordinator.dispose();
      await replacement;
      jest.useRealTimers();
    }
  });

  test('falls back to one pop when preparation fails before navigation', async () => {
    const popAction = jest.fn();
    const ctx = createContext({
      captureSourceGroup: jest.fn(async () => {
        throw new Error('measurement failed');
      }),
    });

    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });

    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
  });

  test.each([
    [true, 'completes'],
    [false, 'cancels'],
  ] as const)(
    'falls back to one pop when provider setup fails (route removed=%s) and %s its session',
    async (removed, _outcome) => {
      const popAction = jest.fn();
      const ctx = createContext({
        commitReverseTransition: jest.fn(async () => {
          throw new Error('provider setup failed');
        }),
      });

      await runReverseTransition({
        ctx,
        groupId: 'group',
        sourceScreenId: 'list',
        currentScreenId: 'detail',
        popAction,
        isRouteRemoved: () => removed,
      });

      expect(popAction).toHaveBeenCalledTimes(1);
      const [ended, untouched] = removed
        ? [ctx.completeTransition, ctx.cancelTransition]
        : [ctx.cancelTransition, ctx.completeTransition];
      expect(ended).toHaveBeenCalledWith('reverse-session');
      expect(untouched).not.toHaveBeenCalled();
    }
  );

  test('does not retry a navigation commit that throws', async () => {
    const popAction = jest.fn(() => {
      throw new Error('dispatch failed');
    });
    const ctx = createContext({
      commitReverseTransition: jest.fn(async (request) => {
        await request.navigateBack();
      }),
    });

    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });

    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).toHaveBeenCalledWith('reverse-session');
  });
});

test('unready overlay falls back to one plain Back action without animating a blank image', async () => {
  const ctx = createContext({
    waitForOverlayReady: jest.fn(async () => false),
  });
  const popAction = jest.fn(async () => ({ removed: true, presented: false }));
  await runReverseTransition({
    ctx,
    groupId: 'group',
    sourceScreenId: 'list',
    currentScreenId: 'detail',
    popAction,
  });
  expect(popAction).toHaveBeenCalledTimes(1);
  expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
  // The route is gone, so the session settles on the screen it returned to.
  expect(ctx.progress.value).toBe(0);
  expect(ctx.completeTransition).toHaveBeenCalledWith('reverse-session');
  expect(ctx.cancelTransition).not.toHaveBeenCalled();
});

test('unready overlay cancels its session when the fallback Back is rejected', async () => {
  const ctx = createContext({
    waitForOverlayReady: jest.fn(async () => false),
  });
  const popAction = jest.fn(async () => ({ removed: false, presented: false }));
  await runReverseTransition({
    ctx,
    groupId: 'group',
    sourceScreenId: 'list',
    currentScreenId: 'detail',
    popAction,
  });
  expect(popAction).toHaveBeenCalledTimes(1);
  expect(ctx.cancelTransition).toHaveBeenCalledWith('reverse-session');
  expect(ctx.completeTransition).not.toHaveBeenCalled();
});

test('failed Back presentation retains diagnostics and still commits fallback navigation', async () => {
  jest.useFakeTimers();
  try {
    const onPreparationTrace = jest.fn();
    const details = {
      reason: 'invalidated',
      phase: 'transferring',
      contentReady: true,
      hostAcknowledged: false,
    } as const;
    const ctx = createContext({
      onPreparationTrace,
      waitForOverlayReady: async (_id, onUnavailable) => {
        onUnavailable?.(details);
        return false;
      },
    });
    const popAction = jest.fn(async () => ({
      removed: true,
      presented: false,
    }));
    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });
    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(onPreparationTrace).toHaveBeenCalledTimes(1);
    expect(onPreparationTrace.mock.calls[0]![0]).toMatchObject({
      outcome: 'overlay-timeout',
      stages: expect.arrayContaining([
        expect.objectContaining({
          name: 'overlay-ready',
          details: { ...details, ready: false, acknowledged: false },
        }),
      ]),
    });
  } finally {
    jest.useRealTimers();
  }
});

describe('fallback Back settlement ownership', () => {
  test.each([
    ['same session', true],
    ['same session', false],
    ['replacement session', true],
    ['replacement session', false],
  ] as const)(
    'ignores a delayed removal result after a new owner takes over the %s (removed=%s)',
    async (replacement, removed) => {
      const ctx = createContext({
        waitForOverlayReady: jest.fn(async () => false),
      });
      let resolvePop!: (result: {
        removed: boolean;
        presented: boolean;
      }) => void;
      const popAction = jest.fn(
        () =>
          new Promise<{ removed: boolean; presented: boolean }>((resolve) => {
            resolvePop = resolve;
          })
      );
      const back = runReverseTransition({
        ctx,
        groupId: 'group',
        sourceScreenId: 'list',
        currentScreenId: 'detail',
        popAction,
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(popAction).toHaveBeenCalledTimes(1);
      const sessionId =
        replacement === 'same session' ? 'reverse-session' : 'new-session';
      ctx.progressOwnership.setSession(sessionId);
      const token = ctx.progressOwnership.claim(sessionId)!;
      ctx.progress.value = 0.6;
      resolvePop({ removed, presented: false });
      await back;
      expect(ctx.completeTransition).not.toHaveBeenCalled();
      expect(ctx.cancelTransition).not.toHaveBeenCalled();
      expect(ctx.progress.value).toBe(0.6);
      expect(ctx.progressOwnership.isCurrent(token, sessionId)).toBe(true);
    }
  );

  test.each(['throw', 'reject'] as const)(
    'cancels and releases ownership when provider setup fails and fallback navigation fails with %s',
    async (failure) => {
      const ctx = createContext({
        commitReverseTransition: jest.fn(async () => {
          throw new Error('provider setup failed');
        }),
      });
      jest.mocked(ctx.cancelTransition).mockImplementation(() => {
        ctx.progressOwnership.setSession(null);
      });
      const popAction = jest.fn(() => {
        if (failure === 'throw') throw new Error('dispatch failed');
        return Promise.reject(new Error('dispatch rejected'));
      });
      await expect(
        runReverseTransition({
          ctx,
          groupId: 'group',
          sourceScreenId: 'list',
          currentScreenId: 'detail',
          popAction,
        })
      ).resolves.toBeUndefined();
      expect(popAction).toHaveBeenCalledTimes(1);
      expect(ctx.cancelTransition).toHaveBeenCalledWith('reverse-session');
      expect(ctx.completeTransition).not.toHaveBeenCalled();
      expect(ctx.navigationController.acquireNavigationLock('next')).toBe(true);
    }
  );

  test.each([true, false])(
    'uses the confirmed removal result if the provider throws after navigation (removed=%s)',
    async (removed) => {
      const ctx = createContext({
        commitReverseTransition: jest.fn(async (request) => {
          await request.navigateBack();
          throw new Error('provider completion failed');
        }),
      });
      const popAction = jest.fn(async () => ({ removed, presented: false }));
      await runReverseTransition({
        ctx,
        groupId: 'group',
        sourceScreenId: 'list',
        currentScreenId: 'detail',
        popAction,
      });
      expect(popAction).toHaveBeenCalledTimes(1);
      const [ended, untouched] = removed
        ? [ctx.completeTransition, ctx.cancelTransition]
        : [ctx.cancelTransition, ctx.completeTransition];
      expect(ended).toHaveBeenCalledWith('reverse-session');
      expect(untouched).not.toHaveBeenCalled();
    }
  );
});

describe('reverse preparation diagnostics', () => {
  test.each([true, false])(
    'reports overlay acknowledgment=%s before animation settles',
    async (acknowledged) => {
      jest.useFakeTimers();
      try {
        const onPreparationTrace = jest.fn();
        let finish!: () => void;
        const settling = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const ctx = createContext({
          onPreparationTrace,
          isOverlayPresented: () => acknowledged,
          commitReverseTransition: jest.fn(() => settling),
        });
        const operation = runReverseTransition({
          ctx,
          groupId: 'group',
          sourceScreenId: 'list',
          currentScreenId: 'detail',
          popAction: jest.fn(),
        });
        // Preparation consists of source read, coordinator and overlay awaits.
        for (let index = 0; index < 8; index++) await Promise.resolve();
        expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
        jest.runOnlyPendingTimers();
        expect(onPreparationTrace).toHaveBeenCalledTimes(1);
        const trace = onPreparationTrace.mock.calls[0]![0];
        expect(trace).toMatchObject({
          direction: 'backward',
          sessionId: 'reverse-session',
          sourceScreenId: 'detail',
          targetScreenId: 'list',
          outcome: acknowledged ? 'overlay-ready' : 'overlay-timeout',
        });
        expect(
          trace.stages.map((stage: { name: string }) => stage.name)
        ).toEqual(
          expect.arrayContaining([
            'source-capture',
            'coordinator',
            'overlay-ready',
          ])
        );
        finish();
        await operation;
        jest.runOnlyPendingTimers();
        expect(onPreparationTrace).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    }
  );
});
