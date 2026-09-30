import React, { useContext, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { ChoreographyProvider } from './ChoreographyProvider';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import type { TransitionSessionData } from '../types';

jest.mock('../native/attachmentCapability', () => ({
  hostsReportAttachment: true,
}));

jest.mock('react-native-teleport', () => ({
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  '../native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);

jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: { install: jest.fn() },
}));

const fabricGlobals = globalThis as typeof globalThis & {
  __screenChoreographyRequestFabricLayout?: jest.Mock;
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};

function FabricScreens() {
  const actions = useContext(ChoreographyActionsContext)!;
  useLayoutEffect(() => {
    const releases = ['list', 'detail'].map((id) => {
      actions.setScreenReady(id, true);
      return actions.registerScreenPresentation(id, {
        current: { tag: 100 },
      } as any);
    });
    return () => releases.forEach((release) => release());
  }, [actions]);
  return null;
}

describe('ChoreographyProvider native attachment', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.useFakeTimers();
    Platform.OS = 'ios';
    jest
      .spyOn(require('react-native'), 'findNodeHandle')
      .mockImplementation((node: any) => node.tag);
    fabricGlobals.__screenChoreographyCaptureFabricLayout = jest.fn(
      (_screens, tags) =>
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
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    delete fabricGlobals.__screenChoreographyCaptureFabricLayout;
    delete fabricGlobals.__screenChoreographyRequestFabricLayout;
    delete fabricGlobals.__screenChoreographySubscribeFabricMount;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('mounts hidden hosts first and activates only after native attachment', async () => {
    let context!: ChoreographyContextType;
    let tree!: ReactTestRenderer;
    function Consumer() {
      context = useContext(ChoreographyContext)!;
      return null;
    }
    try {
      await act(async () => {
        tree = create(
          <ChoreographyProvider>
            <FabricScreens />
            <Consumer />
          </ChoreographyProvider>
        );
      });
      for (const screenId of ['list', 'detail']) {
        context.registerElement({
          id: 'card',
          groupId: 'group',
          screenId,
          metrics: null,
          ref: { current: { tag: screenId === 'list' ? 1 : 2 } },
          getPresentation: () => ({ transition: { renderer: () => null } }),
        });
      }
      let pending!: Promise<TransitionSessionData | null>;
      await act(async () => {
        pending = context.startTransition({
          groupId: 'group',
          sourceScreenId: 'list',
          targetScreenId: 'detail',
          direction: 'forward',
        });
        await jest.advanceTimersByTimeAsync(0);
      });
      const host = () => tree.root.findByType(NativeTransitionHost).props;
      const measuring = context.activeSession!;
      // Only the overlay renders for preparation; app consumers stay put.
      expect(measuring.state).toBe('measuring');
      expect(host().active).toBe(true);
      expect(host().sessionId).toBe(measuring.id);
      expect(host().presentation.hostNames).toHaveLength(1);
      const prepared = { id: measuring.id };
      expect(context.isOverlayPresented!(prepared.id)).toBe(false);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      expect(context.activeSession).toBe(measuring);

      await act(async () => {
        host().onAttached(prepared.id);
        await pending;
      });
      expect(await pending).toMatchObject({
        id: prepared.id,
        state: 'active',
      });
      expect(context.activeSession?.state).toBe('active');
      expect(host().sessionId).toBe(prepared.id);
    } finally {
      await act(async () => tree?.unmount());
    }
  });
});
