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
    const dispatchFirst = jest.fn();
    const dispatchSecond = jest.fn();
    controller.queueNavigation({
      targetScreenId: 'First',
      dispatchNavigation: dispatchFirst,
    });
    controller.queueNavigation({
      targetScreenId: 'Second',
      dispatchNavigation: dispatchSecond,
    });

    expect(controller.takeQueuedNavigation()).toEqual({
      targetScreenId: 'Second',
      dispatchNavigation: dispatchSecond,
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

  test.each([
    ['iOS', false, false],
    ['Android', true, true],
  ] as const)(
    'prepares a %s forward transition after explicit readiness',
    async (_platform, isAndroid, waitsForExtraFrame) => {
      const controller = new NavigationSessionController();
      const calls: string[] = [];
      const session = createSession('session-1');
      controller.acquireNavigationLock();

      const result = await controller.prepareForwardTransition({
        groupId: 'group',
        sourceScreenId: 'source',
        targetScreenId: 'target',
        isAndroid,
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
          return true;
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
          return true;
        },
      });

      expect(result).toBe(session);
      const expectedCalls = [
        'measure',
        'pending:target',
        'navigate',
        'screen-ready',
        'start',
        'overlay-ready',
        'pending:none',
      ];
      if (waitsForExtraFrame) {
        expectedCalls.splice(4, 0, 'frame');
      }
      expect(calls).toEqual(expectedCalls);
      expect(controller.isNavigationLocked()).toBe(true);
    }
  );

  test('aborts choreography and unlocks when screen readiness times out', async () => {
    const controller = new NavigationSessionController();
    const pendingScreens: Array<string | null> = [];
    const startTransition = jest.fn(async () => createSession('unexpected'));
    const dispatchNavigation = jest.fn();
    controller.acquireNavigationLock();

    const result = await controller.prepareForwardTransition({
      groupId: 'group',
      sourceScreenId: 'source',
      targetScreenId: 'target',
      isAndroid: false,
      preMeasureGroup: async () => {},
      setPendingTargetScreen: (screenId) => pendingScreens.push(screenId),
      dispatchNavigation,
      waitForScreenReady: async () => false,
      waitForNextFrame: async () => {},
      startTransition,
      waitForOverlayReady: async () => {},
    });

    expect(result).toBeNull();
    expect(dispatchNavigation).toHaveBeenCalledTimes(1);
    expect(startTransition).not.toHaveBeenCalled();
    expect(pendingScreens).toEqual(['target', null]);
    expect(controller.isNavigationLocked()).toBe(false);
  });

  test('unlocks when overlay readiness is cancelled by replacement', async () => {
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
      waitForScreenReady: async () => true,
      waitForNextFrame: async () => {},
      startTransition: async () => createSession('replaced-session'),
      waitForOverlayReady: async () => false,
    });

    expect(result).toBeNull();
    expect(pendingScreens).toEqual(['target', null]);
    expect(controller.isNavigationLocked()).toBe(false);
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
      waitForScreenReady: async () => true,
      waitForNextFrame: async () => {},
      startTransition: async () => null,
      waitForOverlayReady: async () => true,
    });

    expect(result).toBeNull();
    expect(pendingScreens).toEqual(['target', null]);
    expect(controller.isNavigationLocked()).toBe(false);
  });
});
