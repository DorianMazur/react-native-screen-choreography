import { TransitionCoordinator } from '../src/TransitionCoordinator';
import { ElementRegistry } from '../src/ElementRegistry';
import type {
  ElementSnapshot,
  RegisteredElement,
  SharedElementTransition,
  TransitionSessionData,
} from '../src/types';

const transition: SharedElementTransition = { renderer: () => null };

function refWithMetrics(metrics: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}) {
  const node = {
    measureInWindow: (cb: Function) => {
      cb(metrics.pageX, metrics.pageY, metrics.width, metrics.height);
    },
  };
  return () => node;
}

function makeElement(
  overrides: Partial<RegisteredElement>,
  snapshotState: { current: ElementSnapshot }
): RegisteredElement {
  return {
    id: 'card',
    groupId: 'group',
    screenId: 'list',
    ref: refWithMetrics({ pageX: 0, pageY: 0, width: 50, height: 50 }),
    metrics: null,
    getSnapshot: () => snapshotState.current,
    ...overrides,
  };
}

describe('TransitionCoordinator snapshot freezing', () => {
  let registry: ElementRegistry;
  let progress: { value: number };
  let coordinator: TransitionCoordinator;

  beforeEach(() => {
    registry = new ElementRegistry();
    progress = { value: 0 };
    coordinator = new TransitionCoordinator(registry, progress as any);
  });

  test('captures source/target snapshots once at session start', async () => {
    const sourceSnap: { current: ElementSnapshot } = {
      current: {
        content: 'source-v1',
        style: { backgroundColor: 'red' },
        transition,
      },
    };
    const targetSnap: { current: ElementSnapshot } = {
      current: {
        content: 'target-v1',
        style: { backgroundColor: 'blue' },
        transition,
      },
    };

    registry.register(
      makeElement(
        {
          id: 'card',
          groupId: 'group',
          screenId: 'list',
          ref: refWithMetrics({
            pageX: 10,
            pageY: 20,
            width: 100,
            height: 50,
          }),
          metrics: { pageX: 10, pageY: 20, width: 100, height: 50 },
        },
        sourceSnap
      )
    );
    registry.register(
      makeElement(
        {
          id: 'card',
          groupId: 'group',
          screenId: 'detail',
          ref: refWithMetrics({
            pageX: 0,
            pageY: 0,
            width: 320,
            height: 200,
          }),
          metrics: { pageX: 0, pageY: 0, width: 320, height: 200 },
        },
        targetSnap
      )
    );

    let observedSession: TransitionSessionData | null = null;
    coordinator.setOnSessionChange((session) => {
      if (session?.state === 'active') {
        observedSession = session;
      }
    });

    const session = await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    expect(session).not.toBeNull();
    expect(observedSession).not.toBeNull();
    const active = observedSession as unknown as TransitionSessionData;
    expect(active.pairs).toHaveLength(1);
    const pair = active.pairs[0]!;

    // Frozen snapshots are stored on the pair.
    expect(pair.sourceSnapshot.content).toBe('source-v1');
    expect(pair.targetSnapshot.content).toBe('target-v1');
    expect(pair.sourceSnapshot.style?.backgroundColor).toBe('red');
    expect(pair.targetSnapshot.style?.backgroundColor).toBe('blue');

    // Mutating the underlying SharedElement state AFTER the session started
    // must NOT affect what the overlay renders — the snapshot is frozen.
    sourceSnap.current = {
      content: 'source-v2',
      style: { backgroundColor: 'green' },
      transition,
    };
    targetSnap.current = {
      content: 'target-v2',
      style: { backgroundColor: 'yellow' },
      transition,
    };

    expect(pair.sourceSnapshot.content).toBe('source-v1');
    expect(pair.targetSnapshot.content).toBe('target-v1');
    expect(pair.sourceSnapshot.style?.backgroundColor).toBe('red');
    expect(pair.targetSnapshot.style?.backgroundColor).toBe('blue');
  }, 5000);

  test('hidden elements are released after completeTransition', async () => {
    const snap: { current: ElementSnapshot } = {
      current: { content: null, transition },
    };

    registry.register(
      makeElement(
        {
          id: 'card',
          groupId: 'group',
          screenId: 'list',
          ref: refWithMetrics({ pageX: 0, pageY: 0, width: 50, height: 50 }),
          metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
        },
        snap
      )
    );
    registry.register(
      makeElement(
        {
          id: 'card',
          groupId: 'group',
          screenId: 'detail',
          ref: refWithMetrics({ pageX: 0, pageY: 0, width: 100, height: 100 }),
          metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
        },
        snap
      )
    );

    await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    expect(coordinator.getHiddenElements().size).toBe(2);

    coordinator.completeTransition();
    expect(coordinator.getHiddenElements().size).toBe(0);
  }, 5000);

  test('cancelTransition also releases hidden elements', async () => {
    const snap: { current: ElementSnapshot } = {
      current: { content: null, transition },
    };

    registry.register(
      makeElement(
        {
          id: 'card',
          groupId: 'group',
          screenId: 'list',
          ref: refWithMetrics({ pageX: 0, pageY: 0, width: 50, height: 50 }),
          metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
        },
        snap
      )
    );
    registry.register(
      makeElement(
        {
          id: 'card',
          groupId: 'group',
          screenId: 'detail',
          ref: refWithMetrics({ pageX: 0, pageY: 0, width: 100, height: 100 }),
          metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
        },
        snap
      )
    );

    await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    expect(coordinator.getHiddenElements().size).toBe(2);

    coordinator.cancelTransition();
    expect(coordinator.getHiddenElements().size).toBe(0);
  }, 5000);
});
