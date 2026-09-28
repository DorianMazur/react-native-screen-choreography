import { useEffect, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { runReverseTransition } from '../core/runReverseTransition';
import { ChoreographyScreen } from './expo-router';

jest.mock('expo-router', () => ({
  useNavigation: jest.fn(),
  useRoute: () => ({ key: 'detail', name: 'trips/[tripId]' }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-router/build/react-navigation/core/useNavigation', () =>
  jest.requireMock('expo-router')
);
jest.mock('expo-router/build/react-navigation/core/useRoute', () =>
  jest.requireMock('expo-router')
);
jest.mock(
  'expo-router/build/react-navigation/core/usePreventRemoveContext',
  () => ({
    usePreventRemoveContext: () => ({ setPreventRemove: mockSetPreventRemove }),
  })
);
jest.mock(
  'expo-router/build/react-navigation/core/NavigationBuilderContext',
  () => ({})
);
jest.mock(
  'expo-router/build/react-navigation/core/NavigationProvider',
  () => ({})
);
jest.mock('../components/ChoreographyScreenBase', () => ({
  ChoreographyScreenBase: () => null,
}));
jest.mock('../hooks/useChoreographyNavigation', () => ({}));
jest.mock('../hooks/useInteractiveTransition', () => ({}));
jest.mock('../core/runReverseTransition', () => ({
  runReverseTransition: jest.fn(),
}));

const { shouldPreventRemove } = jest.requireActual(
  'expo-router/build/react-navigation/core/useOnPreventRemove'
);
const mockSetPreventRemove = jest.fn();
const mockReverse = jest.mocked(runReverseTransition);

const mockPreventRemove = jest.requireMock(
  'expo-router/react-navigation'
).usePreventRemove;
let explicitPreventionEnabled = false;
const disablePrevention = jest.fn(() => {
  explicitPreventionEnabled = false;
});

function useExplicitPreventRemove(
  prevent: boolean,
  callback: (event: any) => void
) {
  const navigation = jest.requireMock('expo-router').useNavigation();
  useLayoutEffect(() => {
    explicitPreventionEnabled = prevent;
    return () => {
      explicitPreventionEnabled = false;
    };
  }, [prevent]);
  useEffect(
    () =>
      navigation.addListener('removePrevented', (event: any) => {
        if (prevent) callback({ data: event.data });
      }),
    [navigation, prevent, callback]
  );
  return disablePrevention;
}

const cases = [
  { api: 'marked', action: { type: 'GO_BACK' }, outcome: 'removed' },
  {
    api: 'marked',
    action: { type: 'POP', payload: { count: 1 } },
    outcome: 'removed',
  },
  { api: 'explicit', action: { type: 'GO_BACK' }, outcome: 'removed' },
  {
    api: 'explicit',
    action: { type: 'POP', payload: { count: 1 } },
    outcome: 'removed',
  },
  { api: 'explicit', action: { type: 'GO_BACK' }, outcome: 'blocked' },
  { api: 'explicit', action: { type: 'GO_BACK' }, outcome: 'throws' },
] as const;

test.each(cases)(
  'Expo removal contract ($api): delayed $action.type with $outcome replay',
  async ({ api, action, outcome }) => {
    jest.clearAllMocks();
    explicitPreventionEnabled = false;
    mockPreventRemove.mockImplementation(
      api === 'marked'
        ? jest.requireActual(
            'expo-router/build/react-navigation/core/usePreventRemove'
          ).usePreventRemove
        : useExplicitPreventRemove
    );
    let replayOutcome: string = outcome;
    const listeners = new Map<string, Set<(event: any) => void>>();
    const state = {
      key: 'stack',
      index: 1,
      routes: [
        { key: 'list', name: 'trips/index' },
        { key: 'detail', name: 'trips/[tripId]' },
      ],
    };
    const emit = jest.fn((event: any) => {
      const emitted = {
        ...event,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      listeners.get(event.type)?.forEach((listener) => listener(emitted));
      return emitted;
    });
    const navigation = {
      getState: () => state,
      addListener: (event: string, listener: (event: any) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
        return () => listeners.get(event)!.delete(listener);
      },
      dispatch: jest.fn((nextAction: typeof action) => {
        const nextRoutes = state.routes.slice(0, 1);
        if (api === 'explicit') {
          if (explicitPreventionEnabled) {
            emit({ type: 'removePrevented', data: { action: nextAction } });
            return;
          }
        } else if (
          shouldPreventRemove(
            { emit },
            {},
            state.routes,
            nextRoutes,
            nextAction
          )
        ) {
          return;
        }
        if (replayOutcome === 'blocked') return;
        if (replayOutcome === 'throws') throw new Error('Dispatch failed');
        state.routes = nextRoutes;
        state.index = 0;
        emit({ type: 'state', data: { state } });
      }),
    };
    jest.requireMock('expo-router').useNavigation.mockReturnValue(navigation);
    const context = {
      getNavigationLineage: () => ({
        groupId: 'trip.seiland',
        sourceScreenId: 'list',
        sourceRouteKey: 'list',
        targetScreenId: 'detail',
      }),
      navigationController: {
        getActiveSession: () => null,
        isNavigationLocked: () => false,
      },
      progressOwnership: { hasSession: false },
    } as unknown as ChoreographyContextType;
    let finishReverse!: () => void;
    mockReverse.mockImplementation(
      () => new Promise<void>((resolve) => (finishReverse = resolve))
    );
    let tree: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={context}>
            <ChoreographyScreen screenId="TripDetail">
              {null}
            </ChoreographyScreen>
          </ChoreographyContext.Provider>
        );
      });
      if (api === 'marked') {
        expect(mockSetPreventRemove).toHaveBeenLastCalledWith(
          expect.any(String),
          'detail',
          true
        );
      } else {
        expect(explicitPreventionEnabled).toBe(true);
      }
      navigation.dispatch(action);
      expect(state.routes).toHaveLength(2);
      expect(mockReverse).toHaveBeenCalledTimes(1);
      const reverse = mockReverse.mock.calls[0]![0];

      navigation.dispatch({ ...action });
      expect(mockReverse).toHaveBeenCalledTimes(1);
      expect(state.routes).toHaveLength(2);

      const interceptedAction = emit.mock.calls[0]![0].data.action;
      let result;
      await act(async () => {
        result = await reverse.popAction();
      });
      expect(navigation.dispatch).toHaveBeenLastCalledWith(interceptedAction);
      expect(navigation.dispatch.mock.calls[2]![0]).toBe(interceptedAction);
      expect(result).toEqual({
        removed: outcome === 'removed',
        presented: false,
      });
      expect(state.routes.map((route) => route.key)).toEqual(
        outcome === 'removed' ? ['list'] : ['list', 'detail']
      );
      expect(
        emit.mock.calls.filter(
          ([event]) =>
            event.type ===
            (api === 'marked' ? 'beforeRemove' : 'removePrevented')
        )
      ).toHaveLength(2);
      if (api === 'marked') {
        expect(mockSetPreventRemove).toHaveBeenCalledTimes(1);
        expect(disablePrevention).not.toHaveBeenCalled();
      } else {
        expect(disablePrevention).toHaveBeenCalledTimes(1);
        expect(explicitPreventionEnabled).toBe(true);
      }
      expect(listeners.get('state')?.size).toBe(0);
      await act(async () => finishReverse());
      if (outcome !== 'removed') {
        replayOutcome = 'removed';
        navigation.dispatch({ ...action });
        expect(mockReverse).toHaveBeenCalledTimes(2);
        expect(state.routes).toHaveLength(2);
        await act(async () => {
          expect(await mockReverse.mock.calls[1]![0].popAction()).toEqual({
            removed: true,
            presented: false,
          });
          finishReverse();
        });
        expect(state.routes.map((route) => route.key)).toEqual(['list']);
      }
    } finally {
      await act(async () => tree?.unmount());
    }
  }
);
