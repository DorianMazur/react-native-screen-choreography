import { useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { ChoreographyProvider } from './ChoreographyProvider';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';
import { SharedElement } from './SharedElement';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { TransitionOverlay } from '../core/TransitionOverlay';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { makeTransition } from '../transitions/makeTransition';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useReducedMotion: jest.fn(() => false),
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
const { Portal, PortalHost } = jest.requireMock('react-native-teleport');
const fabric = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographyRequestFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};
const transition = makeTransition({ renderer: ({ children }) => children });
const originalOS = Platform.OS;
let tree: ReactTestRenderer;
let ctx: ChoreographyContextType;
const onEnd = jest.fn();
function Consumer() {
  ctx = useContext(ChoreographyContext)!;
  return null;
}
function App({ detail = true }: { detail?: boolean }) {
  return (
    <ChoreographyProvider onTransitionEnd={onEnd}>
      <Consumer />
      <ChoreographyScreenBase screenId="list">
        <SharedElement id="card" groupId="group" transition={transition}>
          <Payload />
        </SharedElement>
      </ChoreographyScreenBase>
      {detail && (
        <ChoreographyScreenBase screenId="detail">
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
const host = () => tree.root.findByType(NativeTransitionHost).props;
const destination = () => tree.root.findByType(Portal).props.hostName;
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
  await act(async () => {
    tree = create(<App />, { createNodeMock: () => ({}) });
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

test.each(['complete', 'cancel'] as const)(
  '%s retargets the live owner before removing Android hosts, and ignores stale acknowledgments',
  async (outcome) => {
    const session = await start();
    const payload = tree.root.findByType(Payload);
    const overlayHosts = tree.root
      .findByType(TransitionOverlay)
      .findAllByType(PortalHost);
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
    expect(tree.root.findByType(Payload)).toBe(payload);
    expect(
      tree.root.findByType(TransitionOverlay).findAllByType(PortalHost)[0]
    ).toBe(overlayHosts[0]);
    const retained = tree.root.findByType(TransitionOverlay).props.session;
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
      tree.root.findByType(TransitionOverlay).findAllByType(PortalHost)
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
  const payload = tree.root.findByType(Payload);
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
    expect(tree.root.findByType(Payload)).toBe(payload);
    expect(ctx.navigationController.isNavigationLocked()).toBe(false);
  }
});

test('removing a destination during handoff returns the payload home', async () => {
  const session = await start();
  await act(async () => ctx.completeTransition(session.id));
  await act(async () => tree.update(<App detail={false} />));
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
      await act(async () => tree.update(<App />));
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
