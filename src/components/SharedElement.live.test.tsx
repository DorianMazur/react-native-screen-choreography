import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type {
  ElementTransitionPair,
  Transition,
  RegisteredElement,
  TransitionSessionData,
} from '../types';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  ChoreographyControlsContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ScreenIdContext } from '../core/screenIdContext';
import { makeTransition } from '../transitions/makeTransition';
import { SharedElement } from './SharedElement';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';
import { useChoreographyProgress } from '../hooks/useChoreographyProgress';
import type { ScreenAnimationLifetime } from '../hooks/useScreenAnimationLifetime';
import {
  useSharedElementPresentation,
  type SharedElementPresentation,
} from '../core/SharedElementPresentation';

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return {
    ...jest.requireActual('../../__mocks__/react-native-reanimated'),
    __esModule: true,
    useAnimatedRef: () => useRef(() => {}).current,
  };
});
jest.mock('react-native-teleport', () => ({
  Portal: 'Portal',
  PortalHost: 'PortalHost',
}));

const { Portal, PortalHost } = jest.requireMock('react-native-teleport') as {
  Portal: React.ElementType;
  PortalHost: React.ElementType;
};
const AnimatedView = 'Animated.View' as React.ElementType;

const noopTransition = makeTransition({ renderer: () => null });

function session(
  sourceScreenId: string,
  targetScreenId: string,
  direction: TransitionSessionData['direction'] = 'forward'
): TransitionSessionData {
  const endpoint = (screenId: string) =>
    ({ screenId, groupId: 'media' }) as RegisteredElement;
  return {
    id: `${sourceScreenId}->${targetScreenId}`,
    groupId: 'media',
    sourceScreenId,
    targetScreenId,
    state: 'active',
    direction,
    progress: {
      value: direction === 'forward' ? 0 : 1,
    } as TransitionSessionData['progress'],
    pairs: [
      {
        id: 'player',
        transition: noopTransition,
        source: endpoint(sourceScreenId),
        target: endpoint(targetScreenId),
        sourceMetrics: {
          pageX: 0,
          pageY: 0,
          width: direction === 'forward' ? 100 : 300,
          height: direction === 'forward' ? 50 : 200,
        },
        targetMetrics: {
          pageX: 0,
          pageY: 0,
          width: direction === 'forward' ? 300 : 100,
          height: direction === 'forward' ? 200 : 50,
        },
        sourcePresentation: { transition: noopTransition },
        targetPresentation: { transition: noopTransition },
      } as ElementTransitionPair,
    ],
  };
}

function makeContexts() {
  let settledScreenId: string | null = null;
  const registered: RegisteredElement[] = [];
  const actions = {
    registerElement: jest.fn((element: RegisteredElement) => {
      registered.push(element);
    }),
    unregisterElement: jest.fn(),
    isElementHidden: jest.fn(() => ({ value: 0 })),
    getSettledScreenId: jest.fn(() => settledScreenId),
  } as unknown as ChoreographyActionsType;
  return {
    actions,
    registered,
    settle(screenId: string) {
      settledScreenId = screenId;
    },
  };
}

function choreography(
  activeSession: TransitionSessionData | null
): ChoreographyContextType {
  return { activeSession, progress: { value: 0 } } as ChoreographyContextType;
}

