import { memo } from 'react';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable, useAnimatedStyle } from 'react-native-reanimated';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  ChoreographyControlsContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ChoreographyScreenBase } from '../components/ChoreographyScreenBase';
import { useChoreographyProgressValue } from './useChoreographyProgress';
import type { ScreenAnimationLifetime } from './useScreenAnimationLifetime';
import type { TransitionSessionData } from '../types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  useAnimatedStyle: jest.fn((fn: () => unknown) => fn()),
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (worklet: () => void) => worklet(),
  scheduleOnRN: (callback: () => void) => callback(),
}));

test.each(['ios', 'android'] as const)(
  '%s: phase and group changes do not rerender a progress-only consumer; props still update',
  async (platform) => {
    const originalOS = Platform.OS;
    Platform.OS = platform;
    let tree!: ReactTestRenderer;
    let value!: ReturnType<typeof useChoreographyProgressValue>;
    let lifetime!: ScreenAnimationLifetime;
    const renders = jest.fn();
    const clock = makeMutable(0);
    const controls = { progress: clock, settleTransition: jest.fn() };
    const actions = {
      registerScreenPresentation: (_id, _ref, screenLifetime) => {
        lifetime = screenLifetime!;
        return () => {};
      },
    } as ChoreographyActionsType;
    const Consumer = memo(({ label }: { label: string }) => {
      value = useChoreographyProgressValue();
      renders(label);
      return null;
    });
    async function render(
      session: TransitionSessionData | null,
      pending: string | null,
      label = 'first'
    ) {
      const context = {
        activeSession: session,
        pendingTargetScreenId: pending,
        progress: clock,
      } as unknown as ChoreographyContextType;
      const content = (
        <ChoreographyActionsContext.Provider value={actions}>
          <ChoreographyControlsContext.Provider value={controls}>
            <ChoreographyContext.Provider value={context}>
              <ChoreographyScreenBase screenId="detail">
                <Consumer label={label} />
              </ChoreographyScreenBase>
            </ChoreographyContext.Provider>
          </ChoreographyControlsContext.Provider>
        </ChoreographyActionsContext.Provider>
      );
      await act(async () => {
        if (tree) tree.update(content);
        else tree = create(content);
      });
    }
    const session = {
      id: 'session',
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
      state: 'measuring',
      pairs: [],
    } as unknown as TransitionSessionData;
    jest.spyOn(global, 'requestAnimationFrame').mockReturnValue(1);
    try {
      await render(null, null);
      const initialValue = value;
      await render(null, 'detail');
      await render(session, 'detail');
      await render({ ...session, state: 'active' }, null);
      clock.value = 0.85;
      expect(value.value).toBe(0.85);
      await render({ ...session, state: 'completing' }, null);
      await render(null, null);
      await render({ ...session, id: 'other', groupId: 'other' }, null);
      expect(value).toBe(initialValue);
      expect(renders).toHaveBeenCalledTimes(1);
      await render(null, null, 'updated');
      expect(renders).toHaveBeenLastCalledWith('updated');
      expect(renders).toHaveBeenCalledTimes(2);

      const suspended = lifetime.suspend(1);
      clock.value = 0.2;
      expect(value.value).toBe(platform === 'android' ? 0.85 : 0.2);
      lifetime.resume(1);
      expect(value.value).toBe(0.2);
      await act(async () => tree.unmount());
      await suspended;
    } finally {
      await act(async () => tree?.unmount());
      Platform.OS = originalOS;
      jest.restoreAllMocks();
    }
  }
);

test('reads the provider clock without allocating an animated style', async () => {
  const clock = makeMutable(0.4);
  let value!: ReturnType<typeof useChoreographyProgressValue>;
  function Consumer() {
    value = useChoreographyProgressValue();
    return null;
  }
  let tree!: ReactTestRenderer;
  (useAnimatedStyle as jest.Mock).mockClear();
  try {
    await act(async () => {
      tree = create(
        <ChoreographyControlsContext.Provider
          value={{ progress: clock, settleTransition: jest.fn() }}
        >
          <Consumer />
        </ChoreographyControlsContext.Provider>
      );
    });
    expect(value).toBe(clock);
    expect(useAnimatedStyle).not.toHaveBeenCalled();
  } finally {
    await act(async () => tree?.unmount());
  }
});
