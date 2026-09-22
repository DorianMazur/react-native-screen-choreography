import { Platform, type View } from 'react-native';
import {
  makeMutable,
  useAnimatedReaction,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
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
import type { ScreenAnimationLifetime } from './useScreenAnimationLifetime';

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
  scheduleOnUI: jest.fn(
    (worklet: (...args: unknown[]) => void, ...args: unknown[]) =>
      worklet(...args)
  ),
  scheduleOnRN: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  direction = 'backward',
  animationLifetime,
}: {
  registerSource?: boolean;
  direction?: 'forward' | 'backward';
  animationLifetime?: ScreenAnimationLifetime;
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
    sourceScreenId: direction === 'forward' ? 'home' : 'article',
    targetScreenId: direction === 'forward' ? 'article' : 'home',
    direction,
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
    ? api.registerScreenPresentation(
        'article',
        { current: {} as React.ComponentRef<typeof View> },
        animationLifetime
      )
    : () => {};

  return {
    get api() {
      return api;
    },
    tree,
    get token() {
      return token;
    },
    visibility,
    sourceHidden,
    targetHidden,
    progress,
    progressOwnership,
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
  test.each(['forward', 'backward'] as const)(
    '%s return accepts a new tap in the final 10% before the spring completes',
    async (direction) => {
      const harness = await mountHook({ direction });
      const { completion, navigation, navigateBack } = await harness.start();
      const [prepare, react] = (useAnimatedReaction as jest.Mock).mock.calls.at(
        -1
      )!;
      harness.progress.value = 0.101;
      expect(prepare()).toBeNull();
      harness.progress.value = 0.1;
      await act(async () => {
        react(prepare(), null);
        flushRN();
      });
      expect(navigateBack).toHaveBeenCalledTimes(1);
      await act(async () =>
        navigation.resolve({ removed: true, presented: false })
      );
      expect(harness.visibility.handoff.value.completed).toBe(false);
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.api.reverseHandoff.value?.navigationPresented).toBe(true);
      expect(harness.api.reverseHandoff.value?.targetScreenId).toBe('home');
      expect(harness.api.interruptibleReturnSessionId).toBe('reverse');
      const finishTransition =
        direction === 'forward'
          ? harness.cancelTransition
          : harness.completeTransition;
      await act(async () => {
        expect(harness.api.reverseController.finishImmediately('reverse')).toBe(
          true
        );
      });
      await completion;
      expect(harness.progress.value).toBe(0);
      expect(harness.interactionOwner.value).toBe('home');
      expect(finishTransition).toHaveBeenCalledTimes(1);
      await act(async () => {
        harness.finishAnimation();
        flushRN();
      });
      expect(finishTransition).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['forward', 'backward'] as const)(
    'Android fences the departing %s screen at 10% while retained motion continues',
    async (direction) => {
      const barrier = deferred<void>();
      const lifetime = {
        suspend: jest.fn(() => barrier.promise),
        resume: jest.fn(),
      };
      const destinationLifetime = {
        suspend: jest.fn(async () => {}),
        resume: jest.fn(),
      };
      const harness = await mountHook({
        direction,
        animationLifetime: lifetime,
      });
      harness.api.registerScreenPresentation(
        'home',
        { current: {} as React.ComponentRef<typeof View> },
        destinationLifetime
      );
      const { completion, navigation, navigateBack } = await harness.start();
      const [prepare, react] = (useAnimatedReaction as jest.Mock).mock.calls.at(
        -1
      )!;
      harness.progress.value = 0.101;
      expect(prepare()).toBeNull();
      expect(lifetime.suspend).not.toHaveBeenCalled();
      harness.progress.value = 0.1;
      await act(async () => {
        react(prepare(), null);
        flushRN();
      });
      expect(lifetime.suspend).toHaveBeenCalledWith(harness.token);
      expect(destinationLifetime.suspend).not.toHaveBeenCalled();
      expect(navigateBack).not.toHaveBeenCalled();
      expect(harness.progress.value).toBe(0.1);
      expect(harness.visibility.handoff.value.completed).toBe(false);
      await act(async () => barrier.resolve());
      expect(navigateBack).toHaveBeenCalledTimes(1);
      await act(async () =>
        navigation.resolve({ removed: true, presented: false })
      );
      expect(harness.api.interruptibleReturnSessionId).toBe('reverse');
      expect(harness.progress.value).toBe(0.1);
      expect(harness.visibility.handoff.value.completed).toBe(false);
      await act(async () => {
        harness.finishAnimation();
        flushRN();
      });
      await completion;
      expect(lifetime.resume).not.toHaveBeenCalled();
      expect(harness.interactionOwner.value).toBe('home');
    }
  );

  test('Android still awaits the source fence when the animation has already finished', async () => {
    const barrier = deferred<void>();
    const lifetime = {
      suspend: jest.fn(() => barrier.promise),
      resume: jest.fn(),
    };
    const harness = await mountHook({ animationLifetime: lifetime });
    const { completion, navigation, navigateBack } = await harness.start();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    expect(lifetime.suspend).toHaveBeenCalledTimes(1);
    expect(navigateBack).not.toHaveBeenCalled();
    expect(harness.completeTransition).not.toHaveBeenCalled();
    await act(async () => barrier.resolve());
    expect(navigateBack).toHaveBeenCalledTimes(1);
    await act(async () =>
      navigation.resolve({ removed: true, presented: false })
    );
    await completion;
    expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
  });

  test('iOS preserves early removal without waiting for an Android fence', async () => {
    Platform.OS = 'ios';
    const barrier = deferred<void>();
    const lifetime = {
      suspend: jest.fn(() => barrier.promise),
      resume: jest.fn(),
    };
    const harness = await mountHook({ animationLifetime: lifetime });
    const { completion, navigation, navigateBack } = await harness.start();
    await act(async () =>
      harness.api.reverseController.commitNearEndpoint('reverse')
    );
    expect(lifetime.suspend).not.toHaveBeenCalled();
    expect(navigateBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      navigation.resolve({ removed: true, presented: false });
      harness.finishAnimation();
      flushRN();
    });
    await completion;
  });

  test.each(['replacement', 'disposal'] as const)(
    'a pending Android fence cannot pop after %s and resumes its surviving source',
    async (interruption) => {
      const barrier = deferred<void>();
      const lifetime = {
        suspend: jest.fn(() => barrier.promise),
        resume: jest.fn(),
      };
      const harness = await mountHook({ animationLifetime: lifetime });
      const originalToken = harness.token;
      const { completion, navigateBack } = await harness.start();
      await act(async () =>
        harness.api.reverseController.commitNearEndpoint('reverse')
      );
      expect(lifetime.suspend).toHaveBeenCalledTimes(1);
      await act(async () => {
        if (interruption === 'replacement')
          harness.replaceSession('replacement');
        else harness.api.reverseController.dispose();
        barrier.resolve();
      });
      await completion;
      expect(navigateBack).not.toHaveBeenCalled();
      expect(lifetime.resume).toHaveBeenCalledWith(originalToken);
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['replacement', 'refused'],
    ['replacement', 'throws'],
    ['replacement', 'removed'],
    ['disposal', 'refused'],
    ['disposal', 'throws'],
    ['disposal', 'removed'],
  ] as const)(
    'late navigation result after %s resumes only the surviving source (%s)',
    async (interruption, outcome) => {
      const lifetime = { suspend: jest.fn(async () => {}), resume: jest.fn() };
      const harness = await mountHook({ animationLifetime: lifetime });
      const originalToken = harness.token;
      const { completion, navigation, navigateBack } = await harness.start();
      await act(async () =>
        harness.api.reverseController.commitNearEndpoint('reverse')
      );
      expect(navigateBack).toHaveBeenCalledTimes(1);
      await act(async () => {
        if (interruption === 'replacement')
          harness.replaceSession('replacement');
        else harness.api.reverseController.dispose();
        if (outcome === 'throws') navigation.reject(new Error('Rejected pop'));
        else
          navigation.resolve({
            removed: outcome === 'removed',
            presented: false,
          });
      });
      await completion;
      if (outcome === 'removed') expect(lifetime.resume).not.toHaveBeenCalled();
      else expect(lifetime.resume).toHaveBeenCalledWith(originalToken);
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['forward', 'absent'],
    ['forward', 'remounted'],
    ['forward', 'reused lifetime'],
    ['backward', 'absent'],
    ['backward', 'remounted'],
    ['backward', 'reused lifetime'],
  ] as const)(
    'an %s source presentation changed during the fence cancels without claiming route removal (%s)',
    async (direction, presentation) => {
      const barrier = deferred<void>();
      const lifetime = {
        suspend: jest.fn(() => barrier.promise),
        resume: jest.fn(),
      };
      const replacementLifetime = {
        suspend: jest.fn(async () => {}),
        resume: jest.fn(),
      };
      const harness = await mountHook({
        direction,
        animationLifetime: lifetime,
      });
      const { completion, navigateBack } = await harness.start();
      await act(async () =>
        harness.api.reverseController.commitNearEndpoint('reverse')
      );
      expect(lifetime.suspend).toHaveBeenCalledTimes(1);
      await act(async () => {
        harness.unregister();
        if (presentation !== 'absent')
          harness.api.registerScreenPresentation(
            'article',
            { current: {} as React.ComponentRef<typeof View> },
            presentation === 'reused lifetime' ? lifetime : replacementLifetime
          );
        barrier.resolve();
      });
      await completion;
      expect(navigateBack).not.toHaveBeenCalled();
      expect(harness.api.interruptibleReturnSessionId).toBeNull();
      expect(harness.api.reverseHandoff.value?.navigationPresented).toBe(false);
      expect(harness.visibility.handoff.value.completed).toBe(false);
      expect(harness.interactionOwner.value).toBeNull();
      expect(harness.releaseLock).not.toHaveBeenCalled();
      expect(replacementLifetime.suspend).not.toHaveBeenCalled();
      expect(replacementLifetime.resume).not.toHaveBeenCalled();
      if (direction === 'forward') {
        expect(harness.progress.value).toBe(1);
        expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
        expect(harness.cancelTransition).not.toHaveBeenCalled();
      } else {
        expect(harness.cancelTransition).toHaveBeenCalledWith('reverse');
        expect(harness.completeTransition).not.toHaveBeenCalled();
      }
      await act(async () => {
        harness.finishAnimation();
        flushRN();
      });
      expect(navigateBack).not.toHaveBeenCalled();
      expect(harness.interactionOwner.value).toBeNull();
    }
  );

  test('stale presentation cleanup cannot unregister the remounted route before its next return', async () => {
    const firstBarrier = deferred<void>();
    const oldLifetime = {
      suspend: jest.fn(() => firstBarrier.promise),
      resume: jest.fn(),
    };
    const newLifetime = { suspend: jest.fn(async () => {}), resume: jest.fn() };
    const harness = await mountHook({ animationLifetime: oldLifetime });
    const first = await harness.start();
    await act(async () =>
      harness.api.reverseController.commitNearEndpoint('reverse')
    );
    harness.api.registerScreenPresentation(
      'article',
      { current: {} as React.ComponentRef<typeof View> },
      newLifetime
    );
    await act(async () => {
      harness.unregister();
      firstBarrier.resolve();
    });
    await first.completion;
    expect(first.navigateBack).not.toHaveBeenCalled();
    harness.replaceSession('replacement');
    const second = await harness.start();
    await act(async () =>
      harness.api.reverseController.commitNearEndpoint('replacement')
    );
    expect(newLifetime.suspend).toHaveBeenCalledWith(harness.token);
    expect(second.navigateBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      harness.finishAnimation();
      flushRN();
      second.navigation.resolve({ removed: true, presented: false });
    });
    await second.completion;
    expect(harness.completeTransition).toHaveBeenCalledWith('replacement');
  });

  test.each(['refused', 'throws'] as const)(
    'a source unmount after the Android fence proves removal even if navigation %s',
    async (outcome) => {
      const lifetime = { suspend: jest.fn(async () => {}), resume: jest.fn() };
      const harness = await mountHook({ animationLifetime: lifetime });
      const { completion, navigateBack, navigation } = await harness.start();
      await act(async () =>
        harness.api.reverseController.commitNearEndpoint('reverse')
      );
      expect(navigateBack).toHaveBeenCalledTimes(1);
      await act(async () => {
        harness.unregister();
        if (outcome === 'throws')
          navigation.reject(new Error('Navigation rejected'));
        else navigation.resolve({ removed: false, presented: false });
        harness.finishAnimation();
        flushRN();
      });
      await completion;
      expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
      expect(harness.cancelTransition).not.toHaveBeenCalled();
      expect(harness.interactionOwner.value).toBe('home');
      expect(lifetime.resume).not.toHaveBeenCalled();
    }
  );

  test.each(['refused', 'throws'] as const)(
    'a %s Android pop resumes the source animation lifetime',
    async (outcome) => {
      const lifetime = { suspend: jest.fn(async () => {}), resume: jest.fn() };
      const harness = await mountHook({ animationLifetime: lifetime });
      const navigate = async () => {
        if (outcome === 'throws') throw new Error('Navigation rejected');
        return { removed: false, presented: false };
      };
      const { completion } = await harness.start(navigate);
      await act(async () =>
        harness.api.reverseController.commitNearEndpoint('reverse')
      );
      await completion;
      expect(lifetime.suspend).toHaveBeenCalledWith(harness.token);
      expect(lifetime.resume).toHaveBeenCalledWith(harness.token);
      expect(harness.cancelTransition).toHaveBeenCalledWith('reverse');
      expect(harness.interactionOwner.value).toBeNull();
    }
  );

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
      // No additional RN turn is needed to retarget the portal and unlock.
      expect(scheduleOnRN).not.toHaveBeenCalled();
      expect(harness.releaseLock).toHaveBeenCalledTimes(1);
      expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
      expect(harness.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test('source unmount evidence also completes without an extra RN turn', async () => {
    const harness = await mountHook();
    const { completion, navigation } = await harness.start();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
      harness.unregister();
      navigation.resolve({ removed: false, presented: false });
    });
    await completion;
    expect(harness.interactionOwner.value).toBe('home');
    expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
    expect(harness.releaseLock).toHaveBeenCalledTimes(1);
    expect(harness.cancelTransition).not.toHaveBeenCalled();
    expect(scheduleOnRN).not.toHaveBeenCalled();
  });

  test('queues input handoff before session cleanup invalidates UI ownership', async () => {
    const harness = await mountHook();
    const { completion, navigation } = await harness.start();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    const pendingUI: (() => void)[] = [];
    const scheduleUI = scheduleOnUI as jest.Mock;
    const immediateUI = scheduleUI.getMockImplementation()!;
    scheduleUI.mockImplementation((worklet, ...args) => {
      pendingUI.push(() => worklet(...args));
    });
    harness.completeTransition.mockImplementation(() => {
      harness.progressOwnership.setSession(null);
    });
    try {
      await act(async () =>
        navigation.resolve({ removed: true, presented: false })
      );
      await completion;
      expect(harness.completeTransition).toHaveBeenCalledTimes(1);
      expect(harness.interactionOwner.value).toBeNull();
      expect(scheduleOnRN).not.toHaveBeenCalled();
      pendingUI.forEach((worklet) => worklet());
      expect(harness.interactionOwner.value).toBe('home');
      expect(harness.visibility.handoff.value.completed).toBe(true);
    } finally {
      scheduleUI.mockImplementation(immediateUI);
    }
  });

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

  test.each(['forward', 'backward'] as const)(
    'failed %s return restores the detail instead of handing off input',
    async (direction) => {
      const harness = await mountHook({ direction });
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
      expect(harness.api.interruptibleReturnSessionId).toBeNull();
      if (direction === 'forward') {
        expect(harness.progress.value).toBe(1);
        expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
        expect(harness.cancelTransition).not.toHaveBeenCalled();
      } else {
        expect(harness.cancelTransition).toHaveBeenCalledWith('reverse');
        expect(harness.completeTransition).not.toHaveBeenCalled();
      }
    }
  );

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
