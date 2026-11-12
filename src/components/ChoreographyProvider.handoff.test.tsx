import { useContext } from 'react';
import {
  act,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import { Platform } from 'react-native';
import { useReducedMotion, withSpring } from 'react-native-reanimated';
import {
  useChoreographyNavigation,
  useInteractiveTransition,
} from '../adapters/react-navigation';
import { useChoreographyRouter } from '../adapters/expo-router';
import { ChoreographyProvider } from './ChoreographyProvider';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';
import { SharedElement } from './SharedElement';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { TransitionOverlay } from '../core/TransitionOverlay';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { runReverseTransition } from '../core/runReverseTransition';
import { makeTransition } from '../transitions/makeTransition';

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    key: jest.requireActual('../core/screenIdContext').useScreenId(),
  }),
  useIsFocused: () => true,
  useNavigation: () => ({}),
}));
jest.mock('expo-router', () => ({
  ...jest.requireMock('@react-navigation/native'),
  useSitemap: () => null,
}));
jest.mock('expo-router/react-navigation', () => ({}));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useReducedMotion: jest.fn(() => false),
  withSpring: jest.fn((target) => target),
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
jest.mock('../native/attachmentCapability', () => ({
  hostsReportAttachment: false,
}));
const attachment = jest.requireMock('../native/attachmentCapability') as {
  hostsReportAttachment: boolean;
};
const { Portal, PortalHost } = jest.requireMock('react-native-teleport');
const fabric = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographyRequestFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};
const transition = makeTransition({ renderer: ({ children }) => children });
const originalOS = Platform.OS;
let tree: RenderResult;
let ctx: ChoreographyContextType;
const onEnd = jest.fn();
function Consumer() {
  ctx = useContext(ChoreographyContext)!;
  return null;
}
function App({
  listContent,
  detailContent,
  detail = true,
  preview = false,
}: {
  listContent?: React.ReactNode;
  detailContent?: React.ReactNode;
  detail?: boolean;
  preview?: boolean;
}) {
  return (
    <ChoreographyProvider onTransitionEnd={onEnd}>
      <Consumer />
      <ChoreographyScreenBase screenId="list">
        {listContent}
        <SharedElement id="card" groupId="group" transition={transition}>
          <Payload />
        </SharedElement>
      </ChoreographyScreenBase>
      {detail && (
        <ChoreographyScreenBase screenId="detail">
          {detailContent}
          <SharedElement.Target
            id="card"
            groupId="group"
            transition={transition}
          />
        </ChoreographyScreenBase>
      )}
      {preview && (
        <ChoreographyScreenBase screenId="preview">
          <SharedElement.Target
            id="card"
            groupId="group"
            transition={transition}
          />
        </ChoreographyScreenBase>
      )}
    </ChoreographyProvider>
  );
}
function Payload() {
  return null;
}
const host = () => tree.UNSAFE_root.findByType(NativeTransitionHost).props;
const destination = () => tree.UNSAFE_root.findByType(Portal).props.hostName;
async function start(direction: 'forward' | 'backward' = 'forward') {
  let session!: Awaited<ReturnType<typeof ctx.startTransition>>;
  await act(async () => {
    session = await ctx.startTransition({
      groupId: 'group',
      direction,
      sourceScreenId: direction === 'forward' ? 'list' : 'detail',
      targetScreenId: direction === 'forward' ? 'detail' : 'list',
    });
  });
  return session!;
}
async function settle() {
  await act(async () => host().onSettled(ctx.overlayHandoffSessionId));
}
beforeEach(async () => {
  Platform.OS = 'android';
  attachment.hostsReportAttachment = false;
  jest.mocked(useReducedMotion).mockReturnValue(false);
  onEnd.mockReset();
  const tags = new WeakMap<object, number>();
  let nextTag = 0;
  jest
    .spyOn(require('react-native'), 'findNodeHandle')
    .mockImplementation((node: any) => {
      if (!node) return null;
      if (!tags.has(node)) tags.set(node, ++nextTag);
      return tags.get(node)!;
    });
  fabric.__screenChoreographyCaptureFabricLayout = jest.fn((_screens, nodes) =>
    nodes.map(() => ({ pageX: 10, pageY: 20, width: 100, height: 100 }))
  );
  fabric.__screenChoreographySubscribeFabricMount = jest.fn(() => () => {});
  fabric.__screenChoreographyRequestFabricLayout = jest.fn(
    (screens, nodes) => (validate?: boolean) =>
      validate === true
        ? true
        : validate === false
          ? undefined
          : fabric.__screenChoreographyCaptureFabricLayout!(screens, nodes)
  );

  tree = renderComponent(<App />, {
    createNodeMock: () => ({}),
    wrapper: ({ children }) => children,
  });

  await act(async () => {
    ctx.setScreenReady('list', true);
    ctx.setScreenReady('detail', true);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  Platform.OS = originalOS;
  delete fabric.__screenChoreographyCaptureFabricLayout;
  delete fabric.__screenChoreographyRequestFabricLayout;
  delete fabric.__screenChoreographySubscribeFabricMount;
  jest.restoreAllMocks();
});

test('screens calling navigation and gesture hooks directly skip session renders through forward and Back', async () => {
  // Keep props, parent children and route focus fixed to isolate session updates.
  let phase = 'mount';
  const renders = {
    navigation: [] as string[],
    router: [] as string[],
    gesture: [] as string[],
  };
  const router = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
  const navigation = {
    navigate: jest.fn(),
    getState: () => ({ routes: [{ name: 'detail', key: 'detail' }] }),
    addListener: () => () => {},
  };
  let commands!: ReturnType<typeof useChoreographyNavigation>;
  function ListScreen() {
    commands = useChoreographyNavigation(navigation);
    renders.navigation.push(phase);
    return null;
  }
  function ExpoListScreen() {
    useChoreographyRouter(router);
    renders.router.push(phase);
    return null;
  }
  function GestureScreen() {
    useInteractiveTransition();
    renders.gesture.push(phase);
    return null;
  }
  await act(async () =>
    tree.rerender(
      <App
        listContent={
          <>
            <ListScreen />
            <ExpoListScreen />
          </>
        }
        detailContent={<GestureScreen />}
      />
    )
  );
  await act(async () => ctx.setScreenReady('detail', false));
  phase = 'forward pending target';
  let opening!: Promise<void>;
  await act(async () => {
    opening = commands.navigate('detail', undefined, {
      transitionConfig: { group: 'group' },
    });
  });
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
  expect(ctx.pendingTargetScreenId).toBe('detail');
  phase = 'forward activation';
  await act(async () => ctx.setScreenReady('detail', true));
  const forward = ctx.activeSession!;
  expect(forward.direction).toBe('forward');
  phase = 'forward presented, pending target cleared';
  await act(async () => {
    host().onPresentationReady(forward.id);
    await opening;
  });
  expect(ctx.pendingTargetScreenId).toBeNull();
  phase = 'target metrics refreshed';
  fabric.__screenChoreographyCaptureFabricLayout!.mockImplementation(
    (_screens, nodes) =>
      nodes.map(() => ({ pageX: 25, pageY: 30, width: 110, height: 100 }))
  );
  await act(async () => ctx.refreshActiveSessionMetrics('target'));
  expect(ctx.activeSession!.pairs[0]!.targetMetrics.pageX).toBe(25);
  phase = 'forward settlement';
  await act(async () => ctx.completeTransition(forward.id));
  phase = 'forward host released';
  await settle();
  phase = 'Back activation';
  const popAction = jest.fn(async () => ({ removed: true, presented: true }));
  let returning!: Promise<void>;
  await act(async () => {
    returning = runReverseTransition({
      ctx,
      currentScreenId: 'detail',
      sourceScreenId: 'list',
      groupId: 'group',
      popAction,
    });
  });
  const back = ctx.activeSession!;
  expect(back.direction).toBe('backward');
  await act(async () => host().onPresentationReady(back.id));
  // Cross the Android source suspension fence before confirming the pop.
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((frame) => {
    frame(0);
    return 1;
  });
  phase = 'Back removal confirmed';
  await act(async () => ctx.reverseController.commitNearEndpoint(back.id));
  expect(popAction).toHaveBeenCalledTimes(1);
  expect(ctx.interruptibleReturnSessionId).toBe(back.id);
  phase = 'Back settlement';
  await act(async () => {
    jest.mocked(withSpring).mock.lastCall![2]!(true);
    await returning;
  });
  phase = 'Back host released';
  await settle();
  expect(ctx.navigationController.isNavigationLocked()).toBe(false);
  expect(renders).toEqual({
    navigation: ['mount'],
    router: ['mount'],
    gesture: ['mount'],
  });
});

test.each(['complete', 'cancel'] as const)(
  '%s retargets the live owner before removing Android hosts, and ignores stale acknowledgments',
  async (outcome) => {
    const session = await start();
    const payload = tree.UNSAFE_root.findByType(Payload);
    const overlayHosts =
      tree.UNSAFE_root.findByType(TransitionOverlay).findAllByType(PortalHost);
    expect(overlayHosts).toHaveLength(1);
    expect(destination()).toContain('overlay');
    onEnd.mockImplementation(() => {
      expect(ctx.navigationController.isNavigationLocked()).toBe(true);
    });
    await act(async () => {
      if (outcome === 'complete') ctx.completeTransition(session.id);
      else ctx.cancelTransition(session.id);
    });
    expect(ctx.activeSession).toBeNull();
    expect(ctx.overlayHandoffSessionId).toBe(session.id);
    expect(ctx.navigationController.acquireNavigationLock('list')).toBe(false);
    expect(host().active).toBe(true);
    expect(host().presentation).toBeUndefined();
    expect(tree.UNSAFE_root.findByType(Payload)).toBe(payload);
    expect(
      tree.UNSAFE_root.findByType(TransitionOverlay).findAllByType(
        PortalHost
      )[0]
    ).toBe(overlayHosts[0]);
    const retained =
      tree.UNSAFE_root.findByType(TransitionOverlay).props.session;
    expect(retained.pairs[0].source).toEqual({ screenId: 'list' });
    expect(retained.pairs[0].target).toEqual({ screenId: 'detail' });
    if (outcome === 'complete') expect(destination()).toContain('destination');
    else expect(destination()).toBeUndefined();
    expect(await start()).toBeNull();
    await act(async () => host().onSettled('stale-session'));
    expect(ctx.overlayHandoffSessionId).toBe(session.id);
    await settle();
    expect(ctx.overlayHandoffSessionId).toBeNull();
    expect(ctx.navigationController.isNavigationLocked()).toBe(false);
    expect(host().active).toBe(false);
    expect(
      tree.UNSAFE_root.findByType(TransitionOverlay).findAllByType(PortalHost)
    ).toHaveLength(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // An acknowledgment left in the RN queue cannot clear a newer handoff.
    const next = await start();
    await act(async () => ctx.cancelTransition(next.id));
    await act(async () => host().onSettled(session.id));
    expect(ctx.overlayHandoffSessionId).toBe(next.id);
    await settle();
  }
);

test('repeated Back and interactive cancellation preserve the same owner and return host', async () => {
  const payload = tree.UNSAFE_root.findByType(Payload);
  for (let index = 0; index < 3; index++) {
    const opening = await start();
    await act(async () => ctx.completeTransition(opening.id));
    await settle();
    const cancelledBack = await start('backward');
    await act(async () => ctx.cancelTransition(cancelledBack.id));
    expect(destination()).toContain('destination');
    await settle();
    const back = await start('backward');
    await act(async () => ctx.completeTransition(back.id));
    expect(destination()).toBeUndefined();
    await settle();
    expect(tree.UNSAFE_root.findByType(Payload)).toBe(payload);
    expect(ctx.navigationController.isNavigationLocked()).toBe(false);
  }
});

test('removing a destination during handoff returns the payload home', async () => {
  const session = await start();
  await act(async () => ctx.completeTransition(session.id));
  await act(async () => tree.rerender(<App detail={false} />));
  expect(destination()).toBeUndefined();
  await settle();
  expect(ctx.navigationController.isNavigationLocked()).toBe(false);
});

test('batched activation and cancellation still request native settlement', async () => {
  await act(async () => {
    const session = await ctx.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });
    ctx.cancelTransition(session!.id);
  });
  expect(destination()).toBeUndefined();
  expect(host().settlementSessionId).toBeTruthy();
  await settle();
  expect(ctx.navigationController.isNavigationLocked()).toBe(false);
});

test.each(['reduced-motion', 'missing-pairs', 'ios'] as const)(
  '%s does not wait for an Android settlement acknowledgment',
  async (mode) => {
    if (mode === 'reduced-motion') {
      jest.mocked(useReducedMotion).mockReturnValue(true);
      await act(async () => tree.rerender(<App />));
    }
    if (mode === 'missing-pairs')
      ctx.unregisterElement('card', 'detail', 'group');
    if (mode === 'ios') Platform.OS = 'ios';
    const session = await start();
    if (mode === 'missing-pairs') expect(session).toBeNull();
    else await act(async () => ctx.completeTransition(session.id));
    expect(ctx.overlayHandoffSessionId).toBeNull();
    expect(ctx.navigationController.isNavigationLocked()).toBe(false);
    expect(host().active).toBe(false);
  }
);

test('provider disposal releases pending handoff and rejects its delayed callback', async () => {
  const session = await start();
  await act(async () => ctx.completeTransition(session.id));
  const onSettled = host().onSettled;
  const controller = ctx.navigationController;
  controller.queueNavigation({
    targetScreenId: 'detail',
    dispatchNavigation: jest.fn(),
  });
  await act(async () => tree.unmount());
  onSettled(session.id);
  expect(controller.isNavigationLocked()).toBe(false);
  expect(controller.peekQueuedNavigation()).toBeNull();
});

test.each(['ios', 'android'] as const)(
  '%s presents a chained target and releases navigation only after handoff',
  async (platform) => {
    jest.useFakeTimers();
    Platform.OS = platform;
    attachment.hostsReportAttachment = platform === 'ios';
    try {
      await act(async () => tree.rerender(<App key={platform} preview />));
      await act(async () => {
        for (const screen of ['list', 'detail', 'preview'])
          ctx.setScreenReady(screen, true);
      });
      const payload = tree.UNSAFE_root.findByType(Payload);
      let previousId: string | undefined;
      for (const [source, target, direction] of [
        ['list', 'detail', 'forward'],
        ['detail', 'preview', 'forward'],
        ['preview', 'detail', 'backward'],
        ['detail', 'preview', 'forward'],
        ['preview', 'detail', 'backward'],
        ['detail', 'list', 'backward'],
      ] as const) {
        const resting = destination();
        let pending!: ReturnType<typeof ctx.startTransition>;
        await act(async () => {
          pending = ctx.startTransition({
            groupId: 'group',
            sourceScreenId: source,
            targetScreenId: target,
            direction,
          });
          await jest.advanceTimersByTimeAsync(0);
        });
        const id = ctx.activeSession!.id;
        if (platform === 'ios') {
          expect(destination()).toBe(resting);
          if (previousId) await act(async () => host().onAttached(previousId));
          expect(destination()).toBe(resting);
          await act(async () => {
            host().onAttached(id);
            await pending;
          });
        } else {
          await pending;
        }
        expect(destination()).toContain('overlay');
        await act(async () => host().onPresentationReady(id));
        expect(ctx.isOverlayPresented!(id)).toBe(true);
        await act(async () => ctx.completeTransition(id));
        expect(destination()).toBe(
          target === 'list'
            ? undefined
            : `screen-choreography:live:destination:["${target}","group","card"]`
        );
        expect(tree.UNSAFE_root.findByType(Payload)).toBe(payload);
        if (platform === 'android') {
          expect(ctx.overlayHandoffSessionId).toBe(id);
          expect(ctx.navigationController.isNavigationLocked()).toBe(true);
          if (previousId) await act(async () => host().onSettled(previousId));
          expect(ctx.overlayHandoffSessionId).toBe(id);
          await settle();
        }
        expect(ctx.navigationController.isNavigationLocked()).toBe(false);
        previousId = id;
      }
    } finally {
      jest.useRealTimers();
    }
  }
);
