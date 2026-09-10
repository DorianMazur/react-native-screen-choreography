import { Platform, type View } from 'react-native';
import { makeMutable, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ElementVisibilityRegistry } from '../core/ElementVisibilityRegistry';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ProgressOwnership } from '../core/ProgressOwnership';
import {
  createBackCommit,
  type NavigationCommitResult,
} from '../core/navigationCommit';
import type { TransitionSessionData } from '../types';
import { useReverseTransitionCommit } from './useReverseTransitionCommit';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useSharedValue: (initial: unknown) => {
    const { useRef } = require('react');
    return useRef({ value: initial }).current;
  },
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(() => 0.5),
  withTiming: jest.fn(() => 0.5),
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (worklet: (...args: unknown[]) => void, ...args: unknown[]) =>
    worklet(...args),
  scheduleOnRN: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

/** Flush one RN turn, leaving callbacks scheduled by this turn queued. */
function flushRN() {
  const pending = [...(scheduleOnRN as jest.Mock).mock.calls];
  (scheduleOnRN as jest.Mock).mockClear();
  for (const [callback, ...args] of pending) callback(...args);
}

const trees: ReactTestRenderer[] = [];

async function mountHook({
  registerSource = true,
}: {
  registerSource?: boolean;
} = {}) {
  const visibility = new ElementVisibilityRegistry();
  const sourceHidden = visibility.get('source', false);
  const targetHidden = visibility.get('target', false);
  const progress = makeMutable(0.7);
  const interactionOwner = makeMutable<string | null>(null);
  const progressOwnership = new ProgressOwnership(
    makeMutable(0),
    progress,
    visibility.handoff
  );
  const navigationController = new NavigationSessionController();
  navigationController.acquireNavigationLock('article');
  const releaseLock = jest.spyOn(navigationController, 'releaseNavigationLock');
  let session: TransitionSessionData = {
    id: 'reverse',
    groupId: 'group',
    sourceScreenId: 'article',
    targetScreenId: 'home',
    direction: 'backward',
    state: 'active',
    progress,
    pairs: [],
  };
  const getSession = () => session;
  const completeTransition = jest.fn();
  const cancelTransition = jest.fn();
  let token = 0;
  const adoptSession = () => {
    progressOwnership.setSession(session.id);
    token = progressOwnership.claim(session.id)!;
    visibility.sync(new Set(['source', 'target']), session.id);
  };
  adoptSession();
  let api!: ReturnType<typeof useReverseTransitionCommit>;
  function Harness() {
    api = useReverseTransitionCommit({
      progress,
      progressOwnership,
      navigationController,
      interactionOwner,
      getSession,
      completeTransition,
      cancelTransition,
    });
    return null;
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Harness />);
  });
  trees.push(tree);
  const unregister = registerSource
    ? api.registerScreenPresentation('article', {
        current: {} as React.ComponentRef<typeof View>,
      })
    : () => {};

  return {
    get api() {
      return api;
    },
    tree,
    visibility,
    sourceHidden,
    targetHidden,
    progress,
    interactionOwner,
    navigationController,
    releaseLock,
    completeTransition,
    cancelTransition,
    unregister,
    replaceSession(id: string) {
      session = { ...session, id };
      adoptSession();
    },
    async start(
      commit?: () => Promise<NavigationCommitResult>,
      duration?: number
    ) {
      const navigation = deferred<NavigationCommitResult>();
      const navigateBack = jest.fn(commit ?? (() => navigation.promise));
      let completion!: Promise<void>;
      await act(async () => {
        completion = api.commitReverseTransition({
          sessionId: session.id,
          token,
          navigateBack,
          options: duration ? { duration } : undefined,
        });
      });
      return { completion, navigation, navigateBack };
    },
    finishAnimation() {
      const onComplete = (withSpring as jest.Mock).mock.calls.at(-1)?.[2];
      if (!onComplete) throw new Error('Settlement animation has not started');
      progress.value = 0;
      onComplete(true);
    },
  };
}

const originalPlatform = Platform.OS;

beforeEach(() => {
  Platform.OS = 'android';
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((tree) => tree.unmount());
  });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  Platform.OS = originalPlatform;
});

