import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { withSpring } from 'react-native-reanimated';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ProgressOwnership } from '../core/ProgressOwnership';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { useChoreographyNavigator } from './useChoreographyNavigation';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(() => 0),
}));

test('navigation callers share one provider preparation lock', async () => {
  const progress = { value: 0 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  let releaseMeasurement!: () => void;
  const measurement = new Promise<void>((resolve) => {
    releaseMeasurement = resolve;
  });
  const preMeasureGroup = jest.fn(() => measurement);
  const ctx = {
    progress,
    progressOwnership,
    navigationController: new NavigationSessionController(),
    activeSession: null,
    pendingTargetScreenId: null,
    preMeasureGroup,
  } as unknown as ChoreographyContextType;
  const callers: Array<ReturnType<typeof useChoreographyNavigator>> = [];
  function Caller({ index }: { index: number }) {
    callers[index] = useChoreographyNavigator({
      currentScreenId: 'List',
      isFocused: true,
      goBack: jest.fn(),
    });
    return null;
  }
  let tree!: ReactTestRenderer;
  const pending: Promise<void>[] = [];
  try {
    await act(async () => {
      tree = create(
        <ChoreographyContext.Provider value={ctx}>
          <Caller index={0} />
          <Caller index={1} />
        </ChoreographyContext.Provider>
      );
    });
    await act(async () => {
      for (const caller of callers) {
        pending.push(
          caller.navigate({
            targetScreenId: 'Detail',
            dispatchNavigation: jest.fn(),
            options: { transitionConfig: { group: 'group' } },
          })
        );
      }
    });
    expect(preMeasureGroup).toHaveBeenCalledTimes(1);
  } finally {
    progressOwnership.invalidate();
    releaseMeasurement();
    await Promise.all(pending);
    await act(async () => tree?.unmount());
  }
});

test('queued replay survives focus changes and only its source instance dispatches it', async () => {
  const frames: Array<(timestamp: number) => void> = [];
  const raf = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const progress = { value: 0 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  const controller = new NavigationSessionController();
  const dispatchNavigation = jest.fn();
  const preMeasureGroup = jest.fn(async () => {});
  const request = {
    sourceScreenId: 'second-route',
    targetScreenId: 'Detail',
    dispatchNavigation,
    options: { transitionConfig: { group: 'group' } },
  };
  controller.queueNavigation(request);
  const ctx = {
    progress,
    progressOwnership,
    navigationController: controller,
    activeSession: null,
    pendingTargetScreenId: null,
    preMeasureGroup,
    setPendingTargetScreen: jest.fn(),
    waitForScreenReady: jest.fn(async () => false),
  } as unknown as ChoreographyContextType;
  function Caller({
    screenId,
    focused = true,
  }: {
    screenId: string;
    focused?: boolean;
  }) {
    useChoreographyNavigator({
      currentScreenId: screenId,
      isFocused: focused,
      goBack: () => {},
    });
    return null;
  }
  function render(focused = true) {
    return (
      <ChoreographyContext.Provider value={ctx}>
        <Caller screenId="first-route" />
        <Caller screenId="second-route" focused={focused} />
      </ChoreographyContext.Provider>
    );
  }
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(render());
    });
    await act(async () => tree.update(render(false)));
    await act(async () => tree.update(render()));
    while (frames.length) {
      const frameBatch = frames.splice(0);
      await act(async () => {
        frameBatch.forEach((frame) => frame(0));
      });
    }
    expect(dispatchNavigation).toHaveBeenCalledTimes(1);
    expect(preMeasureGroup).toHaveBeenCalledWith('group', 'second-route');
    expect(preMeasureGroup).toHaveBeenCalledTimes(1);
    expect(controller.peekQueuedNavigation()).toBeNull();
  } finally {
    await act(async () => tree?.unmount());
    raf.mockRestore();
  }
});

describe('Back preparation ownership', () => {
  test('Back from an unrelated route does not claim another route transition', async () => {
    const progress = { value: 0.5 } as ChoreographyContextType['progress'];
    const progressOwnership = new ProgressOwnership(
      { value: 0 } as ChoreographyContextType['progress'],
      progress
    );
    progressOwnership.setSession('session');
    const version = progressOwnership.version;
    const goBack = jest.fn();
    const ctx = {
      progress,
      progressOwnership,
      navigationController: new NavigationSessionController(),
      activeSession: {
        id: 'session',
        sourceScreenId: 'list',
        targetScreenId: 'detail',
        direction: 'forward',
      },
    } as unknown as ChoreographyContextType;
    let navigation!: ReturnType<typeof useChoreographyNavigator>;
    function Caller() {
      navigation = useChoreographyNavigator({
        currentScreenId: 'other-route',
        isFocused: true,
        goBack,
      });
      return null;
    }
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={ctx}>
            <Caller />
          </ChoreographyContext.Provider>
        );
      });
      await act(async () => navigation.goBack());
      expect(goBack).toHaveBeenCalledTimes(1);
      expect(progressOwnership.version).toBe(version);
      expect(progress.value).toBe(0.5);
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test.each(['frame', 'measurement', 'final frame'])(
    'replacement at %s cannot schedule or complete stale work',
    async (boundary) => {
      const frames: Array<(timestamp: number) => void> = [];
      const raf = jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      let resolveMetrics!: () => void;
      const progress = { value: 0.8 } as ChoreographyContextType['progress'];
      const progressOwnership = new ProgressOwnership(
        { value: 0 } as ChoreographyContextType['progress'],
        progress
      );
      progressOwnership.setSession('A');
      const navigateBack = jest.fn();
      const ctx = {
        progress,
        progressOwnership,
        navigationController: new NavigationSessionController(),
        activeSession: {
          id: 'A',
          direction: 'forward',
          sourceScreenId: 'List',
          targetScreenId: 'Detail',
        },
        getNavigationLineage: jest.fn(),
        refreshActiveSessionMetrics: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveMetrics = resolve;
            })
        ),
        completeTransition: jest.fn(),
        cancelTransition: jest.fn(),
      } as unknown as ChoreographyContextType;
      let navigation!: ReturnType<typeof useChoreographyNavigator>;
      function Harness() {
        navigation = useChoreographyNavigator({
          currentScreenId: 'Detail',
          isFocused: true,
          goBack: navigateBack,
        });
        return null;
      }
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={ctx}>
            <Harness />
          </ChoreographyContext.Provider>
        );
      });
      let pending!: Promise<void>;
      await act(async () => {
        pending = navigation.goBack();
      });
      expect(navigateBack).toHaveBeenCalledTimes(1);
      const replace = () => {
        progressOwnership.setSession('B');
        progress.value = 0.65;
      };
      if (boundary === 'frame') replace();
      await act(async () => {
        frames.shift()!(0);
      });
      if (boundary === 'measurement') replace();
      if (boundary !== 'frame')
        await act(async () => {
          resolveMetrics();
          await pending;
        });
      if (boundary === 'final frame') replace();
      await act(async () => {
        frames.splice(0).forEach((callback) => callback(0));
        await pending;
      });
      expect(progress.value).toBe(0.65);
      expect(withSpring).not.toHaveBeenCalled();
      expect(ctx.completeTransition).not.toHaveBeenCalled();
      expect(ctx.cancelTransition).not.toHaveBeenCalled();
      expect(navigateBack).toHaveBeenCalledTimes(1);
      await act(async () => tree.unmount());
      raf.mockRestore();
    }
  );
});
