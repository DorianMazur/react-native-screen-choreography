import React, { StrictMode, useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChoreographyProvider } from './ChoreographyProvider';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyControls } from '../hooks/useChoreographyProgress';
import { ScreenIdContext } from '../core/screenIdContext';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return {
    ...jest.requireActual('../../__mocks__/react-native-reanimated'),
    __esModule: true,
    useSharedValue: (value: number) => useRef({ value }).current,
    cancelAnimation: jest.fn(),
  };
});

jest.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-teleport', () => ({
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  '../native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);

describe('ChoreographyProvider lifecycle', () => {
  test('unregistering the preparation source invalidates its dispatch and queue', async () => {
    let context!: ChoreographyContextType;
    let navigation!: ReturnType<typeof useChoreographyNavigator>;
    let tree!: ReactTestRenderer;
    let measured!: (
      pageX: number,
      pageY: number,
      width: number,
      height: number
    ) => void;
    function Caller() {
      context = useContext(ChoreographyContext)!;
      navigation = useChoreographyNavigator({
        currentScreenId: 'source-route',
        isFocused: true,
        goBack: jest.fn(),
      });
      return null;
    }
    const dispatchNavigation = jest.fn();
    try {
      await act(async () => {
        tree = create(
          <ChoreographyProvider>
            <Caller />
          </ChoreographyProvider>
        );
      });
      context.registerElement({
        id: 'card',
        groupId: 'group',
        screenId: 'source-route',
        metrics: null,
        ref: () => ({
          measureInWindow: (callback: typeof measured) => {
            measured = callback;
          },
        }),
        getPresentation: () => ({
          content: null,
          transition: { renderer: () => null },
        }),
      });
      let pending!: Promise<void>;
      await act(async () => {
        pending = navigation.navigate({
          targetScreenId: 'Detail',
          dispatchNavigation,
          options: { transitionConfig: { group: 'group' } },
        });
      });
      context.navigationController.queueNavigation({
        sourceScreenId: 'source-route',
        targetScreenId: 'Other',
        dispatchNavigation,
      });
      await act(async () => context.unregisterScreen('source-route'));
      await act(async () => {
        measured(0, 0, 100, 100);
        await pending;
      });
      expect(dispatchNavigation).not.toHaveBeenCalled();
      expect(context.navigationController.isNavigationLocked()).toBe(false);
      expect(context.navigationController.peekQueuedNavigation()).toBeNull();
      expect(context.pendingTargetScreenId).toBeNull();
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test.each([false, true])(
    'publishes and completes sessions with StrictMode=%s',
    async (strict) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let tree: ReactTestRenderer | undefined;
      const onTransitionStart = jest.fn();
      const onTransitionEnd = jest.fn();
      const controlRenders = jest.fn();
      let settle!: () => void;
      function Controls() {
        settle = useChoreographyControls().settleTransition;
        controlRenders();
        return null;
      }
      function Consumer() {
        context = useContext(ChoreographyContext)!;
        return null;
      }

      try {
        await act(async () => {
          const provider = (
            <ChoreographyProvider
              onTransitionStart={onTransitionStart}
              onTransitionEnd={onTransitionEnd}
            >
              <Consumer />
              <ScreenIdContext.Provider value="detail">
                <Controls />
              </ScreenIdContext.Provider>
            </ChoreographyProvider>
          );
          tree = create(
            strict ? <StrictMode>{provider}</StrictMode> : provider
          );
        });

        const initialSettle = settle;
        controlRenders.mockClear();
        const metrics = { pageX: 10, pageY: 20, width: 100, height: 100 };
        for (const screenId of ['list', 'detail']) {
          context.registerElement({
            id: 'card',
            groupId: 'group',
            screenId,
            ref: () => ({
              measureInWindow: (
                callback: (
                  pageX: number,
                  pageY: number,
                  width: number,
                  height: number
                ) => void
              ) => callback(10, 20, 100, 100),
            }),
            metrics,
            getPresentation: () => ({
              content: null,
              transition: { renderer: () => null },
            }),
          });
        }
        const hidden = context.isElementHidden('card', 'list', 'group');
        const unrelated = context.isElementHidden('other', 'list', 'other');
        const writes = [hidden, unrelated].map((sharedValue) => {
          let value = 0;
          const write = jest.fn((next: number) => {
            value = next;
          });
          Object.defineProperty(sharedValue, 'value', {
            get: () => value,
            set: write,
          });
          return write;
        });
        let session: ChoreographyContextType['activeSession'] = null;
        await act(async () => {
          const preparation = context.startTransition({
            groupId: 'group',
            sourceScreenId: 'list',
            targetScreenId: 'detail',
            direction: 'forward',
          });
          await jest.runAllTimersAsync();
          session = await preparation;
        });

        expect(session).not.toBeNull();
        expect(context.activeSession).toBe(session);
        const sessionId = context.activeSession!.id;
        expect(context.progressOwnership.isSession(sessionId)).toBe(true);
        expect(onTransitionStart).toHaveBeenCalledTimes(1);
        expect(onTransitionStart).toHaveBeenCalledWith(session);
        expect(hidden.value).toBe(1);
        expect(writes[0]).toHaveBeenCalledTimes(1);
        expect(writes[1]).not.toHaveBeenCalled();

        await act(async () => {
          const host = tree!.root.findByType(NativeTransitionHost);
          host.props.onPresentationReady();
          host.props.onPresentationReady();
        });
        expect(writes[0]).toHaveBeenCalledTimes(1);
        expect(writes[1]).not.toHaveBeenCalled();

        expect(controlRenders).not.toHaveBeenCalled();
        expect(settle).toBe(initialSettle);
        await act(async () => initialSettle());

        expect(context.activeSession).toBeNull();
        expect(context.progressOwnership.hasSession).toBe(false);
        expect(onTransitionEnd).toHaveBeenCalledTimes(1);
        expect(onTransitionEnd).toHaveBeenCalledWith(session);
        expect(hidden.value).toBe(0);
        expect(writes[0]).toHaveBeenCalledTimes(2);
        expect(writes[1]).not.toHaveBeenCalled();
      } finally {
        await act(async () => tree?.unmount());
        jest.useRealTimers();
      }
    }
  );
});