describe('provider reverse commit integration', () => {
  test.each(['ios', 'android'] as const)(
    '%s waits for animation then removal before handing off',
    async (platform) => {
      Platform.OS = platform;
      const harness = await mountHook();
      const { completion, navigation, navigateBack } = await harness.start();
      expect(withSpring).toHaveBeenCalledTimes(1);
      expect(navigateBack).not.toHaveBeenCalled();
      await act(async () => {
        harness.finishAnimation();
        expect(harness.interactionOwner.value).toBeNull();
        flushRN();
      });
      expect(navigateBack).toHaveBeenCalledTimes(1);
      expect(harness.visibility.handoff.value.completed).toBe(false);
      await act(async () =>
        navigation.resolve({ removed: true, presented: false })
      );
      await completion;
      expect(harness.interactionOwner.value).toBe('home');
      expect(harness.visibility.handoff.value.completed).toBe(true);
      await act(async () => flushRN());
      expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
      expect(harness.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test('timed Back has no wall-clock completion fallback', async () => {
    const harness = await mountHook();
    const { completion, navigation, navigateBack } = await harness.start(
      undefined,
      200
    );
    await act(async () => {
      jest.advanceTimersByTime(1000);
      flushRN();
    });
    expect(navigateBack).not.toHaveBeenCalled();
    await act(async () => {
      (withTiming as jest.Mock).mock.calls[0]![2](true);
      flushRN();
    });
    expect(navigateBack).toHaveBeenCalledTimes(1);
    await act(async () =>
      navigation.resolve({ removed: true, presented: true })
    );
    await completion;
  });

  test('route removal does not wait for native transitionEnd', async () => {
    const harness = await mountHook();
    const state = { routes: [{ key: 'home' }, { key: 'article' }] };
    const commit = createBackCommit(
      { getState: () => state, addListener: jest.fn(() => jest.fn()) },
      'article',
      () => {
        state.routes.pop();
      }
    );
    const { completion } = await harness.start(commit);
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    await completion;
    expect(harness.interactionOwner.value).toBe('home');
  });

  test('a stale animation callback cannot pop the replacement session', async () => {
    const harness = await mountHook();
    const first = await harness.start();
    const oldCallback = (withSpring as jest.Mock).mock.calls[0]![2];
    harness.replaceSession('replacement');
    const second = await harness.start();
    await first.completion;
    await act(async () => {
      oldCallback(true);
      flushRN();
    });
    expect(first.navigateBack).not.toHaveBeenCalled();
    expect(second.navigateBack).not.toHaveBeenCalled();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    await act(async () =>
      second.navigation.resolve({ removed: true, presented: true })
    );
    await second.completion;
    await act(async () => flushRN());
    expect(harness.completeTransition.mock.calls).toEqual([['replacement']]);
  });

  test('late navigation acknowledgement cannot complete a replacement session', async () => {
    const harness = await mountHook();
    const first = await harness.start();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    harness.replaceSession('replacement');
    const second = await harness.start();
    await first.completion;
    await act(async () =>
      first.navigation.resolve({ removed: true, presented: true })
    );
    expect(harness.interactionOwner.value).toBeNull();
    expect(harness.completeTransition).not.toHaveBeenCalled();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    await act(async () =>
      second.navigation.resolve({ removed: true, presented: true })
    );
    await second.completion;
    await act(async () => flushRN());
    expect(harness.completeTransition.mock.calls).toEqual([['replacement']]);
  });

  test('failed navigation cancels instead of handing off input', async () => {
    const harness = await mountHook();
    const { completion, navigation } = await harness.start();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    await act(async () =>
      navigation.resolve({ removed: false, presented: false })
    );
    await completion;
    expect(harness.interactionOwner.value).toBeNull();
    expect(harness.cancelTransition).toHaveBeenCalledWith('reverse');
  });

  test.each(['animation', 'navigation'] as const)(
    'disposal while %s is pending rejects late completion',
    async (pending) => {
      const harness = await mountHook();
      const { completion, navigation, navigateBack } = await harness.start();
      if (pending === 'navigation')
        await act(async () => {
          harness.finishAnimation();
          flushRN();
        });
      await act(async () => harness.tree.unmount());
      await completion;
      await act(async () => {
        harness.finishAnimation();
        navigation.resolve({ removed: true, presented: true });
        flushRN();
      });
      expect(navigateBack).toHaveBeenCalledTimes(
        pending === 'navigation' ? 1 : 0
      );
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.interactionOwner.value).toBeNull();
    }
  );
});
