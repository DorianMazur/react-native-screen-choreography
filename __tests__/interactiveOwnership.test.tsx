import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../src/core/ChoreographyContext';
import { ProgressOwnership } from '../src/core/ProgressOwnership';
import { NavigationSessionController } from '../src/core/NavigationSessionController';
import { ScreenIdContext } from '../src/core/screenIdContext';
import { useInteractiveTransitionNavigator } from '../src/hooks/useInteractiveTransition';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
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
    ctx = {
      progress,
      progressOwnership,
      navigationController: new NavigationSessionController(),
      activeSession: null,
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

  test.each(['finish', 'cancel'] as const)(
    '%s fallback cannot write into B before React publishes it',
    async (method) => {
      await act(async () => {
        await interactive.beginBack();
      });
      await act(async () => {
        interactive[method]({ duration: 100 });
      });
      ctx.progressOwnership.setSession('B');
      ctx.progress.value = 0.65;
      await act(async () => jest.advanceTimersByTime(200));
      expect(ctx.progress.value).toBe(0.65);
      expect(navigateBack).not.toHaveBeenCalled();
      expect(ctx.completeTransition).not.toHaveBeenCalled();
      expect(ctx.cancelTransition).not.toHaveBeenCalled();
    }
  );

  test('replacement clears the old timer and rejects a captured gesture callback', async () => {
    await act(async () => {
      await interactive.beginBack();
    });
    const oldSetProgress = interactive.setProgress;
    const schedule = jest.spyOn(global, 'setTimeout');
    const clear = jest.spyOn(global, 'clearTimeout');
    await act(async () => {
      interactive.finish({ duration: 100 });
    });
    const timerIndex = schedule.mock.calls.findIndex((call) => call[1] === 150);
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const timer = schedule.mock.results[timerIndex]!.value;
    ctx.progressOwnership.setSession('B');
    ctx = {
      ...ctx,
      activeSession: { id: 'B' } as ChoreographyContextType['activeSession'],
    };
    await act(async () => tree.update(render()));
    expect(clear).toHaveBeenCalledWith(timer);
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
