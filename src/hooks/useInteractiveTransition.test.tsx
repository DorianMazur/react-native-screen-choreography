import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ProgressOwnership } from '../core/ProgressOwnership';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ScreenIdContext } from '../core/screenIdContext';
import { useInteractiveTransitionNavigator } from './useInteractiveTransition';

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
      preMeasureGroup: jest.fn(async () => {}),
      startTransition: jest.fn(async () => {
        progressOwnership.setSession('A');
        return { id: 'A' };
      }),
      waitForOverlayReady: jest.fn(async () => true),
      completeTransition: jest.fn(),
      cancelTransition: jest.fn(),
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
    expect(ctx.preMeasureGroup).not.toHaveBeenCalled();
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
    ctx.preMeasureGroup = jest.fn(
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
});
