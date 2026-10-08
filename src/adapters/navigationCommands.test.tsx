import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useChoreographyNavigation } from './react-navigation';
import { useChoreographyRouter } from './expo-router';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { NavigationSessionController } from '../core/NavigationSessionController';

jest.mock('@react-navigation/native', () => ({
  useRoute: jest.fn(),
  useIsFocused: jest.fn(() => true),
  useNavigation: jest.fn(),
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-router', () => jest.requireMock('@react-navigation/native'));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));
jest.mock('../components/ChoreographyScreenBase', () => ({
  ChoreographyScreenBase: jest.fn(),
}));
jest.mock('../hooks/useChoreographyNavigation', () => ({
  useChoreographyNavigator: jest.fn(),
}));
jest.mock('../hooks/useChoreographyScreenRemoval', () => ({
  useChoreographyScreenRemoval: jest.fn(),
}));
jest.mock('../hooks/useInteractiveTransition', () => ({
  useInteractiveTransitionNavigator: jest.fn(),
}));
jest.mock('../core/navigationTarget', () => ({
  waitForNavigationTarget: jest.fn(),
}));

const routeHooks = jest.requireMock('@react-navigation/native');
const { useChoreographyNavigator } = jest.requireMock(
  '../hooks/useChoreographyNavigation'
);
const { waitForNavigationTarget } = jest.requireMock(
  '../core/navigationTarget'
);
let tree: ReactTestRenderer | undefined;

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

function makeRouter() {
  return { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
}

function makeCoreCommands() {
  return {
    navigate: jest.fn((_request: any) => Promise.resolve()),
    goBack: jest.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  routeHooks.useIsFocused.mockReturnValue(true);
  routeHooks.useRoute.mockReturnValue({ key: 'source-first' });
});

test.each(['React Navigation', 'Expo Router'] as const)(
  '%s exposes the current focus gate to a child layout effect through the real core',
  async (adapter) => {
    useChoreographyNavigator.mockImplementation(
      jest.requireActual('../hooks/useChoreographyNavigation')
        .useChoreographyNavigator
    );
    const controller = new NavigationSessionController();
    const context = {
      navigationController: controller,
      activeSession: null,
      pendingTargetScreenId: null,
    } as unknown as ChoreographyContextType;
    const navigation = makeNavigation();
    const router = makeRouter();
    let pending: Promise<void> | undefined;
    routeHooks.useNavigation.mockReturnValue(navigation);
    function Child({
      navigate,
      attempt,
    }: {
      navigate: () => Promise<void>;
      attempt: boolean;
    }) {
      useLayoutEffect(() => {
        if (attempt) pending = navigate();
      }, [attempt, navigate]);
      return null;
    }
    function NativeCaller({ attempt }: { attempt: boolean }) {
      const commands = useChoreographyNavigation(navigation);
      return (
        <Child
          attempt={attempt}
          navigate={() =>
            commands.navigate('Detail', undefined, {
              transitionConfig: { group: 'cards' },
            })
          }
        />
      );
    }
    function ExpoCaller({ attempt }: { attempt: boolean }) {
      const commands = useChoreographyRouter(router, 'Source');
      return (
        <Child
          attempt={attempt}
          navigate={() =>
            commands.push({
              href: '/detail',
              targetScreenId: 'Detail',
              transitionConfig: { group: 'cards' },
            })
          }
        />
      );
    }
    const Caller = adapter === 'React Navigation' ? NativeCaller : ExpoCaller;
    await act(async () => {
      tree = create(
        <ChoreographyContext.Provider value={context}>
          <Caller attempt={false} />
        </ChoreographyContext.Provider>
      );
    });
    routeHooks.useIsFocused.mockReturnValue(false);
    routeHooks.useRoute.mockReturnValue({ key: 'source-current' });
    await act(async () =>
      tree!.update(
        <ChoreographyContext.Provider value={context}>
          <Caller attempt />
        </ChoreographyContext.Provider>
      )
    );
    await expect(pending).resolves.toBeUndefined();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(controller.peekQueuedNavigation()).toMatchObject({
      sourceScreenId: 'source-current',
      targetScreenId: 'Detail',
    });
  }
);

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

test.each(['React Navigation', 'Expo Router'] as const)(
  '%s keeps an already-created request bound to its original navigator',
  async (adapter) => {
    const core = makeCoreCommands();
    useChoreographyNavigator.mockReturnValue(core);
    let start!: () => Promise<void>;
    function NativeCaller({
      navigation,
    }: {
      navigation: ReturnType<typeof makeNavigation>;
    }) {
      const commands = useChoreographyNavigation(navigation);
      start = () => commands.navigate('Detail', { id: 42 });
      return null;
    }
    function ExpoCaller({ router }: { router: ReturnType<typeof makeRouter> }) {
      const commands = useChoreographyRouter(router, 'Source');
      start = () =>
        commands.push({ href: '/detail/42', targetScreenId: 'Detail' });
      return null;
    }
    const firstNavigation = makeNavigation();
    const firstRouter = makeRouter();
    routeHooks.useNavigation.mockReturnValue(firstNavigation);
    await act(async () => {
      tree = create(
        adapter === 'React Navigation' ? (
          <NativeCaller navigation={firstNavigation} />
        ) : (
          <ExpoCaller router={firstRouter} />
        )
      );
    });
    await start();
    const request = core.navigate.mock.calls[0]![0];
    const nextNavigation = makeNavigation();
    const nextRouter = makeRouter();
    routeHooks.useRoute.mockReturnValue({ key: 'source-next' });
    routeHooks.useNavigation.mockReturnValue(nextNavigation);
    await act(async () =>
      tree!.update(
        adapter === 'React Navigation' ? (
          <NativeCaller navigation={nextNavigation} />
        ) : (
          <ExpoCaller router={nextRouter} />
        )
      )
    );
    request.dispatchNavigation();
    request.resolveTargetScreenId();
    if (adapter === 'React Navigation') {
      expect(firstNavigation.navigate).toHaveBeenCalledWith('Detail', {
        id: 42,
      });
      expect(waitForNavigationTarget).toHaveBeenCalledWith(
        firstNavigation,
        'source-first',
        'Detail'
      );
    } else {
      expect(firstRouter.push).toHaveBeenCalledWith('/detail/42');
      expect(waitForNavigationTarget).toHaveBeenCalledWith(
        firstNavigation,
        'source-first'
      );
    }
    expect(nextNavigation.navigate).not.toHaveBeenCalled();
    expect(nextRouter.push).not.toHaveBeenCalled();
  }
);

test('React Navigation retains commands while forwarding the latest core and navigator bindings', async () => {
  let commands!: ReturnType<typeof useChoreographyNavigation>;
  function Harness({
    navigation,
  }: {
    navigation: ReturnType<typeof makeNavigation>;
  }) {
    commands = useChoreographyNavigation(navigation);
    return null;
  }
  const originalNavigation = makeNavigation();
  const originalCore = makeCoreCommands();
  useChoreographyNavigator.mockReturnValue(originalCore);
  await act(async () => {
    tree = create(<Harness navigation={originalNavigation} />);
  });
  const retained = commands;
  const navigation = makeNavigation();
  const core = makeCoreCommands();
  useChoreographyNavigator.mockReturnValue(core);
  routeHooks.useRoute.mockReturnValue({ key: 'source-current' });
  await act(async () => tree!.update(<Harness navigation={navigation} />));

  expect(commands).toBe(retained);
  const params = { id: 42, transitionGroup: 'legacy-group' };
  const spring = { duration: 380, dampingRatio: 1 };
  const result = retained.navigate('Detail', params, { spring });
  expect(result).toBe(core.navigate.mock.results[0]!.value);
  expect(originalCore.navigate).not.toHaveBeenCalled();
  const request = core.navigate.mock.calls[0]![0] as any;
  expect(request).toMatchObject({
    targetScreenId: 'Detail',
    options: { spring, transitionConfig: { group: 'legacy-group' } },
  });
  request.dispatchNavigation();
  request.resolveTargetScreenId();
  expect(navigation.navigate).toHaveBeenCalledWith('Detail', params);
  expect(originalNavigation.navigate).not.toHaveBeenCalled();
  expect(waitForNavigationTarget).toHaveBeenCalledWith(
    navigation,
    'source-current',
    'Detail'
  );
  expect(retained.goBack()).toBe(core.goBack.mock.results[0]!.value);
  expect(originalCore.goBack).not.toHaveBeenCalled();
});

test('Expo Router retains push, navigate and back while forwarding the latest bindings', async () => {
  let commands!: ReturnType<typeof useChoreographyRouter<string>>;
  function Harness({ router }: { router: ReturnType<typeof makeRouter> }) {
    commands = useChoreographyRouter<string>(router, 'Source');
    return null;
  }
  const originalRouter = makeRouter();
  const originalCore = makeCoreCommands();
  useChoreographyNavigator.mockReturnValue(originalCore);
  routeHooks.useNavigation.mockReturnValue(makeNavigation());
  await act(async () => {
    tree = create(<Harness router={originalRouter} />);
  });
  const retained = commands;
  const router = makeRouter();
  const core = makeCoreCommands();
  const navigation = makeNavigation();
  useChoreographyNavigator.mockReturnValue(core);
  routeHooks.useRoute.mockReturnValue({ key: 'source-current' });
  routeHooks.useNavigation.mockReturnValue(navigation);
  await act(async () => tree!.update(<Harness router={router} />));

  expect(commands).toBe(retained);
  for (const method of ['push', 'navigate'] as const) {
    const spring = { duration: 380, dampingRatio: 1 };
    const result = retained[method]({
      href: '/detail/42',
      targetScreenId: 'Detail',
      transitionConfig: { group: 'card' },
      spring,
    });
    expect(result).toBe(core.navigate.mock.results.at(-1)!.value);
    const request = core.navigate.mock.calls.at(-1)![0] as any;
    expect(request).toMatchObject({
      targetScreenId: 'Detail',
      options: { transitionConfig: { group: 'card' }, spring },
    });
    request.dispatchNavigation();
    request.resolveTargetScreenId();
    expect(router[method]).toHaveBeenCalledWith('/detail/42');
    expect(originalRouter[method]).not.toHaveBeenCalled();
  }
  expect(waitForNavigationTarget).toHaveBeenLastCalledWith(
    navigation,
    'source-current'
  );
  expect(retained.back()).toBe(core.goBack.mock.results[0]!.value);
  expect(originalCore.navigate).not.toHaveBeenCalled();
  expect(originalCore.goBack).not.toHaveBeenCalled();
});
