import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { useChoreographyNavigation } from './react-navigation';
import { useChoreographyRouter } from './expo-router';

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ key: 'list' }),
  useIsFocused: () => true,
  useNavigation: () => ({}),
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-router', () => jest.requireMock('@react-navigation/native'));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

test.each(['react-navigation', 'expo-push', 'expo-navigate'] as const)(
  '%s forwards per-request observers without changing the returned promise',
  async (adapter) => {
    const dispatch = jest.fn();
    const listener = jest.fn();
    const router = { push: dispatch, navigate: dispatch, back: jest.fn() };
    const context = {
      navigationController: new NavigationSessionController(),
      activeSession: null,
      pendingTargetScreenId: null,
    } as unknown as ChoreographyContextType;
    let navigate!: () => Promise<void>;
    function Caller() {
      const navigation = useChoreographyNavigation(router);
      const expo = useChoreographyRouter(router, 'List');
      navigate = () =>
        adapter === 'react-navigation'
          ? navigation.navigate(
              'Detail',
              { id: '42' },
              { onNavigationEvent: listener }
            )
          : expo[adapter === 'expo-push' ? 'push' : 'navigate']({
              href: '/detail/42',
              targetScreenId: 'Detail',
              onNavigationEvent: listener,
            });
      return null;
    }
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={context}>
            <Caller />
          </ChoreographyContext.Provider>
        );
      });
      await act(async () => {
        expect(await navigate()).toBeUndefined();
      });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls.map(([event]) => event.status)).toEqual([
        'started',
        'fallback',
      ]);
      expect(listener.mock.calls[1]![0]).toMatchObject({
        requestId: listener.mock.calls[0]![0].requestId,
        sourceScreenId: 'list',
        targetScreenId: 'Detail',
        finished: true,
        reason: 'no-transition',
      });
    } finally {
      await act(async () => tree?.unmount());
    }
  }
);
