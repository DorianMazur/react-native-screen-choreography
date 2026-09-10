import { findNodeHandle, Platform, type View } from 'react-native';
import { makeMutable, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ElementVisibilityRegistry } from '../core/ElementVisibilityRegistry';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ProgressOwnership } from '../core/ProgressOwnership';
import {
  createBackCommit,
  type NavigationCommitResult,
} from '../core/navigationCommit';
import { RetainedView } from '../native/RetainedView';
import type { ElementTransitionPair, TransitionSessionData } from '../types';
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
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (worklet: (...args: unknown[]) => void, ...args: unknown[]) =>
    worklet(...args),
  scheduleOnRN: jest.fn(),
}));

jest.mock('../native/RetainedView', () => ({ RetainedView: 'RetainedView' }));

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
  mode = 'standin',
  registerSource = true,
}: {
  mode?: 'standin' | 'live';
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
    pairs: [{ transition: { mode } } as ElementTransitionPair],
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
    return api.retainedPresentation;
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
    async start(commit?: () => Promise<NavigationCommitResult>) {
      const navigation = deferred<NavigationCommitResult>();
      const navigateBack = jest.fn(commit ?? (() => navigation.promise));
      let completion!: Promise<void>;
      await act(async () => {
        completion = api.commitReverseTransition({
          sessionId: session.id,
          token,
          navigateBack,
        });
      });
      return { completion, navigation, navigateBack };
    },
    async capture(success: boolean, captureId = session.id) {
      const onCaptured = tree.root.findByType(RetainedView).props.onCaptured;
      await act(async () => {
        onCaptured({ nativeEvent: { captureId, success } });
      });
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
  jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(37);
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
  test('iOS keeps the outgoing route until the reverse endpoint without a screen snapshot', async () => {
    Platform.OS = 'ios';
    const harness = await mountHook();
    const { completion, navigation, navigateBack } = await harness.start();
    expect(harness.tree.root.findAllByType(RetainedView)).toHaveLength(0);
    expect(findNodeHandle).not.toHaveBeenCalled();
    expect(withSpring).toHaveBeenCalledTimes(1);
    expect(navigateBack).not.toHaveBeenCalled();
    expect(harness.sourceHidden.value).toBe(1);
    expect(harness.targetHidden.value).toBe(1);
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    expect(navigateBack).toHaveBeenCalledTimes(1);
    // Keep overlay ownership until navigation confirms removal as well.
    expect(harness.visibility.handoff.value.completed).toBe(false);
    await act(async () =>
      navigation.resolve({ removed: true, presented: false })
    );
    await completion;
    expect(harness.visibility.handoff.value.completed).toBe(true);
    expect(harness.interactionOwner.value).toBe('home');
    expect(harness.cancelTransition).not.toHaveBeenCalled();
    await act(async () => flushRN());
    expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
  });

  test.each(['standin', 'live'] as const)(
    '%s releases input after animation and removal without native transitionEnd',
    async (mode) => {
      const harness = await mountHook({ mode });
      const state = { routes: [{ key: 'home' }, { key: 'article' }] };
      const commit = createBackCommit(
        {
          getState: () => state,
          addListener: jest.fn(() => jest.fn()),
        },
        'article',
        () => {
          state.routes.pop();
        }
      );
      const { completion, navigateBack } = await harness.start(commit);
      if (mode === 'standin') await harness.capture(true);
      expect(navigateBack).toHaveBeenCalledTimes(mode === 'standin' ? 1 : 0);
      expect(harness.interactionOwner.value).toBeNull();
      await act(async () => {
        harness.finishAnimation();
        if (mode === 'standin') {
          expect(harness.interactionOwner.value).toBe('home');
        }
        flushRN();
      });
      await completion;
      expect(navigateBack).toHaveBeenCalledTimes(1);
      expect(harness.interactionOwner.value).toBe('home');
      expect(harness.visibility.handoff.value.completed).toBe(true);
      expect(harness.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test.each(['animation', 'navigation'] as const)(
    'hands off on the UI runtime with RN callbacks blocked when %s finishes first',
    async (first) => {
      const harness = await mountHook();
      const { completion, navigation, navigateBack } = await harness.start();
      expect(harness.tree.root.findByType(RetainedView).props.sourceTag).toBe(
        37
      );
      expect(navigateBack).not.toHaveBeenCalled();
      expect(withSpring).not.toHaveBeenCalled();
      await harness.capture(true);
      expect(navigateBack).toHaveBeenCalledTimes(1);
      expect(withSpring).toHaveBeenCalledTimes(1);
      expect(harness.visibility.handoff.value.completed).toBe(false);

      // The route is now allowed to disappear; the provider retains the work.
      harness.unregister();
      expect(harness.api.reverseController.owns('reverse')).toBe(true);
      await act(async () => {
        if (first === 'animation') {
          harness.finishAnimation();
        } else navigation.resolve({ removed: true, presented: true });
      });
      expect(harness.sourceHidden.value).toBe(1);
      expect(harness.targetHidden.value).toBe(1);
      expect(harness.interactionOwner.value).toBeNull();
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.releaseLock).not.toHaveBeenCalled();

      await act(async () => {
        if (first === 'animation') {
          navigation.resolve({ removed: true, presented: true });
        } else {
          harness.finishAnimation();
        }
      });
      // Even the RN animation-complete callback is still blocked. The second
      // signal releases both visual and input ownership entirely on the UI side.
      expect(harness.sourceHidden.value).toBe(0);
      expect(harness.targetHidden.value).toBe(0);
      expect(harness.interactionOwner.value).toBe('home');
      expect(harness.visibility.handoff.value.completed).toBe(true);
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.navigationController.isNavigationLocked()).toBe(true);
      expect(harness.api.reverseController.owns('reverse')).toBe(true);
      await act(async () => flushRN());
      await completion;
      expect(harness.completeTransition).not.toHaveBeenCalled();
      await act(async () => flushRN());
      expect(harness.completeTransition).toHaveBeenCalledWith('reverse');
      expect(harness.navigationController.isNavigationLocked()).toBe(false);
      expect(harness.cancelTransition).not.toHaveBeenCalled();
      expect(harness.tree.root.findAllByType(RetainedView)).toHaveLength(0);
    }
  );

  test.each(['failure', 'timeout'] as const)(
    'keeps the source mounted during animation after capture %s',
    async (failure) => {
      const harness = await mountHook();
      const { completion, navigation, navigateBack } = await harness.start();
      if (failure === 'failure') await harness.capture(false);
      else {
        await act(async () => jest.advanceTimersByTime(150));
      }
      expect(harness.tree.root.findAllByType(RetainedView)).toHaveLength(0);
      expect(withSpring).toHaveBeenCalledTimes(1);
      expect(navigateBack).not.toHaveBeenCalled();
      await act(async () => {
        harness.finishAnimation();
        flushRN();
      });
      expect(navigateBack).toHaveBeenCalledTimes(1);
      expect(harness.interactionOwner.value).toBeNull();
      await act(async () => {
        navigation.resolve({ removed: true, presented: true });
      });
      await completion;
      expect(harness.interactionOwner.value).toBe('home');
      expect(harness.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['live presentation', { mode: 'live' as const }],
    ['missing source registration', { registerSource: false }],
  ])('falls back without capture for %s', async (_reason, options) => {
    const harness = await mountHook(options);
    const { completion, navigation, navigateBack } = await harness.start();
    expect(findNodeHandle).not.toHaveBeenCalled();
    expect(harness.tree.root.findAllByType(RetainedView)).toHaveLength(0);
    expect(withSpring).toHaveBeenCalledTimes(1);
    expect(navigateBack).not.toHaveBeenCalled();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    expect(navigateBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      navigation.resolve({ removed: true, presented: true });
    });
    await completion;
    expect(harness.interactionOwner.value).toBe('home');
  });

  test('rejects unrelated capture IDs and stale native callbacks after replacement', async () => {
    const harness = await mountHook();
    const first = await harness.start();
    const oldCaptureCallback =
      harness.tree.root.findByType(RetainedView).props.onCaptured;
    await harness.capture(true, 'unrelated');
    expect(first.navigateBack).not.toHaveBeenCalled();

    harness.replaceSession('replacement');
    const second = await harness.start();
    await first.completion;
    await act(async () => {
      oldCaptureCallback({
        nativeEvent: { captureId: 'reverse', success: true },
      });
    });
    expect(harness.tree.root.findByType(RetainedView).props.captureId).toBe(
      'replacement'
    );
    expect(first.navigateBack).not.toHaveBeenCalled();
    expect(second.navigateBack).not.toHaveBeenCalled();
    expect(withSpring).not.toHaveBeenCalled();

    await harness.capture(true);
    expect(second.navigateBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      harness.finishAnimation();
      flushRN();
      second.navigation.resolve({ removed: true, presented: true });
    });
    await second.completion;
    expect(harness.interactionOwner.value).toBe('home');
    expect(harness.cancelTransition).not.toHaveBeenCalled();
  });

  test('late navigation acknowledgements cannot complete a newer session', async () => {
    const harness = await mountHook();
    const first = await harness.start();
    await harness.capture(true);
    harness.replaceSession('replacement');
    const second = await harness.start();
    await first.completion;
    await act(async () => {
      first.navigation.resolve({ removed: true, presented: true });
    });
    expect(harness.interactionOwner.value).toBeNull();
    expect(harness.completeTransition).not.toHaveBeenCalled();
    expect(harness.api.reverseController.owns('replacement')).toBe(true);

    await harness.capture(true);
    await act(async () => {
      harness.finishAnimation();
      flushRN();
      second.navigation.resolve({ removed: true, presented: true });
    });
    await second.completion;
    await act(async () => flushRN());
    expect(harness.completeTransition.mock.calls).toEqual([['replacement']]);
  });

  test('provider disposal clears a native-ready gate before a late spring callback', async () => {
    const harness = await mountHook();
    const { completion, navigation } = await harness.start();
    await harness.capture(true);
    await act(async () => {
      navigation.resolve({ removed: true, presented: true });
    });
    expect(harness.interactionOwner.value).toBeNull();
    await act(async () => harness.tree.unmount());
    await completion;
    await act(async () => {
      harness.finishAnimation();
      flushRN();
    });
    expect(harness.interactionOwner.value).toBeNull();
    expect(harness.visibility.handoff.value.completed).toBe(false);
    expect(harness.completeTransition).not.toHaveBeenCalled();
  });

  test('observed source removal still opens the UI gate when the adapter reports stale state', async () => {
    const harness = await mountHook();
    const { completion, navigation } = await harness.start();
    await harness.capture(true);
    harness.unregister();
    await act(async () => {
      harness.finishAnimation();
      flushRN();
      navigation.resolve({ removed: false, presented: false });
    });
    await completion;
    expect(harness.interactionOwner.value).toBe('home');
    expect(harness.visibility.handoff.value.completed).toBe(true);
    expect(harness.cancelTransition).not.toHaveBeenCalled();
  });

  test.each(['capture', 'navigation'] as const)(
    'provider disposal while %s is pending prevents subsequent handoff',
    async (pending) => {
      const harness = await mountHook();
      const { completion, navigation, navigateBack } = await harness.start();
      const captureCallback =
        harness.tree.root.findByType(RetainedView).props.onCaptured;
      if (pending === 'navigation') await harness.capture(true);
      await act(async () => harness.tree.unmount());
      await completion;
      await act(async () => {
        captureCallback({
          nativeEvent: { captureId: 'reverse', success: true },
        });
        navigation.resolve({ removed: true, presented: true });
        if (pending === 'navigation') harness.finishAnimation();
        flushRN();
        jest.advanceTimersByTime(200);
      });
      expect(navigateBack).toHaveBeenCalledTimes(pending === 'capture' ? 0 : 1);
      expect(harness.completeTransition).not.toHaveBeenCalled();
      expect(harness.cancelTransition).not.toHaveBeenCalled();
      expect(harness.interactionOwner.value).toBeNull();
      expect(harness.api.reverseController.owns('reverse')).toBe(false);
    }
  );
});