describe('SharedElement live endpoints', () => {
  test('retained presentation keeps animating after its departing screen companions suspend', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    const state = makeContexts();
    const active = session('detail', 'list', 'backward');
    const context = choreography(active);
    context.progress.value = 0.25;
    let lifetime!: ScreenAnimationLifetime;
    state.actions.registerScreenPresentation = (_id, _ref, registered) => {
      lifetime = registered!;
      return () => {};
    };
    let presentation!: SharedElementPresentation;
    let companion!: ReturnType<typeof useChoreographyProgress>;
    function Content() {
      presentation = useSharedElementPresentation();
      return null;
    }
    function Companion() {
      companion = useChoreographyProgress();
      return null;
    }
    const frames: ((time: number) => void)[] = [];
    const frameMock = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyActionsContext.Provider value={state.actions}>
            <ChoreographyContext.Provider value={context}>
              <ChoreographyControlsContext.Provider
                value={{
                  progress: context.progress,
                  settleTransition: jest.fn(),
                }}
              >
                <ChoreographyScreenBase screenId="detail">
                  <Companion />
                  <SharedElement id="player" groupId="media">
                    <Content />
                  </SharedElement>
                </ChoreographyScreenBase>
              </ChoreographyControlsContext.Provider>
            </ChoreographyContext.Provider>
          </ChoreographyActionsContext.Provider>
        );
      });
      expect(presentation.progress).toBe(context.progress);
      expect(presentation.presentationProgress.value).toBe(0.25);
      const barrier = lifetime.suspend(1);
      while (frames.length) frames.shift()!(0);
      await barrier;
      context.progress.value = 0.1;
      expect(companion.progress.value).toBe(0.25);
      expect(presentation.progress.value).toBe(0.1);
      expect(presentation.presentationProgress.value).toBe(0.1);
      context.progress.value = 0;
      expect(companion.progress.value).toBe(0.25);
      expect(presentation.presentationProgress.value).toBe(0);
    } finally {
      frameMock.mockRestore();
      await act(async () => tree?.unmount());
      Platform.OS = originalOS;
    }
  });

  test.each([20, 100, 300])(
    'only propagates presentation updates to the participating owner among %i owners',
    async (count) => {
      const state = makeContexts();
      const progress = { value: 0 } as ChoreographyContextType['progress'];
      const renders = Array.from({ length: count }, () => jest.fn());
      const presentations: SharedElementPresentation[] = [];
      function Content({ index }: { index: number }) {
        presentations[index] = useSharedElementPresentation();
        renders[index]!();
        return null;
      }
      const owners = Array.from({ length: count }, (_, index) => (
        <SharedElement key={index} id="player" groupId={`group-${index}`}>
          <Content index={index} />
        </SharedElement>
      ));
      let tree!: ReactTestRenderer;
      const render = (
        activeSession: TransitionSessionData | null,
        pendingTargetScreenId: string | null = null
      ) => (
        <ChoreographyActionsContext.Provider value={state.actions}>
          <ChoreographyContext.Provider
            value={{
              ...choreography(activeSession),
              progress,
              pendingTargetScreenId,
            }}
          >
            <ScreenIdContext.Provider value="list">
              {owners}
            </ScreenIdContext.Provider>
          </ChoreographyContext.Provider>
        </ChoreographyActionsContext.Provider>
      );
      const active = { ...session('list', 'detail'), groupId: 'group-0' };
      try {
        await act(async () => {
          tree = create(render(null));
        });
        const initial = presentations.slice();
        await act(async () => tree.update(render(null, 'detail')));
        await act(async () =>
          tree.update(render({ ...active, state: 'measuring' }, 'detail'))
        );
        await act(async () =>
          tree.update(render({ ...active, state: 'preparing' }, 'detail'))
        );
        expect(presentations).toEqual(initial);
        renders.forEach((renderCount) =>
          expect(renderCount).toHaveBeenCalledTimes(1)
        );

        await act(async () => tree.update(render(active, 'detail')));
        expect(renders[0]).toHaveBeenCalledTimes(2);
        const participating = presentations[0];
        // Pending cleanup and cloned session envelopes do not change the pair.
        await act(async () => tree.update(render({ ...active })));
        expect(presentations[0]).toBe(participating);
        expect(renders[0]).toHaveBeenCalledTimes(2);

        const updated = {
          ...active,
          pairs: active.pairs.map((pair) => ({
            ...pair,
            targetMetrics: { ...pair.targetMetrics, width: 350 },
          })),
        };
        await act(async () => tree.update(render(updated)));
        expect(presentations[0]!.expanded.metrics!.width).toBe(350);
        expect(renders[0]).toHaveBeenCalledTimes(3);
        state.settle('detail');
        await act(async () => tree.update(render(null)));
        expect(presentations[0]!.settled).toBe('expanded');
        expect(renders[0]).toHaveBeenCalledTimes(4);
        expect(tree.root.findAllByType(Portal)[0]!.props.hostName).toContain(
          'destination:'
        );

        // Matching element/group identifiers on other screens stay isolated.
        await act(async () =>
          tree.update(
            render({
              ...session('other-list', 'other-detail'),
              groupId: 'group-1',
            })
          )
        );
        // Another element in the owner's group does not activate it either.
        await act(async () =>
          tree.update(
            render({
              ...active,
              pairs: active.pairs.map((pair) => ({ ...pair, id: 'other' })),
            })
          )
        );
        expect(renders[0]).toHaveBeenCalledTimes(4);
        for (let index = 1; index < count; index++) {
          expect(renders[index]).toHaveBeenCalledTimes(1);
          expect(presentations[index]).toBe(initial[index]);
        }
        expect(state.actions.registerElement).toHaveBeenCalledTimes(count);
        expect(state.actions.unregisterElement).not.toHaveBeenCalled();
      } finally {
        await act(async () => tree?.unmount());
      }
    }
  );

  test('retains owner progress across settlement, cancellation, and unrelated sessions', async () => {
    const state = makeContexts();
    const progress = { value: 0 } as ChoreographyContextType['progress'];
    let presentation!: SharedElementPresentation;
    let tree!: ReactTestRenderer;
    function Content() {
      presentation = useSharedElementPresentation();
      return null;
    }
    const render = (activeSession: TransitionSessionData | null) => (
      <ChoreographyActionsContext.Provider value={state.actions}>
        <ChoreographyContext.Provider
          value={{ ...choreography(activeSession), progress }}
        >
          <ScreenIdContext.Provider value="list">
            <SharedElement id="player" groupId="media">
              <Content />
            </SharedElement>
          </ScreenIdContext.Provider>
        </ChoreographyContext.Provider>
      </ChoreographyActionsContext.Provider>
    );
    const update = async (active: TransitionSessionData | null) => {
      await act(async () => tree.update(render(active)));
      // Compatibility: consumers still receive the exact provider clock.
      expect(presentation.progress).toBe(progress);
    };
    const expectProgress = (value: number) =>
      expect(presentation.presentationProgress.value).toBe(value);
    const unrelated = {
      ...session('list', 'other-detail'),
      groupId: 'other',
    };

    try {
      await act(async () => {
        tree = create(render(null));
      });
      expectProgress(0);
      expect(presentation.direction).toBeNull();
      await update(unrelated);
      expect(presentation.direction).toBeNull();
      progress.value = 0.6;
      expectProgress(0);

      await update(session('list', 'detail'));
      expect(presentation.direction).toBe('forward');
      for (const value of [0, 0.4, 1]) {
        progress.value = value;
        expectProgress(value);
      }
      state.settle('detail');
      await update(null);
      expectProgress(1);
      expect(presentation.direction).toBeNull();
      await update(unrelated);
      progress.value = 0.2;
      expectProgress(1);
      state.settle('other-detail');
      await update(null);
      expectProgress(1);

      // A different element in the same group must not drive this owner.
      await update({
        ...session('list', 'detail'),
        pairs: session('list', 'detail').pairs.map((pair) => ({
          ...pair,
          id: 'other-player',
        })),
      });
      progress.value = 0.7;
      expectProgress(1);

      await update(session('detail', 'list', 'backward'));
      expect(presentation.direction).toBe('backward');
      progress.value = 0.3;
      expectProgress(0.3);
      // Cancel back: retained content stays expanded.
      state.settle('detail');
      await update(null);
      expectProgress(1);

      await update(session('detail', 'list', 'backward'));
      progress.value = 0;
      state.settle('list');
      await update(null);
      expectProgress(0);

      await update(session('list', 'detail'));
      progress.value = 0.6;
      // Rapid reversal continues to follow the same expansion clock.
      await update(session('detail', 'list', 'backward'));
      expectProgress(0.6);
      state.settle('list');
      await update(null);
      expectProgress(0);

      await update(session('list', 'detail'));
      progress.value = 0.4;
      // Cancel forward: retained content returns to collapsed.
      state.settle('list');
      await update(null);
      expectProgress(0);
      expect(state.actions.registerElement).toHaveBeenCalledTimes(1);
      expect(state.actions.unregisterElement).not.toHaveBeenCalled();
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test('uses the default transition and applies endpoint portal and host styles', async () => {
    const state = makeContexts();
    let tree!: ReactTestRenderer;

    try {
      await act(async () => {
        tree = create(
          <ChoreographyActionsContext.Provider value={state.actions}>
            <ChoreographyContext.Provider value={choreography(null)}>
              <ScreenIdContext.Provider value="list-instance">
                <SharedElement
                  id="player"
                  groupId="media"
                  style={{ width: 240, height: 160 }}
                  portalStyle={{
                    flex: 0,
                    width: 320,
                    height: 200,
                    backgroundColor: 'red',
                  }}
                >
                  <View testID="player-content" />
                </SharedElement>
              </ScreenIdContext.Provider>
              <ScreenIdContext.Provider value="detail-instance">
                <SharedElement.Target
                  id="player"
                  groupId="media"
                  style={{ width: 1, height: 1 }}
                  hostStyle={{
                    width: 280,
                    height: 180,
                    backgroundColor: 'blue',
                  }}
                />
              </ScreenIdContext.Provider>
            </ChoreographyContext.Provider>
          </ChoreographyActionsContext.Provider>
        );
      });

      expect(state.registered).toHaveLength(2);
      for (const element of state.registered) {
        expect(element.getPresentation().transition).toMatchObject({
          zIndex: 100,
        });
      }
      expect(
        StyleSheet.flatten(tree.root.findByType(Portal).props.style)
      ).toMatchObject({
        flex: 0,
        width: 320,
        height: 200,
        backgroundColor: 'red',
      });
      const host = tree.root.findByType(PortalHost);
      expect(host.props.name).toBe(
        'screen-choreography:live:destination:["detail-instance","media","player"]'
      );
      expect(StyleSheet.flatten(host.props.style)).toMatchObject({
        position: 'absolute',
        top: 0,
        width: 280,
        height: 180,
        backgroundColor: 'blue',
      });
      const wrappers = tree.root.findAllByType(AnimatedView);
      expect(StyleSheet.flatten(wrappers[0]!.props.style)).toMatchObject({
        width: 240,
        height: 160,
      });
      expect(StyleSheet.flatten(wrappers[1]!.props.style)).toMatchObject({
        width: 1,
        height: 1,
      });
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test.each([
    [{ backgroundColor: 'red' }, { width: 100, height: 50 }],
    [
      { width: '100%', height: 80 },
      { width: '100%', height: 80 },
    ],
    [{ flex: 1 }, { width: 100, flex: 1 }],
  ] as [ViewStyle, ViewStyle][])(
    'reserves intrinsic owner space without changing presentation %j',
    async (style, reserved) => {
      const state = makeContexts();
      let tree!: ReactTestRenderer;
      const render = (active: TransitionSessionData | null) => (
        <ChoreographyActionsContext.Provider value={state.actions}>
          <ChoreographyContext.Provider value={choreography(active)}>
            <ScreenIdContext.Provider value="list">
              <SharedElement id="player" groupId="media" style={style}>
                <View />
              </SharedElement>
            </ScreenIdContext.Provider>
          </ChoreographyContext.Provider>
        </ChoreographyActionsContext.Provider>
      );
      const layout = () =>
        StyleSheet.flatten(tree.root.findByType(AnimatedView).props.style);
      try {
        await act(async () => {
          tree = create(render(null));
        });
        expect(layout()).toEqual(style);
        await act(async () => tree.update(render(session('list', 'detail'))));
        expect(layout()).toEqual({ ...style, ...reserved });
        expect(state.registered[0]!.getPresentation().style).toEqual(style);
        state.settle('detail');
        await act(async () => tree.update(render(null)));
        expect(layout()).toEqual({ ...style, ...reserved });
        await act(async () =>
          tree.update(render(session('detail', 'list', 'backward')))
        );
        state.settle('list');
        await act(async () => tree.update(render(null)));
        expect(layout()).toEqual(style);
        expect(state.actions.registerElement).toHaveBeenCalledTimes(1);
        expect(state.actions.unregisterElement).not.toHaveBeenCalled();
      } finally {
        await act(async () => tree?.unmount());
      }
    }
  );

  test('keeps registration stable while renderer and metadata snapshots advance', async () => {
    const state = makeContexts();
    const firstTransition = makeTransition({ renderer: () => null });
    const secondRenderer = () => null;
    const secondTransition = makeTransition({
      renderer: secondRenderer,
      zIndex: 222,
    });
    let tree!: ReactTestRenderer;
    const render = (transition: Transition, version: number) => (
      <ChoreographyActionsContext.Provider value={state.actions}>
        <ChoreographyContext.Provider value={choreography(null)}>
          <ScreenIdContext.Provider value="list">
            <SharedElement
              id="player"
              groupId="media"
              transition={transition}
              metadata={{ version }}
            >
              <View testID={`content-${version}`} />
            </SharedElement>
          </ScreenIdContext.Provider>
        </ChoreographyContext.Provider>
      </ChoreographyActionsContext.Provider>
    );

    try {
      await act(async () => {
        tree = create(render(firstTransition, 1));
      });
      const registration = state.registered[0]!;
      const initialGetPresentation = registration.getPresentation;
      expect(registration.getPresentation()).toMatchObject({
        transition: firstTransition,
        metadata: { version: 1 },
      });

      await act(async () => {
        tree.update(render(secondTransition, 2));
      });

      expect(state.actions.registerElement).toHaveBeenCalledTimes(1);
      expect(state.actions.unregisterElement).not.toHaveBeenCalled();
      expect(registration.getPresentation).toBe(initialGetPresentation);
      expect(registration.getPresentation()).toMatchObject({
        transition: secondTransition,
        metadata: { version: 2 },
      });
      expect(registration.getPresentation().transition.renderer).toBe(
        secondTransition.renderer
      );
      expect(tree.root.findByProps({ testID: 'content-2' })).toBeDefined();
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test('routes forward, backward, cancelled, rapid, and repeated sessions without stale hosts', async () => {
    const state = makeContexts();
    let tree!: ReactTestRenderer;
    const render = (activeSession: TransitionSessionData | null) => (
      <ChoreographyActionsContext.Provider value={state.actions}>
        <ChoreographyContext.Provider value={choreography(activeSession)}>
          <ScreenIdContext.Provider value="list">
            <SharedElement
              id="player"
              groupId="media"
              transition={noopTransition}
            >
              <View />
            </SharedElement>
          </ScreenIdContext.Provider>
        </ChoreographyContext.Provider>
      </ChoreographyActionsContext.Provider>
    );
    const hostName = () => tree.root.findByType(Portal).props.hostName;

    try {
      await act(async () => {
        tree = create(render(null));
      });
      expect(hostName()).toBeUndefined();

      await act(async () => tree.update(render(session('list', 'detail'))));
      expect(hostName()).toBe(
        'screen-choreography:live:overlay:["list","detail","media","player"]'
      );

      // A rapid reversal must immediately use its own pair host.
      await act(async () =>
        tree.update(render(session('detail', 'list', 'backward')))
      );
      expect(hostName()).toBe(
        'screen-choreography:live:overlay:["detail","list","media","player"]'
      );
      state.settle('list');
      await act(async () => tree.update(render(null)));
      expect(hostName()).toBeUndefined();

      // Repeated forward settlement reparents to the named target host.
      await act(async () => tree.update(render(session('list', 'detail'))));
      state.settle('detail');
      await act(async () => tree.update(render(null)));
      expect(hostName()).toBe(
        'screen-choreography:live:destination:["detail","media","player"]'
      );

      // Backward cancellation stays on detail, its source screen.
      await act(async () =>
        tree.update(render(session('detail', 'list', 'backward')))
      );
      state.settle('detail');
      await act(async () => tree.update(render(null)));
      expect(hostName()).toBe(
        'screen-choreography:live:destination:["detail","media","player"]'
      );

      // Backward completion returns ownership to the original portal.
      await act(async () =>
        tree.update(render(session('detail', 'list', 'backward')))
      );
      state.settle('list');
      await act(async () => tree.update(render(null)));
      expect(hostName()).toBeUndefined();

      // Forward cancellation settles on the source and also restores it.
      await act(async () => tree.update(render(session('list', 'detail'))));
      state.settle('list');
      await act(async () => tree.update(render(null)));
      expect(hostName()).toBeUndefined();
      expect(state.actions.registerElement).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => tree?.unmount());
    }
  });
});
