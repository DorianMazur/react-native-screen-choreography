import { withSpring } from 'react-native-reanimated';
import { runReverseTransition } from '../src/core/runReverseTransition';
import type { ChoreographyContextType } from '../src/core/ChoreographyContext';
import type { TransitionSessionData } from '../src/types';

jest.mock('react-native-reanimated', () => ({
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
  return {
    progress: { value: 1 },
    preMeasureGroup: jest.fn(async () => {}),
    startTransition: jest.fn(async () => createSession('reverse-session')),
    waitForOverlayReady: jest.fn(async () => true),
    completeTransition: jest.fn(),
    cancelTransition: jest.fn(),
    ...overrides,
  } as unknown as ChoreographyContextType;
}

describe('runReverseTransition ownership', () => {
  beforeEach(() => {
    mockedWithSpring.mockReset();
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
    springCallback?.(true);

    expect(completeTransition).toHaveBeenCalledWith('reverse-session');
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

  test('does not pop twice and cancels its session when setup fails after pop', async () => {
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
