import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type {
  ElementTransitionPair,
  LiveTransition,
  RegisteredElement,
  TransitionSessionData,
} from '../types';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ScreenIdContext } from '../core/screenIdContext';
import { makeLiveTransition } from '../transitions/makeLiveTransition';
import { SharedElement } from './SharedElement';

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

const noopTransition = makeLiveTransition({ renderer: () => null });

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
        source: endpoint(sourceScreenId),
        target: endpoint(targetScreenId),
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
  return { activeSession } as ChoreographyContextType;
}

describe('SharedElement live endpoints', () => {
  test('uses the default transition and applies endpoint portal and host styles', async () => {
    const state = makeContexts();
    let tree!: ReactTestRenderer;

    try {
      await act(async () => {
        tree = create(
          <ChoreographyActionsContext.Provider value={state.actions}>
            <ChoreographyContext.Provider value={choreography(null)}>
              <ScreenIdContext.Provider value="list-instance">
                <SharedElement.Live
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
                </SharedElement.Live>
              </ScreenIdContext.Provider>
              <ScreenIdContext.Provider value="detail-instance">
                <SharedElement.LiveTarget
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
          mode: 'live',
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

  test('keeps registration stable while renderer and metadata snapshots advance', async () => {
    const state = makeContexts();
    const firstTransition = makeLiveTransition({ renderer: () => null });
    const secondRenderer = () => null;
    const secondTransition = makeLiveTransition({
      renderer: secondRenderer,
      zIndex: 222,
    });
    let tree!: ReactTestRenderer;
    const render = (transition: LiveTransition, version: number) => (
      <ChoreographyActionsContext.Provider value={state.actions}>
        <ChoreographyContext.Provider value={choreography(null)}>
          <ScreenIdContext.Provider value="list">
            <SharedElement.Live
              id="player"
              groupId="media"
              transition={transition}
              metadata={{ version }}
            >
              <View testID={`content-${version}`} />
            </SharedElement.Live>
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
            <SharedElement.Live
              id="player"
              groupId="media"
              transition={noopTransition}
            >
              <View />
            </SharedElement.Live>
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
