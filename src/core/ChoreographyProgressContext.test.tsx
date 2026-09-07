import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  ChoreographyControlsContext,
  type ChoreographyContextType,
} from './ChoreographyContext';
import { ChoreographyScreenBase } from '../components/ChoreographyScreenBase';
import { useChoreographyProgress } from '../hooks/useChoreographyProgress';
import type { TransitionSessionData } from '../types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
}));

test('notifies progress consumers only when screen-visible session fields change', async () => {
  let tree!: ReactTestRenderer;
  let state!: ReturnType<typeof useChoreographyProgress>;
  const renders = jest.fn();
  function Consumer() {
    state = useChoreographyProgress();
    renders();
    return null;
  }
  const child = <Consumer />;
  const controls = {
    progress: { value: 0 } as ChoreographyContextType['progress'],
    settleTransition: jest.fn(),
  };
  const measuring = {
    id: 'session',
    groupId: 'group',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    direction: 'forward',
    state: 'measuring',
    pairs: [],
  } as unknown as TransitionSessionData;
  async function render(
    session: TransitionSessionData | null,
    pending: string | null
  ) {
    const context = {
      activeSession: session,
      pendingTargetScreenId: pending,
      progress: controls.progress,
    } as ChoreographyContextType;
    const content = (
      <ChoreographyControlsContext.Provider value={controls}>
        <ChoreographyContext.Provider value={context}>
          <ChoreographyScreenBase screenId="detail">
            {child}
          </ChoreographyScreenBase>
        </ChoreographyContext.Provider>
      </ChoreographyControlsContext.Provider>
    );
    await act(async () => {
      if (tree) tree.update(content);
      else tree = create(content);
    });
  }
  try {
    await render(null, null);
    expect(state.phase).toBe('idle');
    await render(null, 'detail');
    expect(state.phase).toBe('preparing');
    await render(measuring, 'detail');
    expect(state.role).toBe('target');
    const calls = renders.mock.calls.length;
    await render({ ...measuring, state: 'preparing' }, 'detail');
    await render({ ...measuring, state: 'active', pairs: [] }, 'detail');
    expect(renders).toHaveBeenCalledTimes(calls);
    await render({ ...measuring, state: 'active' }, null);
    expect(state.phase).toBe('active');
    expect(renders).toHaveBeenCalledTimes(calls + 1);
    await render({ ...measuring, state: 'active', pairs: [] }, null);
    expect(renders).toHaveBeenCalledTimes(calls + 1);
    await render({ ...measuring, state: 'cancelling' }, null);
    expect(state.phase).toBe('cancelling');
    await render(null, null);
    expect(state.phase).toBe('idle');
  } finally {
    await act(async () => tree?.unmount());
  }
});
