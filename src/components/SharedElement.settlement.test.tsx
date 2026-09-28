import { useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChoreographyProvider } from './ChoreographyProvider';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';
import { SharedElement } from './SharedElement';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import {
  useSharedElementPresentation,
  type SharedElementPresentation,
} from '../core/SharedElementPresentation';
import { runReverseTransition } from '../core/runReverseTransition';
import { makeTransition } from '../transitions/makeTransition';
import { NativeTransitionHost } from '../native/NativeTransitionHost';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  cancelAnimation: jest.fn(),
}));
jest.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-teleport', () => ({
  Portal: 'Portal',
  PortalHost: 'PortalHost',
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock(
  '../native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);
// The overlay never commits its content, as when the JS thread is busy past
// the overlay-readiness window.
jest.mock('../core/TransitionOverlay', () => ({
  TransitionOverlay: () => null,
}));

const { Portal } = jest.requireMock('react-native-teleport') as {
  Portal: React.ElementType;
};

const fabricGlobals = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographyRequestFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};

const GROUP = 'rewards';
const transition = makeTransition({ renderer: () => null });

describe('SharedElement owner settlement when the destination route goes away', () => {
  let context!: ChoreographyContextType;
  let actions!: ChoreographyActionsType;
  let presentation!: SharedElementPresentation;
  let tree: ReactTestRenderer | undefined;

  function Consumer() {
    context = useContext(ChoreographyContext)!;
    actions = useContext(ChoreographyActionsContext)!;
    return null;
  }

  function Medal() {
    presentation = useSharedElementPresentation();
    return null;
  }

  function App({ detail }: { detail: boolean }) {
    return (
      <ChoreographyProvider>
        <Consumer />
        <ChoreographyScreenBase screenId="list">
          <SharedElement id="medal" groupId={GROUP} transition={transition}>
            <Medal />
          </SharedElement>
        </ChoreographyScreenBase>
        {detail ? (
          <ChoreographyScreenBase screenId="detail">
            <SharedElement.Target
              id="medal"
              groupId={GROUP}
              transition={transition}
            />
          </ChoreographyScreenBase>
        ) : null}
      </ChoreographyProvider>
    );
  }

  const ownerHostName = () =>
    tree!.root.findByType(Portal).props.hostName as string | undefined;

  const expectCollapsedAtHome = () => {
    expect(ownerHostName()).toBeUndefined();
    expect(presentation.settled).toBe('collapsed');
    expect(presentation.presentationProgress.value).toBe(0);
  };

  const expectExpandedOnDetail = () => {
    expect(ownerHostName()).toBe(
      `screen-choreography:live:destination:["detail","${GROUP}","medal"]`
    );
    expect(presentation.settled).toBe('expanded');
    expect(presentation.presentationProgress.value).toBe(1);
  };

  const removeDetailRoute = async () => {
    await act(async () => tree!.update(<App detail={false} />));
  };

  const openDetail = async () => {
    await act(async () => {
      const preparing = context.startTransition({
        groupId: GROUP,
        sourceScreenId: 'list',
        targetScreenId: 'detail',
        direction: 'forward',
      });
      await jest.runAllTimersAsync();
      await preparing;
    });
    const sessionId = context.activeSession!.id;
    await act(async () => context.completeTransition(sessionId));
    expectExpandedOnDetail();
  };

  const startBackSession = async () => {
    await act(async () => {
      const preparing = context.startTransition({
        groupId: GROUP,
        sourceScreenId: 'detail',
        targetScreenId: 'list',
        direction: 'backward',
      });
      await jest.runAllTimersAsync();
      await preparing;
    });
    return context.activeSession!.id;
  };

  /**
   * `rendersActiveSession` controls whether React commits the prepared back
   * session before its fallback resolves. A busy JS thread can skip it.
   */
  const goBack = async ({
    rendersActiveSession = false,
    presentationFailure = 'timeout',
  }: {
    rendersActiveSession?: boolean;
    presentationFailure?: 'timeout' | 'native';
  } = {}) => {
    const popAction = jest.fn(async () => ({
      removed: true,
      presented: false,
    }));
    let back!: Promise<void>;
    await act(async () => {
      back = runReverseTransition({
        ctx: context,
        groupId: GROUP,
        sourceScreenId: 'list',
        currentScreenId: 'detail',
        popAction,
      });
      if (rendersActiveSession) {
        await jest.advanceTimersByTimeAsync(0);
        return;
      }
      await jest.runAllTimersAsync();
      await back;
    });
    if (rendersActiveSession) {
      expect(context.activeSession?.direction).toBe('backward');
      // Without an attachment acknowledgment, content stays at its destination.
      expect(ownerHostName()).toContain('destination');
      await act(async () => {
        if (presentationFailure === 'native') {
          tree!.root
            .findByType(NativeTransitionHost)
            .props.onPresentationFailed(context.activeSession!.id);
        }
        await jest.runAllTimersAsync();
        await back;
      });
    }
    expect(popAction).toHaveBeenCalledTimes(1);
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    // Mocked composite views expose instances instead of host nodes.
    const nodeTags = new WeakMap<object, number>();
    let nextTag = 0;
    jest
      .spyOn(require('react-native'), 'findNodeHandle')
      .mockImplementation((node: any) => {
        if (!node) return null;
        if (!nodeTags.has(node)) nodeTags.set(node, ++nextTag);
        return nodeTags.get(node)!;
      });
    fabricGlobals.__screenChoreographyCaptureFabricLayout = jest.fn(
      (_screens: number[], tags: number[]) =>
        tags.map(() => ({ pageX: 10, pageY: 20, width: 100, height: 100 }))
    );
    fabricGlobals.__screenChoreographySubscribeFabricMount = jest.fn(
      () => () => {}
    );
    fabricGlobals.__screenChoreographyRequestFabricLayout = jest.fn(
      (screens, tags) => (validate?: boolean) =>
        validate === true
          ? true
          : validate === false
            ? undefined
            : fabricGlobals.__screenChoreographyCaptureFabricLayout!(
                screens,
                tags
              )
    );
    await act(async () => {
      tree = create(<App detail />, { createNodeMock: () => ({}) });
    });
    await act(async () => {
      context.setScreenReady('list', true);
      context.setScreenReady('detail', true);
    });
    expectCollapsedAtHome();
  });

  afterEach(async () => {
    await act(async () => tree?.unmount());
    tree = undefined;
    delete fabricGlobals.__screenChoreographyCaptureFabricLayout;
    delete fabricGlobals.__screenChoreographyRequestFabricLayout;
    delete fabricGlobals.__screenChoreographySubscribeFabricMount;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('a completed back session returns the owner home', async () => {
    await openDetail();
    const sessionId = await startBackSession();
    await act(async () => context.completeTransition(sessionId));
    expectCollapsedAtHome();
    await removeDetailRoute();
    expectCollapsedAtHome();
  });

  test('a rejected back keeps the owner on the still-mounted destination', async () => {
    await openDetail();
    const sessionId = await startBackSession();
    await act(async () => context.cancelTransition(sessionId));
    expectExpandedOnDetail();
  });

  test('re-registering the destination presentation does not return the owner home', async () => {
    await openDetail();
    const sessionId = await startBackSession();
    const presentationRef = { current: {} } as any;
    await act(async () => {
      actions.registerScreenPresentation('detail', presentationRef)();
      context.cancelTransition(sessionId);
    });
    await act(async () => {
      actions.registerScreenPresentation('detail', presentationRef);
    });
    expectExpandedOnDetail();
  });

  test.each(['timeout', 'native'] as const)(
    'back that pops after an overlay presentation failure (%s) returns the owner home',
    async (presentationFailure) => {
      await openDetail();
      await goBack({ rendersActiveSession: true, presentationFailure });
      // The owner must not re-host into the screen that is being popped.
      expectCollapsedAtHome();
      await removeDetailRoute();
      expectCollapsedAtHome();
    }
  );

  test('back that pops before the active session ever renders returns the owner home', async () => {
    await openDetail();
    await goBack();
    await removeDetailRoute();
    expectCollapsedAtHome();
  });

  test('back that pops because no reverse session could be prepared returns the owner home', async () => {
    await openDetail();
    fabricGlobals.__screenChoreographyCaptureFabricLayout!.mockReturnValue(
      null
    );
    await goBack();
    await removeDetailRoute();
    expectCollapsedAtHome();
  });

  test('removing the destination route without a back session returns the owner home', async () => {
    await openDetail();
    await removeDetailRoute();
    expectCollapsedAtHome();
  });
});
