import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { withSpring } from 'react-native-reanimated';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../src/core/ChoreographyContext';
import { ProgressOwnership } from '../src/core/ProgressOwnership';
import { useChoreographyNavigator } from '../src/hooks/useChoreographyNavigation';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(() => 0),
}));

describe('Back preparation ownership', () => {
  test.each(['frame', 'measurement', 'final frame'])(
    'replacement at %s cannot schedule or complete stale work',
    async (boundary) => {
      const frames: FrameRequestCallback[] = [];
      const raf = jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      let resolveMetrics!: () => void;
      const progress = { value: 0.8 } as ChoreographyContextType['progress'];
      const progressOwnership = new ProgressOwnership(
        { value: 0 } as ChoreographyContextType['progress'],
        progress
      );
      progressOwnership.setSession('A');
      const navigateBack = jest.fn();
      const ctx = {
        progress,
        progressOwnership,
        activeSession: {
          id: 'A',
          direction: 'forward',
          sourceScreenId: 'List',
          targetScreenId: 'Detail',
        },
        refreshActiveSessionMetrics: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveMetrics = resolve;
            })
        ),
        completeTransition: jest.fn(),
        cancelTransition: jest.fn(),
      } as unknown as ChoreographyContextType;
      let navigation!: ReturnType<typeof useChoreographyNavigator>;
      function Harness() {
        navigation = useChoreographyNavigator({
          currentScreenId: 'Detail',
          isFocused: true,
          goBack: navigateBack,
        });
        return null;
      }
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={ctx}>
            <Harness />
          </ChoreographyContext.Provider>
        );
      });
      let pending!: Promise<void>;
      await act(async () => {
        pending = navigation.goBack();
      });
      expect(navigateBack).toHaveBeenCalledTimes(1);
      const replace = () => {
        progressOwnership.setSession('B');
        progress.value = 0.65;
      };
      if (boundary === 'frame') replace();
      await act(async () => {
        frames.shift()!(0);
      });
      if (boundary === 'measurement') replace();
      if (boundary !== 'frame')
        await act(async () => {
          resolveMetrics();
          await pending;
        });
      if (boundary === 'final frame') replace();
      await act(async () => {
        frames.splice(0).forEach((callback) => callback(0));
        await pending;
      });
      expect(progress.value).toBe(0.65);
      expect(withSpring).not.toHaveBeenCalled();
      expect(ctx.completeTransition).not.toHaveBeenCalled();
      expect(ctx.cancelTransition).not.toHaveBeenCalled();
      expect(navigateBack).toHaveBeenCalledTimes(1);
      await act(async () => tree.unmount());
      raf.mockRestore();
    }
  );
});
