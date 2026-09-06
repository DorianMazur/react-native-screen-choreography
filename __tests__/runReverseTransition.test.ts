import { withSpring } from 'react-native-reanimated';
import { ProgressOwnership } from '../src/core/ProgressOwnership';
import { runReverseTransition } from '../src/core/runReverseTransition';
import type { ChoreographyContextType } from '../src/core/ChoreographyContext';
import type { TransitionSessionData } from '../src/types';

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
