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

jest.mock('react-native-reanimated', () => ({
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

  test('falls back to one pop and cancels its session when provider setup fails', async () => {
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
    });

    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).toHaveBeenCalledWith('reverse-session');
  });

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
  expect(ctx.cancelTransition).toHaveBeenCalledWith('reverse-session');
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
