import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ProgressOwnership } from '../core/ProgressOwnership';
import { ReverseTransitionController } from '../core/ReverseTransitionController';
import type { TransitionSessionData } from '../types';
import { useChoreographyNavigator } from './useChoreographyNavigation';

test('retained core commands use the current source, preparation callback and back binding', async () => {
  const progress = { value: 0 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  const captureFirst = jest.fn(async () => {});
  const captureCurrent = jest.fn(async () => {});
  const backFirst = jest.fn();
  const backCurrent = jest.fn();
  const context = {
    progress,
    progressOwnership,
    navigationController: new NavigationSessionController(),
    activeSession: null,
    pendingTargetScreenId: null,
    captureSourceGroup: captureFirst,
    setPendingTargetScreen: jest.fn(),
    waitForScreenReady: jest.fn(async () => false),
  } as unknown as ChoreographyContextType;
  let commands!: ReturnType<typeof useChoreographyNavigator>;
  function Caller({ screenId, back }: { screenId: string; back: () => void }) {
    commands = useChoreographyNavigator({
      currentScreenId: screenId,
      isFocused: true,
      goBack: back,
    });
    return null;
  }
  let tree: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      tree = create(
        <ChoreographyContext.Provider value={context}>
          <Caller screenId="source-first" back={backFirst} />
        </ChoreographyContext.Provider>
      );
    });
    const retained = commands;
    await act(async () => {
      tree!.update(
        <ChoreographyContext.Provider
          value={{ ...context, captureSourceGroup: captureCurrent }}
        >
          <Caller screenId="source-current" back={backCurrent} />
        </ChoreographyContext.Provider>
      );
    });

    expect(commands).toBe(retained);
    const dispatchNavigation = jest.fn();
    await act(async () => {
      await expect(
        retained.navigate({
          targetScreenId: 'Detail',
          dispatchNavigation,
          options: { transitionConfig: { group: 'cards' } },
        })
      ).resolves.toBeUndefined();
      await expect(retained.goBack()).resolves.toBeUndefined();
    });
    expect(captureFirst).not.toHaveBeenCalled();
    expect(captureCurrent).toHaveBeenCalledWith('cards', 'source-current');
    expect(dispatchNavigation).toHaveBeenCalledTimes(1);
    expect(backFirst).not.toHaveBeenCalled();
    expect(backCurrent).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => tree?.unmount());
  }
});

test.each(['focus', 'pending target', 'active session'] as const)(
  'a retained navigate observes a newly committed %s gate',
  async (gate) => {
    const progress = { value: 0 } as ChoreographyContextType['progress'];
    const context = {
      progress,
      progressOwnership: new ProgressOwnership(
        { value: 0 } as typeof progress,
        progress
      ),
      navigationController: new NavigationSessionController(),
      reverseController: new ReverseTransitionController(),
      activeSession: null,
      pendingTargetScreenId: null,
      captureSourceGroup: jest.fn(async () => {}),
      setPendingTargetScreen: jest.fn(),
      waitForScreenReady: jest.fn(async () => false),
    } as unknown as ChoreographyContextType;
    let commands!: ReturnType<typeof useChoreographyNavigator>;
    function Caller({ focused }: { focused: boolean }) {
      commands = useChoreographyNavigator({
        currentScreenId: 'source',
        isFocused: focused,
        goBack: jest.fn(),
      });
      return null;
    }
    let tree: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={context}>
            <Caller focused />
          </ChoreographyContext.Provider>
        );
      });
      const retained = commands.navigate;
      const session: TransitionSessionData = {
        id: 'other-session',
        sourceScreenId: 'other-source',
        targetScreenId: 'other-target',
        groupId: 'other-group',
        direction: 'forward',
        state: 'active',
        pairs: [],
        progress,
      };
      const next = {
        ...context,
        pendingTargetScreenId: gate === 'pending target' ? 'pending' : null,
        activeSession: gate === 'active session' ? session : null,
      };
      context.navigationController.setActiveSession(next.activeSession);
      await act(async () =>
        tree!.update(
          <ChoreographyContext.Provider value={next}>
            <Caller focused={gate !== 'focus'} />
          </ChoreographyContext.Provider>
        )
      );
      const request = {
        targetScreenId: 'Detail',
        dispatchNavigation: jest.fn(),
        options: { transitionConfig: { group: 'cards' } },
      };
      await act(async () => retained(request));
      expect(request.dispatchNavigation).not.toHaveBeenCalled();
      expect(context.captureSourceGroup).not.toHaveBeenCalled();
      expect(context.navigationController.peekQueuedNavigation()).toEqual({
        ...request,
        sourceScreenId: 'source',
      });
    } finally {
      await act(async () => tree?.unmount());
    }
  }
);

test('a retained Back reverses the current opening and uses plain Back after settlement', async () => {
  const progress = { value: 0.6 } as ChoreographyContextType['progress'];
  const ownership = new ProgressOwnership(
    { value: 0 } as typeof progress,
    progress
  );
  const context = {
    progress,
    progressOwnership: ownership,
    navigationController: new NavigationSessionController(),
    reverseController: new ReverseTransitionController(),
    activeSession: null,
    pendingTargetScreenId: null,
    getNavigationLineage: jest.fn(() => null),
    refreshActiveSessionMetrics: jest.fn(async () => {}),
    commitReverseTransition: jest.fn(async () => {}),
  } as unknown as ChoreographyContextType;
  const back = jest.fn();
  let commands!: ReturnType<typeof useChoreographyNavigator>;
  function Caller() {
    commands = useChoreographyNavigator({
      currentScreenId: 'detail',
      isFocused: true,
      goBack: back,
    });
    return null;
  }
  const frame = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  let tree: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      tree = create(
        <ChoreographyContext.Provider value={context}>
          <Caller />
        </ChoreographyContext.Provider>
      );
    });
    const retained = commands.goBack;
    const session: TransitionSessionData = {
      id: 'opening',
      sourceScreenId: 'source',
      targetScreenId: 'detail',
      groupId: 'cards',
      direction: 'forward',
      state: 'active',
      pairs: [],
      progress,
    };
    ownership.setSession(session.id);
    context.navigationController.setActiveSession(session);
    await act(async () =>
      tree!.update(
        <ChoreographyContext.Provider
          value={{ ...context, activeSession: session }}
        >
          <Caller />
        </ChoreographyContext.Provider>
      )
    );
    const options = { spring: { stiffness: 250, damping: 32 }, duration: 300 };
    await act(async () => retained(options));
    expect(back).not.toHaveBeenCalled();
    expect(context.refreshActiveSessionMetrics).toHaveBeenCalledWith('source');
    expect(context.commitReverseTransition).toHaveBeenCalledWith({
      sessionId: 'opening',
      token: expect.any(Number),
      navigateBack: back,
      options,
    });
    ownership.setSession(null);
    context.navigationController.setActiveSession(null);
    await act(async () =>
      tree!.update(
        <ChoreographyContext.Provider value={context}>
          <Caller />
        </ChoreographyContext.Provider>
      )
    );
    await act(async () => retained());
    expect(back).toHaveBeenCalledTimes(1);
    expect(context.commitReverseTransition).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => tree?.unmount());
    frame.mockRestore();
  }
});
