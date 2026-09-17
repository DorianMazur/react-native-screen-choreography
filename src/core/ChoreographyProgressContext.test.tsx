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
    expect(state.isPendingTarget).toBe(false);
    await render(null, 'detail');
    expect(state.phase).toBe('preparing');
    expect(state.isPendingTarget).toBe(true);
    await render(measuring, 'detail');
    expect(state.role).toBe('target');
    const calls = renders.mock.calls.length;
    await render({ ...measuring, state: 'preparing' }, 'detail');
    await render({ ...measuring, state: 'active', pairs: [] }, 'detail');
    expect(renders).toHaveBeenCalledTimes(calls);
    await render({ ...measuring, state: 'active' }, null);
    expect(state.phase).toBe('active');
    expect(state.isPendingTarget).toBe(false);
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

test('pending route names resolve to the focused screen instance before a session exists', async () => {
  let tree!: ReactTestRenderer;
  const states = new Map<string, ReturnType<typeof useChoreographyProgress>>();
  function Consumer({ id }: { id: string }) {
    states.set(id, useChoreographyProgress());
    return null;
  }
  const controls = {
    progress: { value: 1 } as ChoreographyContextType['progress'],
    settleTransition: jest.fn(),
  };
  const context = {
    activeSession: null,
    pendingTargetScreenId: 'detail',
    pendingSourceScreenId: 'detail.old',
    progress: controls.progress,
  } as ChoreographyContextType;
  try {
    await act(async () => {
      tree = create(
        <ChoreographyControlsContext.Provider value={controls}>
          <ChoreographyContext.Provider value={context}>
            <ChoreographyScreenBase
              screenId="detail"
              instanceId="detail.old"
              isFocused={false}
            >
              <Consumer id="old" />
            </ChoreographyScreenBase>
            <ChoreographyScreenBase screenId="detail" instanceId="detail.new">
              <Consumer id="new" />
            </ChoreographyScreenBase>
          </ChoreographyContext.Provider>
        </ChoreographyControlsContext.Provider>
      );
    });
    expect(states.get('new')).toMatchObject({
      isPendingTarget: true,
      role: 'inactive',
      phase: 'preparing',
    });
    expect(states.get('old')).toMatchObject({
      isPendingTarget: false,
      role: 'inactive',
      phase: 'idle',
    });
  } finally {
    await act(async () => tree?.unmount());
  }
});
