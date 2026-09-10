import React, { useContext, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChoreographyProvider } from '../components/ChoreographyProvider';
import { SharedElement } from '../components/SharedElement';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ScreenIdContext, useScreenId } from '../core/screenIdContext';
import { ChoreographyScreen as NavigationScreen } from './react-navigation';
import { ChoreographyScreen as RouterScreen } from './expo-router';

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return {
    ...jest.requireActual('../../__mocks__/react-native-reanimated'),
    __esModule: true,
    useSharedValue: (value: number) => useRef({ value }).current,
    useAnimatedRef: () => useRef(() => {}).current,
    cancelAnimation: jest.fn(),
  };
});
jest.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-teleport', () => ({
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
  Portal: 'Portal',
  PortalHost: 'PortalHost',
}));
jest.mock(
  '../native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);
jest.mock('@react-navigation/native', () => {
  const ReactRuntime = jest.requireActual('react');
  const RouteContext = ReactRuntime.createContext(null);
  return {
    RouteContext,
    useRoute: () => ReactRuntime.useContext(RouteContext),
    useIsFocused: () => ReactRuntime.useContext(RouteContext).focused,
    useNavigation: () => ({}),
    usePreventRemove: jest.fn(),
  };
});
jest.mock('expo-router', () => jest.requireMock('@react-navigation/native'));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

const { RouteContext } = jest.requireMock('@react-navigation/native');

test('live owners and destinations are namespaced by route instance', async () => {
  const { Portal, PortalHost } = jest.requireMock('react-native-teleport');
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(
        <ChoreographyProvider>
          {['first', 'second'].map((instance) => (
            <React.Fragment key={instance}>
              <ScreenIdContext.Provider value={`owner-${instance}`}>
                <SharedElement id="player" groupId="group">
                  {null}
                </SharedElement>
              </ScreenIdContext.Provider>
              <ScreenIdContext.Provider value={`detail-${instance}`}>
                <SharedElement.Target id="player" groupId="group" />
              </ScreenIdContext.Provider>
            </React.Fragment>
          ))}
        </ChoreographyProvider>
      );
    });
    expect(
      new Set(tree.root.findAllByType(Portal).map((node) => node.props.name))
        .size
    ).toBe(2);
    expect(
      new Set(
        tree.root.findAllByType(PortalHost).map((node) => node.props.name)
      ).size
    ).toBe(2);
  } finally {
    await act(async () => tree?.unmount());
  }
});

test.each([
  ['React Navigation', NavigationScreen],
  ['Expo Router', RouterScreen],
] as const)(
  '%s isolates repeated screen instances',
  async (_adapter, Screen) => {
    jest.useFakeTimers();
    let tree: ReactTestRenderer | undefined;
    let context!: ChoreographyContextType;
    const registeredIds = new Set<string>();
    function Element({ pageX }: { pageX: number }) {
      context = useContext(ChoreographyContext)!;
      const actions = useContext(ChoreographyActionsContext)!;
      const screenId = useScreenId();
      useEffect(() => {
        registeredIds.add(screenId);
        actions.registerElement({
          id: 'card',
          groupId: 'group',
          screenId,
          metrics: { pageX, pageY: 0, width: 100, height: 100 },
          ref: () => ({
            measureInWindow: (callback: Function) =>
              callback(pageX, 0, 100, 100),
          }),
          getPresentation: () => ({
            content: null,
            transition: { renderer: () => null },
          }),
        });
        return () => actions.unregisterElement('card', screenId, 'group');
      }, [actions, pageX, screenId]);
      return null;
    }
    function render(includeSecond = true) {
      return (
        <ChoreographyProvider>
          <RouteContext.Provider
            value={{ key: 'detail-first', name: 'Detail', focused: true }}
          >
            <Screen screenId="Detail">
              <Element pageX={10} />
            </Screen>
          </RouteContext.Provider>
          {includeSecond && (
            <RouteContext.Provider
              value={{ key: 'detail-second', name: 'Detail', focused: true }}
            >
              <Screen screenId="Detail">
                <Element pageX={200} />
              </Screen>
            </RouteContext.Provider>
          )}
        </ChoreographyProvider>
      );
    }
    try {
      await act(async () => {
        tree = create(render());
      });
      expect([...registeredIds]).toEqual(['detail-first', 'detail-second']);
      expect(context.resolveScreenId('Detail')).toBeNull();
      expect(context.resolveScreenId('Detail', 'detail-first')).toBe(
        'detail-first'
      );
      expect(context.resolveScreenId('detail-second')).toBe('detail-second');
      context.setScreenReady('detail-first', true);
      context.setScreenReady('detail-second', false);
      expect(await context.waitForScreenReady('detail-first')).toBe(true);
      const waiting = context.waitForScreenReady('detail-second');
      await act(async () => {
        await jest.runAllTimersAsync();
      });
      expect(await waiting).toBe(false);

      context.setNavigationLineage({
        groupId: 'group',
        sourceScreenId: 'list-first',
        targetScreenId: 'detail-first',
      });
      context.setNavigationLineage({
        groupId: 'group',
        sourceScreenId: 'list-second',
        targetScreenId: 'detail-second',
      });
      expect(context.getNavigationLineage('detail-first')?.sourceScreenId).toBe(
        'list-first'
      );
      expect(
        context.getNavigationLineage('detail-second')?.sourceScreenId
      ).toBe('list-second');

      await act(async () =>
        context.setPendingTargetScreen('Detail', 'detail-first')
      );
      const screens = tree!.root
        .findAllByType(View)
        .filter((node) => node.props.onLayout);
      expect(
        screens.map((node) => StyleSheet.flatten(node.props.style).opacity)
      ).toEqual([1, 0]);
      await act(async () =>
        context.setPendingTargetScreen('detail-second', 'detail-first')
      );
      await act(async () => {
        const preparation = context.startTransition({
          groupId: 'group',
          sourceScreenId: 'detail-first',
          targetScreenId: 'detail-second',
          direction: 'forward',
        });
        await jest.runAllTimersAsync();
        await preparation;
      });
      const pair = context.activeSession?.pairs[0];
      expect(pair?.source.screenId).toBe('detail-first');
      expect(pair?.target.screenId).toBe('detail-second');
      expect(pair?.sourceMetrics.pageX).toBe(10);
      expect(pair?.targetMetrics.pageX).toBe(200);
      await act(async () => context.completeTransition());
      await act(async () => tree!.update(render(false)));
      expect(context.resolveScreenId('Detail')).toBe('detail-first');
      expect(context.getNavigationLineage('detail-second')).toBeNull();
      expect(context.getNavigationLineage('detail-first')?.sourceScreenId).toBe(
        'list-first'
      );
      expect(await context.waitForScreenReady('detail-first')).toBe(true);
    } finally {
      await act(async () => tree?.unmount());
      jest.useRealTimers();
    }
  }
);
