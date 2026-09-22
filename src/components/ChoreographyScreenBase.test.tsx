import { useContext } from 'react';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  ChoreographyControlsContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from './ChoreographyScreenBase';
import { useChoreographyProgress } from '../hooks/useChoreographyProgress';
import type { ScreenAnimationLifetime } from '../hooks/useScreenAnimationLifetime';

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
const originalOS = Platform.OS;

afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((tree) => tree.unmount());
  });
  Platform.OS = originalOS;
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

test('keeps both responder gates open for a held source during preparation', async () => {
  const context = createContext();
  context.interactiveScreenId = 'detail';
  context.activeSession!.state = 'preparing';
  const source = await mountScreen(context, 'detail');
  const target = await mountScreen(context, 'home');
  expect(source.outer().props.pointerEvents).toBe('box-none');
  expect(source.inner().props.animatedProps.pointerEvents).toBe('auto');
  expect(source.opacity()).toBe(1);
  expect(target.outer().props.pointerEvents).toBe('none');

  context.activeSession!.state = 'active';
  context.progress.value = 0;
  await act(async () => source.update(true));
  expect(source.inner().props.animatedProps.pointerEvents).toBe('auto');
  expect(source.opacity()).toBe(1);
});

async function mountScreen(
  context: ChoreographyContextType,
  screenId: string,
  actions: ChoreographyActionsType | null = null,
  allowInteractionDuringTransition?: boolean,
  keepVisible = false,
  screenFade?: ChoreographyScreenProps['screenFade']
) {
  let tree!: ReactTestRenderer;
  const render = (ready = true) => (
    <ChoreographyContext.Provider value={context}>
      <ChoreographyActionsContext.Provider value={actions}>
        <ChoreographyScreenBase
          screenId={screenId}
          ready={ready}
          screenFade={screenFade}
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

test.each(['pending', 'preparing'] as const)(
  'keepVisible preserves the forward %s visibility and input gate',
  async (phase) => {
    const context = createContext();
    context.activeSession!.direction = 'forward';
    if (phase === 'pending') {
      context.activeSession = null;
      context.pendingTargetScreenId = 'home';
    } else context.activeSession!.state = 'preparing';
    const screen = await mountScreen(context, 'home', null, undefined, true);
    expect(screen.outer().props.style).toContainEqual({ opacity: 0 });
    expect(screen.outer().props.pointerEvents).toBe('none');
  }
);

test('applies custom fade and keepVisible through the screen wrapper', async () => {
  const context = createContext();
  context.progress.value = 0.5;
  const custom = await mountScreen(context, 'detail', null, undefined, false, {
    during: [0.2, 0.8],
  });
  expect(custom.inner().props.style[1].opacity).toBeCloseTo(0.5);
  const disabled = await mountScreen(context, 'detail', null, undefined, true);
  expect(disabled.inner().props.style[1].opacity).toBe(1);
  expect(disabled.inner().props.animatedProps.pointerEvents).toBe('none');
});

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
  const kept = await mountScreen(context, 'home', null, false, true, {
    during: [0.2, 0.8],
  });
  expect(fading.opacity()).toBe(0);
  expect(kept.opacity()).toBe(1);
  expect(kept.inner().props.animatedProps.pointerEvents).toBe('none');
});

test('suspension freezes public companion progress and pointer events while retained content keeps following the overlay', async () => {
  Platform.OS = 'android';
  const context = createContext();
  context.progress.value = 0.25;
  let lifetime!: ScreenAnimationLifetime;
  const controls = { progress: context.progress, settleTransition: jest.fn() };
  const actions = {
    registerScreenPresentation: jest.fn((_id, _ref, registeredLifetime) => {
      lifetime = registeredLifetime;
      return jest.fn();
    }),
    setScreenReady: jest.fn(),
    unregisterScreen: jest.fn(),
  } as unknown as ChoreographyActionsType;
  let companion!: ReturnType<typeof useChoreographyProgress>;
  let retainedProgress!: ChoreographyContextType['progress'];
  let providerProgress!: ChoreographyContextType['progress'];
  function Companion() {
    companion = useChoreographyProgress();
    // Retained SharedElement content takes its progress from the session context.
    retainedProgress = useContext(ChoreographyContext)!.progress;
    return null;
  }
  function ProviderConsumer() {
    providerProgress = useContext(ChoreographyControlsContext)!.progress;
    return null;
  }
  let tree!: ReactTestRenderer;
  const frames: ((time: number) => void)[] = [];
  const frameMock = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  try {
    await act(async () => {
      tree = create(
        <ChoreographyControlsContext.Provider value={controls}>
          <ChoreographyContext.Provider value={context}>
            <ChoreographyActionsContext.Provider value={actions}>
              <ProviderConsumer />
              <ChoreographyScreenBase screenId="detail">
                <Companion />
              </ChoreographyScreenBase>
            </ChoreographyActionsContext.Provider>
          </ChoreographyContext.Provider>
        </ChoreographyControlsContext.Provider>
      );
    });
    trees.push(tree);
    const pointerEvents = () =>
      tree.root.findAll((node) => Boolean(node.props?.animatedProps))[0]!.props
        .animatedProps.pointerEvents;
    expect(companion.progress).not.toBe(context.progress);
    expect(companion.progress.value).toBe(0.25);
    expect(retainedProgress).toBe(context.progress);
    expect(providerProgress).toBe(context.progress);
    expect(pointerEvents()).toBe('none');
    const barrier = lifetime.suspend(3);
    while (frames.length) frames.shift()!(0);
    await barrier;
    context.progress.value = 0.1;
    context.interactionOwner.value = 'detail';
    expect(companion.progress.value).toBe(0.25);
    expect(retainedProgress.value).toBe(0.1);
    expect(providerProgress.value).toBe(0.1);
    expect(pointerEvents()).toBe('none');
    lifetime.resume(3);
    expect(companion.progress.value).toBe(0.1);
    expect(pointerEvents()).toBe('auto');
  } finally {
    frameMock.mockRestore();
  }
});

test('iOS screens preserve the provider controls and progress identity', async () => {
  Platform.OS = 'ios';
  const context = createContext();
  const controls = { progress: context.progress, settleTransition: jest.fn() };
  let observedControls!: React.ContextType<typeof ChoreographyControlsContext>;
  let observedProgress!: ReturnType<typeof useChoreographyProgress>;
  function Consumer() {
    observedControls = useContext(ChoreographyControlsContext);
    observedProgress = useChoreographyProgress();
    return null;
  }
  await act(async () => {
    trees.push(
      create(
        <ChoreographyControlsContext.Provider value={controls}>
          <ChoreographyContext.Provider value={context}>
            <ChoreographyScreenBase screenId="detail">
              <Consumer />
            </ChoreographyScreenBase>
          </ChoreographyContext.Provider>
        </ChoreographyControlsContext.Provider>
      )
    );
  });
  expect(observedControls).toBe(controls);
  expect(observedProgress.progress).toBe(context.progress);
  context.progress.value = 0.15;
  expect(observedProgress.progress.value).toBe(0.15);
});
