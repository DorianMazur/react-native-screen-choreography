import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useAnimatedProps: (updater: () => { pointerEvents: string }) => ({
    get pointerEvents() {
      return updater().pointerEvents;
    },
  }),
}));

const trees: ReactTestRenderer[] = [];

afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((tree) => tree.unmount());
  });
});

function createContext() {
  return {
    activeSession: {
      id: 'reverse',
      sourceScreenId: 'detail',
      targetScreenId: 'home',
      state: 'active',
      direction: 'backward',
    },
    progress: { value: 0 },
    interactionOwner: { value: null },
  } as unknown as ChoreographyContextType;
}

async function mountScreen(
  context: ChoreographyContextType,
  screenId: string,
  actions: ChoreographyActionsType | null = null,
  allowInteractionDuringTransition?: boolean,
  keepVisible = false
) {
  let tree!: ReactTestRenderer;
  const render = (ready = true) => (
    <ChoreographyContext.Provider value={context}>
      <ChoreographyActionsContext.Provider value={actions}>
        <ChoreographyScreenBase
          screenId={screenId}
          ready={ready}
          keepVisible={keepVisible}
          allowInteractionDuringTransition={allowInteractionDuringTransition}
        >
          {null}
        </ChoreographyScreenBase>
      </ChoreographyActionsContext.Provider>
    </ChoreographyContext.Provider>
  );
  await act(async () => {
    tree = create(render());
  });
  trees.push(tree);
  return {
    tree,
    outer: () => tree.root.findAll((node) => Boolean(node.props.onLayout))[0]!,
    inner: () =>
      tree.root.findAll((node) => Boolean(node.props.animatedProps))[0]!,
    opacity: () => {
      const style = tree.root.findAll((node) =>
        Boolean(node.props.animatedProps)
      )[0]!.props.style;
      return (Array.isArray(style) ? Object.assign({}, ...style) : style)
        .opacity as number;
    },
    update: (ready: boolean) => tree.update(render(ready)),
  };
}

test('releases only the reverse destination before React session cleanup', async () => {
  const context = createContext();
  const destination = await mountScreen(context, 'home', null, false);
  const outgoing = await mountScreen(context, 'detail');
  expect(destination.outer().props.pointerEvents).toBe('box-none');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('none');
  expect(outgoing.inner().props.animatedProps.pointerEvents).toBe('none');

  context.interactionOwner.value = 'home';

  expect(context.activeSession?.state).toBe('active');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('auto');
  expect(outgoing.inner().props.animatedProps.pointerEvents).toBe('none');
});

test('an interrupted forward return unlocks the original source only after removal, respecting opt-out', async () => {
  const context = createContext();
  context.activeSession = {
    ...context.activeSession!,
    direction: 'forward',
    sourceScreenId: 'home',
    targetScreenId: 'detail',
  };
  context.progressOwnership = {
    owner: { value: 3 },
  } as ChoreographyContextType['progressOwnership'];
  context.reverseHandoff = {
    value: {
      sessionId: 'reverse',
      token: 3,
      targetScreenId: 'home',
      animationFinished: false,
      navigationPresented: false,
      completed: false,
    },
  } as ChoreographyContextType['reverseHandoff'];
  const destination = await mountScreen(context, 'home');
  const optedOut = await mountScreen(context, 'home', null, false);
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('none');
  context.reverseHandoff.value!.navigationPresented = true;
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('auto');
  expect(optedOut.inner().props.animatedProps.pointerEvents).toBe('none');

  context.progressOwnership.owner.value = 4;
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('none');
});

test.each(['pending', 'preparing'] as const)(
  'keeps the plain outer input gate closed while %s',
  async (phase) => {
    const context = createContext();
    if (phase === 'pending') context.pendingTargetScreenId = 'home';
    else context.activeSession!.state = 'preparing';
    context.interactionOwner.value = 'home';
    const screen = await mountScreen(context, 'home');
    expect(screen.outer().props.pointerEvents).toBe('none');
  }
);

test('keeps presentation registration stable when readiness changes', async () => {
  const unregister = jest.fn();
  const registerScreenPresentation = jest.fn(() => unregister);
  const actions = {
    registerScreenPresentation,
    setScreenReady: jest.fn(),
    unregisterScreen: jest.fn(),
  } as unknown as ChoreographyActionsType;
  const screen = await mountScreen(createContext(), 'home', actions);
  expect(registerScreenPresentation).toHaveBeenCalledTimes(1);
  await act(async () => screen.update(false));
  expect(registerScreenPresentation).toHaveBeenCalledTimes(1);
  expect(unregister).not.toHaveBeenCalled();
  await act(async () => screen.tree.unmount());
  expect(unregister).toHaveBeenCalledTimes(1);
});

test('the default unlocks only the active arriving screen, never preparation or the outgoing screen', async () => {
  const context = createContext();
  const destination = await mountScreen(context, 'home');
  const source = await mountScreen(context, 'detail');
  expect(destination.inner().props.pointerEvents).toBe('auto');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('auto');
  expect(source.inner().props.animatedProps.pointerEvents).toBe('none');
  context.pendingTargetScreenId = 'home';
  await act(async () => destination.update(true));
  expect(destination.outer().props.pointerEvents).toBe('none');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('none');
  context.pendingTargetScreenId = null;
  context.activeSession!.state = 'preparing';
  await act(async () => destination.update(true));
  expect(destination.outer().props.pointerEvents).toBe('none');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('none');
});

test('keepVisible holds the cross-faded endpoint at full opacity', async () => {
  const context = createContext();
  context.progress.value = 0.4;
  const fading = await mountScreen(context, 'home');
  const kept = await mountScreen(context, 'home', null, false, true);
  expect(fading.opacity()).toBe(0);
  expect(kept.opacity()).toBe(1);
  expect(kept.inner().props.animatedProps.pointerEvents).toBe('none');
});
