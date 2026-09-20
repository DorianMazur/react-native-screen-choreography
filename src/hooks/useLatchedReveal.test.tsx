import { useContext, useEffect, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  ChoreographyControlsContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import {
  ChoreographyProgressContext,
  ChoreographyProgressProvider,
} from '../core/ChoreographyProgressContext';
import { ScreenIdContext } from '../core/screenIdContext';
import type { TransitionSessionData } from '../types';
import { useLatchedReveal } from './useChoreographyProgress';

const mockReactions = new Set<() => void>();
const mockRNQueue: (() => void)[] = [];
let mockOnUI = false;
let mockProgress = 0;

jest.mock('react-native-reanimated', () => {
  const { useEffect: effect, useRef: ref } = jest.requireActual('react');
  return {
    ...jest.requireActual('../../__mocks__/react-native-reanimated'),
    __esModule: true,
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (next: unknown, previous: unknown) => void,
      dependencies: unknown[]
    ) => {
      // Reanimated retains the previous result when it replaces a mapper.
      const previous = ref(null);
      effect(() => {
        const flush = () => {
          mockOnUI = true;
          try {
            const next = prepare();
            react(next, previous.current);
            previous.current = next;
          } finally {
            mockOnUI = false;
          }
        };
        mockReactions.add(flush);
        flush();
        return () => {
          mockReactions.delete(flush);
        };
      }, dependencies);
    },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: () => void) => mockRNQueue.push(fn),
}));

const controls = {
  progress: {
    get value() {
      if (!mockOnUI) throw new Error('Progress read synchronously on RN');
      return mockProgress;
    },
  } as ChoreographyContextType['progress'],
  settleTransition: jest.fn(),
};
const mounts = jest.fn();
const unmounts = jest.fn();
let visible: boolean;
let observedState: unknown;
let tree: ReactTestRenderer | undefined;

function ExpensiveSection() {
  useEffect(() => {
    mounts();
    return () => {
      unmounts();
    };
  }, []);
  return null;
}

function Content({ config }: { config: RevealConfig }) {
  observedState = useContext(ChoreographyProgressContext);
  visible = useLatchedReveal(config);
  return visible ? <ExpensiveSection /> : null;
}

type RevealConfig = Parameters<typeof useLatchedReveal>[0];
interface RenderOptions {
  session?: TransitionSessionData | null;
  pending?: string | null;
  config?: RevealConfig;
}

function Harness({
  children,
  session: activeSession,
  pending,
}: RenderOptions & { children: ReactNode }) {
  return (
    <ChoreographyContext.Provider
      value={
        {
          activeSession: activeSession ?? null,
          pendingTargetScreenId: pending ?? null,
        } as ChoreographyContextType
      }
    >
      <ChoreographyControlsContext.Provider value={controls}>
        <ScreenIdContext.Provider value="detail">
          <ChoreographyProgressProvider>
            {children}
          </ChoreographyProgressProvider>
        </ScreenIdContext.Provider>
      </ChoreographyControlsContext.Provider>
    </ChoreographyContext.Provider>
  );
}

function session(
  overrides: Partial<TransitionSessionData> = {}
): TransitionSessionData {
  return {
    id: 'forward-1',
    groupId: 'card',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    direction: 'forward',
    state: 'active',
    pairs: [],
    progress: controls.progress,
    ...overrides,
  };
}

async function render(options: RenderOptions = {}) {
  const element = (
    <Harness {...options}>
      <Content config={options.config} />
    </Harness>
  );
  await act(async () => {
    if (tree) tree.update(element);
    else tree = create(element);
  });
}

async function runRN() {
  await act(async () => {
    mockRNQueue.splice(0).forEach((callback) => callback());
  });
}

async function advanceProgress(value: number) {
  mockProgress = value;
  mockReactions.forEach((flush) => flush());
  await runRN();
}

beforeEach(() => {
  mounts.mockClear();
  unmounts.mockClear();
  mockProgress = 0;
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  mockRNQueue.length = 0;
  mockReactions.clear();
});

test.each([0, 1])(
  'pending destinations omit companion content with progress %s',
  async (value) => {
    mockProgress = value;
    await render({ pending: 'detail' });
    await runRN();
    expect(observedState).toMatchObject({
      isPendingTarget: true,
      phase: 'preparing',
      isActive: false,
    });
    expect(visible).toBe(false);
    expect(mounts).not.toHaveBeenCalled();
  }
);

test('a preparing forward target stays closed after its pending flag clears', async () => {
  mockProgress = 1;
  await render({ session: session({ state: 'preparing' }) });
  await runRN();
  expect(visible).toBe(false);
  expect(mounts).not.toHaveBeenCalled();
});

test('first navigation mounts content once at its threshold and keeps it during reverse', async () => {
  const forward = session();
  await render({ pending: 'detail' });
  await render({ session: forward, pending: 'detail' });
  await render({ session: forward });
  await advanceProgress(0.69);
  expect(mounts).not.toHaveBeenCalled();

  await advanceProgress(0.7);
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(1);
  await advanceProgress(1);
  await render();
  await render({
    session: session({
      id: 'back-1',
      direction: 'backward',
      sourceScreenId: 'detail',
      targetScreenId: 'list',
    }),
  });
  await advanceProgress(0.2);
  await advanceProgress(0);
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(1);
  expect(unmounts).not.toHaveBeenCalled();
});

