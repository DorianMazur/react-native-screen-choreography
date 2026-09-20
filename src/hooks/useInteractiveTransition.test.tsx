import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ProgressOwnership } from '../core/ProgressOwnership';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ScreenIdContext } from '../core/screenIdContext';
import { useInteractiveTransitionNavigator } from './useInteractiveTransition';
import type {
  InteractiveTransitionHandle,
  TransitionSessionData,
} from '../types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  useDerivedValue: (compute: () => number) => ({
    get value() {
      return compute();
    },
  }),
}));

type Interactive = ReturnType<typeof useInteractiveTransitionNavigator>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('interactive ownership', () => {
  let tree: ReactTestRenderer;
  let interactive: Interactive;
  let ctx: ChoreographyContextType;
  let navigateBack: jest.Mock;

  function Harness() {
    interactive = useInteractiveTransitionNavigator({ navigateBack });
    return null;
  }

  function render() {
    return (
      <ChoreographyContext.Provider value={ctx}>
        <ScreenIdContext.Provider value="Detail">
          <Harness />
        </ScreenIdContext.Provider>
      </ChoreographyContext.Provider>
    );
  }

  function publishSession(id: string): TransitionSessionData {
    const session: TransitionSessionData = {
      id,
      groupId: 'group',
      sourceScreenId: 'Detail',
      targetScreenId: 'List',
      direction: 'backward',
      state: 'active',
      pairs: [],
      progress: ctx.progress,
    };
    ctx.progressOwnership.setSession(id);
    ctx.navigationController.setActiveSession(session);
    ctx.activeSession = session;
    return session;
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    navigateBack = jest.fn();
    const progress = { value: 1 } as ChoreographyContextType['progress'];
    const progressOwnership = new ProgressOwnership(
      { value: 0 } as ChoreographyContextType['progress'],
      progress
    );
    const committedSessions = new Set<string>();
    ctx = {
      progress,
      progressOwnership,
      navigationController: new NavigationSessionController(),
      reverseController: {
        owns: (sessionId: string) => committedSessions.has(sessionId),
      },
      commitReverseTransition: jest.fn(async ({ sessionId }) => {
        committedSessions.add(sessionId);
      }),
      activeSession: null,
      setInteractiveScreen: jest.fn(),
      getNavigationLineage: () => ({
        groupId: 'group',
        sourceScreenId: 'List',
        targetScreenId: 'Detail',
      }),
      captureSourceGroup: jest.fn(async () => {}),
      startTransition: jest.fn(async () => {
        return publishSession('A');
      }),
      waitForOverlayReady: jest.fn(async () => true),
      completeTransition: jest.fn(),
      cancelTransition: jest.fn((sessionId: string) => {
        if (!progressOwnership.isSession(sessionId)) return;
        progressOwnership.setSession(null);
        ctx.navigationController.setActiveSession(null);
        ctx.navigationController.releaseNavigationLock();
        ctx.activeSession = null;
      }),
    } as unknown as ChoreographyContextType;
    await act(async () => {
      tree = create(render());
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('does not start a gesture while another caller owns preparation', async () => {
    ctx.navigationController.acquireNavigationLock('List');
    expect(await interactive.beginBack()).toBeNull();
    expect(ctx.captureSourceGroup).not.toHaveBeenCalled();
    expect(ctx.navigationController.getNavigationSourceScreenId()).toBe('List');
  });

  test('holds source input from preparation until settlement', async () => {
    await act(async () => {
      await interactive.beginBack();
    });
    expect(ctx.setInteractiveScreen).toHaveBeenLastCalledWith('Detail', true);
    interactive.setProgress(1);
    expect(ctx.progress.value).toBe(0);
    expect(ctx.setInteractiveScreen).toHaveBeenLastCalledWith('Detail', true);
    await act(async () => interactive.finish());
    expect(ctx.setInteractiveScreen).toHaveBeenLastCalledWith('Detail', false);
  });

  test('can grab the arriving screen before its forward spring settles', async () => {
    const opening = {
      id: 'opening',
      direction: 'forward',
      state: 'active',
      targetScreenId: 'Detail',
    } as NonNullable<ChoreographyContextType['activeSession']>;
    ctx.navigationController.setActiveSession(opening);
    ctx.navigationController.acquireNavigationLock('List');
    ctx.progressOwnership.setSession(opening.id);
    ctx.progress.value = 0.98;
    ctx.completeTransition = jest.fn(() => {
      ctx.progressOwnership.setSession(null);
      ctx.navigationController.releaseNavigationLock();
      ctx.navigationController.setActiveSession(null);
    });
    await act(async () => tree.update(render()));
    await act(async () => {
      expect(await interactive.beginBack()).not.toBeNull();
    });
    expect(ctx.completeTransition).toHaveBeenCalledWith('opening');
    expect(ctx.startTransition).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'backward' })
    );
  });

  test('does not interrupt an unrelated active transition', async () => {
    ctx.navigationController.setActiveSession({
      id: 'other',
      direction: 'forward',
      state: 'active',
      targetScreenId: 'Other',
    } as NonNullable<ChoreographyContextType['activeSession']>);
    ctx.progressOwnership.setSession('other');
    expect(await interactive.beginBack()).toBeNull();
    expect(ctx.completeTransition).not.toHaveBeenCalled();
    expect(ctx.setInteractiveScreen).not.toHaveBeenCalled();
  });

  test('cancellation while waiting for the overlay cannot activate a stale gesture', async () => {
    let ready!: (value: boolean) => void;
    ctx.waitForOverlayReady = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          ready = resolve;
        })
    );
    await act(async () => tree.update(render()));
    let pending!: ReturnType<Interactive['beginBack']>;
    await act(async () => {
      pending = interactive.beginBack();
    });
    await act(async () => interactive.cancel({ duration: 1 }));
    await act(async () => {
      ready(true);
      expect(await pending).toBeNull();
    });
    expect(interactive.isActive).toBe(false);
    expect(ctx.setInteractiveScreen).toHaveBeenLastCalledWith('Detail', false);
    expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
  });

  test('elapsed time cannot settle a cancelled gesture into a replacement session', async () => {
    await act(async () => {
      await interactive.beginBack();
    });
    await act(async () => {
      interactive.cancel({ duration: 100 });
    });
    ctx.progressOwnership.setSession('B');
    ctx.progress.value = 0.65;
    await act(async () => jest.advanceTimersByTime(200));
    expect(ctx.progress.value).toBe(0.65);
    expect(navigateBack).not.toHaveBeenCalled();
    expect(ctx.completeTransition).not.toHaveBeenCalled();
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
  });

  test('finish delegates its navigation and settlement options to the provider', async () => {
    await act(async () => {
      await interactive.beginBack();
    });
    const updateGesture = interactive.setProgress;
    const options = {
      duration: 100,
      spring: { stiffness: 180 },
      velocity: 0.8,
    };
    const schedule = jest.spyOn(global, 'setTimeout');
    await act(async () => interactive.finish(options));
    expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    const request = jest.mocked(ctx.commitReverseTransition).mock.calls[0]![0];
    expect(request).toEqual({
      sessionId: 'A',
      token: expect.any(Number),
      navigateBack,
      options,
    });
    expect(ctx.progressOwnership.isCurrent(request.token, 'A')).toBe(true);
    expect(schedule).not.toHaveBeenCalled();
    expect(navigateBack).not.toHaveBeenCalled();
    updateGesture(0.9);
    expect(ctx.progress.value).toBe(1);
    await act(async () => interactive.finish(options));
    expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
  });

  test('caller unmount does not cancel a reverse already owned by the provider', async () => {
    await act(async () => {
      await interactive.beginBack();
      interactive.finish({ duration: 100 });
    });
    await act(async () => tree.unmount());
    expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
    expect(ctx.completeTransition).not.toHaveBeenCalled();
  });

  test('caller unmount cancels an uncommitted gesture', async () => {
    await act(async () => {
      await interactive.beginBack();
    });
    await act(async () => tree.unmount());
    expect(ctx.cancelTransition).toHaveBeenCalledWith('A');
    expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
  });

  test('cancel uses no fallback timer and replacement rejects a captured gesture callback', async () => {
    await act(async () => {
      await interactive.beginBack();
    });
    const oldSetProgress = interactive.setProgress;
    const schedule = jest.spyOn(global, 'setTimeout');
    await act(async () => {
      interactive.cancel({ duration: 100 });
    });
    expect(schedule).not.toHaveBeenCalled();
    ctx.progressOwnership.setSession('B');
    ctx = {
      ...ctx,
      activeSession: { id: 'B' } as ChoreographyContextType['activeSession'],
    };
    await act(async () => tree.update(render()));
    ctx.progress.value = 0.65;
    oldSetProgress(0.9);
    expect(ctx.progress.value).toBe(0.65);
  });

  test('unmount during premeasurement does not create a session', async () => {
    let resolveMeasurement!: () => void;
    ctx.captureSourceGroup = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMeasurement = resolve;
        })
    );
    await act(async () => tree.update(render()));
    let preparation!: Promise<unknown>;
    await act(async () => {
      preparation = interactive.beginBack();
    });
    await act(async () => tree.unmount());
    await act(async () => {
      resolveMeasurement();
      await preparation;
    });
    expect(ctx.startTransition).not.toHaveBeenCalled();
  });

  test('a returned handle can update progress before React publishes new hook callbacks', async () => {
    const previousSetProgress = interactive.setProgress;
    await act(async () => {
      const handle = await interactive.beginBack();
      expect(handle).not.toBeNull();
      previousSetProgress(0.6);
      expect(ctx.progress.value).toBe(1);
      handle!.setProgress(0.6);
      expect(ctx.progress.value).toBeCloseTo(0.4);
    });
  });

  test('settlement consumes the handle and rejects duplicate or late commands', async () => {
    let handle!: InteractiveTransitionHandle;
    await act(async () => {
      handle = (await interactive.beginBack())!;
      handle.finish({ velocity: 0.8 });
      handle.cancel();
      handle.finish();
      handle.setProgress(0.9);
    });
    expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
    expect(ctx.progress.value).toBe(1);
  });

  test('a stale handle cannot cancel, finish, or update a replacement session', async () => {
    let handle!: InteractiveTransitionHandle;
    await act(async () => {
      handle = (await interactive.beginBack())!;
    });
    publishSession('B');
    await act(async () => tree.update(render()));
    const replacementToken = ctx.progressOwnership.version;
    ctx.progress.value = 0.65;
    await act(async () => {
      handle.setProgress(0.9);
      handle.cancel();
      handle.finish();
    });
    expect(ctx.progress.value).toBe(0.65);
    expect(ctx.progressOwnership.version).toBe(replacementToken);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
    expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
  });

  test('a pre-aborted request never acquires navigation ownership', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await interactive.beginBack({ signal: controller.signal })
    ).toBeNull();
    expect(ctx.captureSourceGroup).not.toHaveBeenCalled();
    expect(ctx.navigationController.isNavigationLocked()).toBe(false);
  });

  test.each(['measurement', 'session', 'overlay'] as const)(
    'abort during %s cancels only its preparation and releases its lock',
    async (stage) => {
      const controller = new AbortController();
      const gate = deferred<void>();
      if (stage === 'measurement') {
        ctx.captureSourceGroup = jest.fn(() => gate.promise);
      } else if (stage === 'session') {
        ctx.startTransition = jest.fn(async () => {
          const session = publishSession('A');
          await gate.promise;
          return session;
        });
      } else {
        ctx.waitForOverlayReady = jest.fn(async () => {
          await gate.promise;
          return true;
        });
      }
      await act(async () => tree.update(render()));
      let pending!: ReturnType<Interactive['beginBack']>;
      await act(async () => {
        pending = interactive.beginBack({ signal: controller.signal });
      });
      expect(ctx.navigationController.isNavigationLocked()).toBe(true);
      await act(async () => controller.abort());
      expect(ctx.navigationController.isNavigationLocked()).toBe(false);
      if (stage === 'measurement') {
        expect(ctx.cancelTransition).not.toHaveBeenCalled();
      } else {
        expect(ctx.cancelTransition).toHaveBeenCalledTimes(1);
        expect(ctx.cancelTransition).toHaveBeenCalledWith('A');
      }
      await act(async () => {
        gate.resolve();
        expect(await pending).toBeNull();
      });
      expect(ctx.progressOwnership.hasSession).toBe(false);
      expect(interactive.isActive).toBe(false);
      expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
    }
  );

  test('a cancelled old measurement cannot unlock or invalidate a newer preparation', async () => {
    const controller = new AbortController();
    const first = deferred<void>();
    const second = deferred<void>();
    ctx.captureSourceGroup = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await act(async () => tree.update(render()));
    let oldRequest!: ReturnType<Interactive['beginBack']>;
    let newRequest!: ReturnType<Interactive['beginBack']>;
    await act(async () => {
      oldRequest = interactive.beginBack({ signal: controller.signal });
      controller.abort();
      newRequest = interactive.beginBack();
    });
    const replacementToken = ctx.progressOwnership.version;
    await act(async () => {
      first.resolve();
      expect(await oldRequest).toBeNull();
    });
    expect(ctx.navigationController.isNavigationLocked()).toBe(true);
    expect(ctx.progressOwnership.version).toBe(replacementToken);
    expect(ctx.startTransition).not.toHaveBeenCalled();
    await act(async () => {
      second.resolve();
      expect(await newRequest).not.toBeNull();
    });
  });

  test('a cancelled late session result cannot cancel a newer gesture', async () => {
    const controller = new AbortController();
    const gate = deferred<void>();
    ctx.startTransition = jest
      .fn()
      .mockImplementationOnce(async () => {
        const session = publishSession('A');
        await gate.promise;
        return session;
      })
      .mockImplementationOnce(async () => publishSession('B'));
    await act(async () => tree.update(render()));
    let oldRequest!: ReturnType<Interactive['beginBack']>;
    let replacement!: InteractiveTransitionHandle;
    await act(async () => {
      oldRequest = interactive.beginBack({ signal: controller.signal });
    });
    await act(async () => {
      controller.abort();
      replacement = (await interactive.beginBack())!;
    });
    const replacementToken = ctx.progressOwnership.version;
    await act(async () => {
      gate.resolve();
      expect(await oldRequest).toBeNull();
      replacement.setProgress(0.7);
    });
    expect(replacement.id).toBe('B');
    expect(ctx.progress.value).toBeCloseTo(0.3);
    expect(ctx.progressOwnership.version).toBe(replacementToken);
    expect(ctx.navigationController.isNavigationLocked()).toBe(true);
    expect(ctx.cancelTransition).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).toHaveBeenCalledWith('A');
  });

  test('a stale handle cannot invalidate a newer request before it has a session', async () => {
    let handle!: InteractiveTransitionHandle;
    await act(async () => {
      handle = (await interactive.beginBack())!;
    });
    ctx.cancelTransition('A');
    await act(async () => tree.update(render()));
    const gate = deferred<void>();
    ctx.captureSourceGroup = jest.fn(() => gate.promise);
    ctx.startTransition = jest.fn(async () => publishSession('B'));
    await act(async () => tree.update(render()));
    let pending!: ReturnType<Interactive['beginBack']>;
    await act(async () => {
      pending = interactive.beginBack();
      handle.cancel();
      handle.finish();
    });
    expect(ctx.navigationController.isNavigationLocked()).toBe(true);
    await act(async () => {
      gate.resolve();
      expect((await pending)?.id).toBe('B');
    });
  });

  test.each(['session', 'overlay'] as const)(
    'rejection during %s cleans up its partially prepared session',
    async (stage) => {
      const error = new Error('native readiness failed');
      if (stage === 'session') {
        ctx.startTransition = jest.fn(async () => {
          publishSession('A');
          throw error;
        });
      } else {
        ctx.waitForOverlayReady = jest.fn(async () => {
          throw error;
        });
      }
      await act(async () => tree.update(render()));
      await act(async () => {
        await expect(interactive.beginBack()).rejects.toBe(error);
      });
      expect(ctx.cancelTransition).toHaveBeenCalledWith('A');
      expect(ctx.progressOwnership.hasSession).toBe(false);
      expect(ctx.navigationController.isNavigationLocked()).toBe(false);
      expect(interactive.isActive).toBe(false);
    }
  );

  test('abort listener is detached once preparation returns its handle', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    let handle!: InteractiveTransitionHandle;
    await act(async () => {
      handle = (await interactive.beginBack({ signal: controller.signal }))!;
      controller.abort();
      handle.setProgress(0.4);
    });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(ctx.progress.value).toBeCloseTo(0.6);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
    expect(interactive.isActive).toBe(true);
  });

  test('abort during overlay readiness does not cancel a provider-owned reverse commit', async () => {
    const controller = new AbortController();
    const gate = deferred<boolean>();
    ctx.waitForOverlayReady = jest.fn(() => gate.promise);
    await act(async () => tree.update(render()));
    let pending!: ReturnType<Interactive['beginBack']>;
    await act(async () => {
      pending = interactive.beginBack({ signal: controller.signal });
    });
    await act(async () => {
      interactive.finish();
      controller.abort();
      gate.resolve(true);
      expect(await pending).toBeNull();
    });
    expect(ctx.commitReverseTransition).toHaveBeenCalledTimes(1);
    expect(ctx.cancelTransition).not.toHaveBeenCalled();
    expect(ctx.navigationController.isNavigationLocked()).toBe(true);
  });
});
