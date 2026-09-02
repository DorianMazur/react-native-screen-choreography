import { NavigationSessionController } from '../src/core/NavigationSessionController';
import type { TransitionSessionData } from '../src/types';

function createSession(id: string): TransitionSessionData {
  return {
    id,
    groupId: 'group',
    sourceScreenId: 'source',
    targetScreenId: 'target',
    state: 'active',
    pairs: [],
    progress: { value: 0 } as TransitionSessionData['progress'],
    direction: 'forward',
  };
}

describe('NavigationSessionController', () => {
  test('acquires and releases the navigation lock atomically', () => {
    const controller = new NavigationSessionController();

    expect(controller.acquireNavigationLock()).toBe(true);
    expect(controller.acquireNavigationLock()).toBe(false);
    expect(controller.isNavigationLocked()).toBe(true);

    controller.releaseNavigationLock();
    expect(controller.isNavigationLocked()).toBe(false);
  });

  test('keeps only the latest queued navigation request', () => {
    const controller = new NavigationSessionController();
    controller.queueNavigation({ screenName: 'First' });
    controller.queueNavigation({ screenName: 'Second', params: { id: 2 } });

    expect(controller.takeQueuedNavigation()).toEqual({
      screenName: 'Second',
      params: { id: 2 },
    });
    expect(controller.peekQueuedNavigation()).toBeNull();
  });

  test('invalidates stale animation tokens and sessions', () => {
    const controller = new NavigationSessionController();
    controller.setActiveSession(createSession('session-1'));
    const firstToken = controller.createAnimationToken();

    expect(controller.isCurrentAnimation(firstToken)).toBe(true);
    expect(controller.isCurrentSession('session-1')).toBe(true);

    controller.invalidateAnimation();
    controller.setActiveSession(createSession('session-2'));

    expect(controller.isCurrentAnimation(firstToken)).toBe(false);
    expect(controller.isCurrentSession('session-1')).toBe(false);
    expect(controller.isCurrentSession('session-2')).toBe(true);
  });

  test('prepares an Android forward transition in ownership order', async () => {
    const controller = new NavigationSessionController();
    const calls: string[] = [];
    const session = createSession('session-1');
    controller.acquireNavigationLock();

    const result = await controller.prepareForwardTransition({
      groupId: 'group',
      sourceScreenId: 'source',
      targetScreenId: 'target',
      isAndroid: true,
      preMeasureGroup: async () => {
        calls.push('measure');
      },
      setPendingTargetScreen: (screenId) => {
        calls.push(`pending:${screenId ?? 'none'}`);
      },
      dispatchNavigation: () => {
        calls.push('navigate');
      },
      waitForScreenReady: async () => {
        calls.push('screen-ready');
      },
      waitForNextFrame: async () => {
        calls.push('frame');
      },
      startTransition: async () => {
        calls.push('start');
        return session;
      },
      waitForOverlayReady: async () => {
        calls.push('overlay-ready');
      },
    });

    expect(result).toBe(session);
    expect(calls).toEqual([
      'measure',
      'pending:target',
      'navigate',
      'screen-ready',
      'frame',
      'start',
      'overlay-ready',
      'pending:none',
    ]);
    expect(controller.isNavigationLocked()).toBe(true);
  });

  test('clears pending ownership and unlocks when pairing fails', async () => {
    const controller = new NavigationSessionController();
    const pendingScreens: Array<string | null> = [];
    controller.acquireNavigationLock();

    const result = await controller.prepareForwardTransition({
      groupId: 'group',
      sourceScreenId: 'source',
      targetScreenId: 'target',
      isAndroid: false,
      preMeasureGroup: async () => {},
      setPendingTargetScreen: (screenId) => pendingScreens.push(screenId),
      dispatchNavigation: () => {},
      waitForScreenReady: async () => {},
      waitForNextFrame: async () => {},
      startTransition: async () => null,
      waitForOverlayReady: async () => {},
    });

    expect(result).toBeNull();
    expect(pendingScreens).toEqual(['target', null]);
    expect(controller.isNavigationLocked()).toBe(false);
  });
});
