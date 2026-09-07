import { withSpring } from 'react-native-reanimated';
import { ElementRegistry } from './ElementRegistry';
import { ProgressOwnership } from './ProgressOwnership';
import { NavigationSessionController } from './NavigationSessionController';
import { runReverseTransition } from './runReverseTransition';
import { TransitionCoordinator } from './TransitionCoordinator';
import type { ChoreographyContextType } from './ChoreographyContext';
import type { TransitionSessionData } from '../types';

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
    preMeasureGroup: jest.fn(async () => {}),
    startTransition: jest.fn(async () => {
      progressOwnership.setSession('reverse-session');
      return createSession('reverse-session');
    }),
    waitForOverlayReady: jest.fn(async () => true),
    completeTransition: jest.fn(),
    cancelTransition: jest.fn(),
    ...overrides,
  } as unknown as ChoreographyContextType;
}

function createCoordinatorContext() {
  const ctx = createContext();
  const coordinator = new TransitionCoordinator(
    new ElementRegistry(),
    ctx.progress
  );
  coordinator.setOnSessionChange((session) => {
    ctx.progressOwnership.setSession(session?.id ?? null);
  });
  ctx.startTransition = (config) => coordinator.startTransition(config);
  return { ctx, coordinator };
}

describe('runReverseTransition ownership', () => {
  beforeEach(() => {
    mockedWithSpring.mockReset();
    mockedWithSpring.mockImplementation((_value, _config, callback) => {
      callback(true);
      return 0;
    });
  });

  test('keeps the outgoing screen mounted until the reverse animation finishes', async () => {
    let finishAnimation!: (finished?: boolean) => void;
    let notifyAnimationStarted!: () => void;
    const animationStarted = new Promise<void>((resolve) => {
      notifyAnimationStarted = resolve;
    });
    mockedWithSpring.mockImplementation((_value, _config, callback) => {
      finishAnimation = callback;
      notifyAnimationStarted();
      return 0;
    });
    const ctx = createContext();
    const popAction = jest.fn();
    const reverse = runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction,
    });

    await animationStarted;
    expect(popAction).not.toHaveBeenCalled();
    expect(ctx.completeTransition).not.toHaveBeenCalled();

    finishAnimation(true);
    await reverse;
    expect(popAction).toHaveBeenCalledTimes(1);
    expect(ctx.completeTransition).toHaveBeenCalledWith('reverse-session');
  });

  test('restores the detail without redispatching when another blocker keeps the route', async () => {
    const frame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
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
    expect(popAction).toHaveBeenCalledTimes(1);
    expect(mockedWithSpring).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).toHaveBeenCalledWith('reverse-session');
    expect(ctx.completeTransition).not.toHaveBeenCalled();
    frame.mockRestore();
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

  test('qualifies a late spring completion with its original session', async () => {
    let springCallback: ((finished?: boolean) => void) | undefined;
    let currentSessionId: string | null = 'reverse-session';
    const completeTransition = jest.fn((sessionId?: string) => {
      if (sessionId === currentSessionId) {
        currentSessionId = null;
      }
    });
    mockedWithSpring.mockImplementation(
      (_value, _config, callback: (finished?: boolean) => void) => {
        springCallback = callback;
        return 0;
      }
    );
    const ctx = createContext({ completeTransition });

    await runReverseTransition({
      ctx,
      groupId: 'group',
      sourceScreenId: 'list',
      currentScreenId: 'detail',
      popAction: jest.fn(),
    });

    currentSessionId = 'replacement-session';
    ctx.progressOwnership.setSession(currentSessionId);
    ctx.progress.value = 0.7;
    springCallback?.(true);

    expect(completeTransition).not.toHaveBeenCalled();
    expect(ctx.progress.value).toBe(0.7);
    expect(currentSessionId).toBe('replacement-session');
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
      const { ctx, coordinator } = createCoordinatorContext();
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
    const { ctx, coordinator } = createCoordinatorContext();
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
      await jest.advanceTimersByTimeAsync(1100);
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
      preMeasureGroup: jest.fn(async () => {
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

  test('falls back to one pop and cancels its session when animation setup fails', async () => {
    const popAction = jest.fn();
    mockedWithSpring.mockImplementation(() => {
      throw new Error('animation setup failed');
    });
    const ctx = createContext();

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
    const ctx = createContext();

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