test('a late-mounted active companion checks its current threshold on UI', async () => {
  mockProgress = 0.85;
  await render({ session: session() });
  expect(visible).toBe(false);
  expect(mockRNQueue).toHaveLength(1);
  await runRN();
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(1);
});

test('standalone and fallback destinations are readable without a session', async () => {
  await render({ pending: 'detail' });
  expect(visible).toBe(false);
  await render();
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(1);
});

test('visibleWhenInactive false ignores stale progress without an active session', async () => {
  mockProgress = 1;
  await render({ config: { visibleWhenInactive: false } });
  await runRN();
  expect(visible).toBe(false);
  expect(mounts).not.toHaveBeenCalled();
});

test('unrelated transitions do not close or reveal screen-scoped content', async () => {
  await render();
  const unrelated = session({
    sourceScreenId: 'other',
    targetScreenId: 'next',
  });
  await render({ session: unrelated });
  await advanceProgress(1);
  expect(visible).toBe(true);
  expect(unmounts).not.toHaveBeenCalled();
  await render({ session: unrelated, config: { visibleWhenInactive: false } });
  await runRN();
  expect(visible).toBe(true);
  await render({
    session: unrelated,
    config: { visibleWhenInactive: false, resetKey: 'new-content' },
  });
  expect(visible).toBe(false);
});

test('content shown at rest stays mounted when its screen becomes the outgoing source', async () => {
  await render();
  expect(mounts).toHaveBeenCalledTimes(1);
  await render({
    session: session({ sourceScreenId: 'detail', targetScreenId: 'next' }),
  });
  await advanceProgress(0);
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(1);
  expect(unmounts).not.toHaveBeenCalled();
});

test('a reused destination retains visible content until its resetKey changes', async () => {
  const config = { resetKey: 'same-item' };
  await render({ config });
  await render({ pending: 'detail', config });
  expect(visible).toBe(true);
  await render({ session: session(), config });
  await advanceProgress(0);
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(1);
  expect(unmounts).not.toHaveBeenCalled();

  await render({ pending: 'detail', config: { resetKey: 'new-item' } });
  expect(visible).toBe(false);
  expect(unmounts).toHaveBeenCalledTimes(1);
  await render({ session: session(), config: { resetKey: 'new-item' } });
  await runRN();
  expect(visible).toBe(false);
});

test('resetKey closes an opened latch until its new threshold is reached', async () => {
  const active = session();
  await render({ session: active, config: { resetKey: 'first' } });
  await advanceProgress(0.8);
  expect(visible).toBe(true);
  await advanceProgress(0.2);
  expect(visible).toBe(true);
  await render({ session: active, config: { resetKey: 'second' } });
  expect(visible).toBe(false);
  expect(unmounts).toHaveBeenCalledTimes(1);
  await advanceProgress(0.8);
  expect(visible).toBe(true);
  expect(mounts).toHaveBeenCalledTimes(2);
});

test.each(['resetKey', 'session', 'startProgress'] as const)(
  'a queued reveal cannot outlive a changed %s',
  async (change) => {
    mockProgress = 0.8;
    await render({ session: session(), config: { resetKey: 'first' } });
    const obsolete = mockRNQueue.shift()!;
    expect(obsolete).toBeDefined();
    await render({
      session: session({
        id: change === 'session' ? 'forward-2' : 'forward-1',
      }),
      config: {
        resetKey: change === 'resetKey' ? 'second' : 'first',
        startProgress: change === 'startProgress' ? 0.75 : 0.7,
      },
    });
    // The fresh mapper must notify even when the previous one was already true.
    expect(mockRNQueue).toHaveLength(1);
    await act(async () => obsolete());
    expect(visible).toBe(false);
    expect(mounts).not.toHaveBeenCalled();
    await runRN();
    expect(visible).toBe(true);
    expect(mounts).toHaveBeenCalledTimes(1);
  }
);

test.each(['first', 'second'])(
  'a queued reveal cannot open a new pending destination with resetKey %s',
  async (resetKey) => {
    mockProgress = 1;
    await render({ session: session(), config: { resetKey: 'first' } });
    expect(mockRNQueue).toHaveLength(1);
    await render({ pending: 'detail', config: { resetKey } });
    await runRN();
    expect(visible).toBe(false);
    expect(mounts).not.toHaveBeenCalled();
    mockProgress = 0;
    await render({
      session: session({ id: 'forward-2' }),
      config: { resetKey },
    });
    await runRN();
    expect(visible).toBe(false);
  }
);

test('an opened latch survives inactive fallback being disabled and threshold changes', async () => {
  await render({ session: session(), config: { visibleWhenInactive: false } });
  await advanceProgress(0.8);
  await render({ config: { visibleWhenInactive: false, startProgress: 0.95 } });
  expect(visible).toBe(true);
  expect(unmounts).not.toHaveBeenCalled();
});
