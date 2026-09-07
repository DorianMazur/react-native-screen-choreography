import React, { StrictMode, useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChoreographyProvider } from '../src/components/ChoreographyProvider';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../src/core/ChoreographyContext';

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return {
    ...jest.requireActual('../__mocks__/react-native-reanimated'),
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
  '../src/native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);

describe('ChoreographyProvider lifecycle', () => {
  test.each([false, true])(
    'publishes and completes sessions with StrictMode=%s',
    async (strict) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let tree: ReactTestRenderer | undefined;
      const onTransitionStart = jest.fn();
      const onTransitionEnd = jest.fn();
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
            </ChoreographyProvider>
          );
          tree = create(
            strict ? <StrictMode>{provider}</StrictMode> : provider
          );
        });

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

        await act(async () => context.completeTransition(sessionId));

        expect(context.activeSession).toBeNull();
        expect(context.progressOwnership.hasSession).toBe(false);
        expect(onTransitionEnd).toHaveBeenCalledTimes(1);
        expect(onTransitionEnd).toHaveBeenCalledWith(session);
        expect(hidden.value).toBe(0);
      } finally {
        await act(async () => tree?.unmount());
        jest.useRealTimers();
      }
    }
  );
});
