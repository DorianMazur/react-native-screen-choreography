import { TransitionCoordinator } from '../src/core/TransitionCoordinator';
import { ElementRegistry } from '../src/core/ElementRegistry';
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

describe('TransitionCoordinator readiness and metrics cache', () => {
  let registry: ElementRegistry;
  let progress: { value: number };
  let coordinator: TransitionCoordinator;

  beforeEach(() => {
    registry = new ElementRegistry();
    progress = { value: 0 };
    coordinator = new TransitionCoordinator(registry, progress as any);
  });

  function countingRef(metrics: {
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  }) {
    const state = { calls: 0, metrics };
    const node = {
      measureInWindow: (cb: Function) => {
        state.calls += 1;
        cb(
          state.metrics.pageX,
          state.metrics.pageY,
          state.metrics.width,
          state.metrics.height
        );
      },
    };
    return { ref: () => node, state };
  }

  test('pairs when the target registers after the transition starts', async () => {
    const snap: { current: ElementSnapshot } = {
      current: { content: null, transition },
    };

    registry.register(
      makeElement(
        {
          screenId: 'list',
          metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
        },
        snap
      )
    );

    const sessionPromise = coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    // Target mounts late — the event-driven wait must pick it up without
    // burning the full registration deadline.
    setTimeout(() => {
      registry.register(
        makeElement(
          {
            screenId: 'detail',
            ref: refWithMetrics({
              pageX: 0,
              pageY: 0,
              width: 200,
              height: 200,
            }),
          },
          snap
        )
      );
    }, 60);

    const session = await sessionPromise;

    expect(session).not.toBeNull();
    expect(session!.pairs).toHaveLength(1);
    expect(session!.pairs[0]!.targetMetrics).toEqual({
      pageX: 0,
      pageY: 0,
      width: 200,
      height: 200,
    });
  }, 5000);

  test('discovers pair ids only from the source screen group', async () => {
    const snap: { current: ElementSnapshot } = {
      current: { content: null, transition },
    };

    registry.register(
      makeElement(
        {
          id: 'card',
          screenId: 'list',
          metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
        },
        snap
      )
    );
    registry.register(
      makeElement(
        {
          id: 'card',
          screenId: 'detail',
          metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
        },
        snap
      )
    );
    registry.register(
      makeElement(
        {
          id: 'mounted-elsewhere',
          screenId: 'third-screen',
          metrics: { pageX: 0, pageY: 0, width: 20, height: 20 },
        },
        snap
      )
    );

    const session = await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    expect(session?.pairs.map((pair) => pair.id)).toEqual(['card']);
  }, 5000);

  test('repeated transitions validate cached target metrics with fewer reads', async () => {
    const snap: { current: ElementSnapshot } = {
      current: { content: null, transition },
    };
    const target = countingRef({ pageX: 0, pageY: 0, width: 200, height: 200 });

    const registerBoth = () => {
      registry.register(
        makeElement(
          {
            screenId: 'list',
            metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
          },
          snap
        )
      );
      registry.register(
        makeElement({ screenId: 'detail', ref: target.ref }, snap)
      );
    };

    registerBoth();
    await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });
    coordinator.completeTransition();

    const firstRunReads = target.state.calls;
    target.state.calls = 0;

    await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });
    coordinator.completeTransition();

    // Hot path: one cache-validation read plus the pairing re-measure,
    // instead of the multi-read stability loop.
    expect(target.state.calls).toBeLessThan(firstRunReads);
    expect(target.state.calls).toBeLessThanOrEqual(2);
  }, 5000);

  test('stale cached target metrics fall back to fresh measurement', async () => {
    const snap: { current: ElementSnapshot } = {
      current: { content: null, transition },
    };
    const target = countingRef({ pageX: 0, pageY: 0, width: 200, height: 200 });

    registry.register(
      makeElement(
        {
          screenId: 'list',
          metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
        },
        snap
      )
    );
    registry.register(
      makeElement({ screenId: 'detail', ref: target.ref }, snap)
    );

    await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });
    coordinator.completeTransition();

    // Target layout changed since the cached session.
    target.state.metrics = { pageX: 10, pageY: 30, width: 320, height: 240 };

    const session = await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    expect(session).not.toBeNull();
    expect(session!.pairs[0]!.targetMetrics).toEqual({
      pageX: 10,
      pageY: 30,
      width: 320,
      height: 240,
    });
  }, 5000);
});
