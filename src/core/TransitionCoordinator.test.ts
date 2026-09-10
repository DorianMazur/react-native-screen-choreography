import { Platform } from 'react-native';
import * as measurement from './measurement';
import { TransitionCoordinator } from './TransitionCoordinator';
import { ElementRegistry } from './ElementRegistry';
import type {
  ElementMetrics,
  ElementPresentation,
  RegisteredElement,
  SharedElementTransition,
  TransitionSessionData,
} from '../types';

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
  presentationState: { current: ElementPresentation }
): RegisteredElement {
  return {
    id: 'card',
    groupId: 'group',
    screenId: 'list',
    ref: refWithMetrics({ pageX: 0, pageY: 0, width: 50, height: 50 }),
    metrics: null,
    getPresentation: () => presentationState.current,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('TransitionCoordinator validated measurement reuse', () => {
  let registry: ElementRegistry;
  let coordinator: TransitionCoordinator;
  const sourceMetrics = { pageX: 10, pageY: 20, width: 50, height: 50 };
  const targetMetrics = { pageX: 0, pageY: 0, width: 200, height: 200 };
  const config = {
    groupId: 'group',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    direction: 'forward' as const,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'ios');
    registry = new ElementRegistry();
    coordinator = new TransitionCoordinator(registry, { value: 0 } as any);
  });

  afterEach(() => {
    coordinator.dispose();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function registerTarget(ref: RegisteredElement['ref']) {
    registry.register(
      makeElement(
        { screenId: 'detail', ref },
        { current: { metadata: null, transition } }
      )
    );
  }

  function registerSource(metrics: ElementMetrics | null = sourceMetrics) {
    registry.register(
      makeElement(
        { screenId: 'list', metrics, ref: refWithMetrics(sourceMetrics) },
        { current: { metadata: null, transition } }
      )
    );
  }

  async function start() {
    const pending = coordinator.startTransition(config);
    await jest.runAllTimersAsync();
    return pending;
  }

  test.each([
    ['ios', 3],
    ['android', 5],
  ] as const)(
    'pairs with the final stable batch on %s without an extra target read',
    async (platform, expectedReads) => {
      jest.replaceProperty(Platform, 'OS', platform);
      registerSource();
      let reads = 0;
      registerTarget(() => ({
        measureInWindow: (callback: Function) => {
          reads += 1;
          // Small changes satisfy the tolerance, but distinguish every batch.
          callback(reads * 0.1, 0, 200, 200);
        },
      }));
      const batches = jest.spyOn(measurement, 'measureElementsBatched');

      const session = await start();
      const finalBatch = await batches.mock.results.at(-1)!.value;

      expect(reads).toBe(expectedReads);
      expect(session?.pairs[0]?.targetMetrics).toBe(finalBatch.get('card'));
      expect(session?.pairs[0]?.targetMetrics.pageX).toBe(expectedReads * 0.1);
      expect(
        batches.mock.calls.every(([entries]) => entries[0]?.id === 'card')
      ).toBe(true);
    }
  );

  test('pairs with fresh cache-validation geometry rather than cached geometry', async () => {
    registerSource();
    const current = { ...targetMetrics };
    registerTarget(refWithMetrics(current));
    await start();
    coordinator.completeTransition();
    current.pageX = 0.25;
    const batches = jest.spyOn(measurement, 'measureElementsBatched');

    const session = await start();
    const validatedBatch = await batches.mock.results[0]!.value;

    expect(batches).toHaveBeenCalledTimes(1);
    expect(session?.pairs[0]?.targetMetrics).toBe(validatedBatch.get('card'));
    expect(session?.pairs[0]?.targetMetrics.pageX).toBe(0.25);
  });

  test('measures an uncached source without remeasuring the validated target', async () => {
    registerSource(null);
    registerTarget(refWithMetrics(targetMetrics));
    const batches = jest.spyOn(measurement, 'measureElementsBatched');

    const session = await start();
    const validatedBatch = await batches.mock.results[2]!.value;

    expect(batches.mock.calls.at(-1)![0].map(({ id }) => id)).toEqual([
      'source:card',
    ]);
    expect(session?.pairs[0]?.sourceMetrics).toEqual(sourceMetrics);
    expect(session?.pairs[0]?.targetMetrics).toBe(validatedBatch.get('card'));
  });

  test('invalid cache validation falls back to the full stability loop', async () => {
    registerSource();
    const current = { ...targetMetrics };
    let invalidNextRead = false;
    registerTarget(() => ({
      measureInWindow: (callback: Function) => {
        if (invalidNextRead) {
          invalidNextRead = false;
          callback(0, 0, 0, 0);
        } else {
          callback(current.pageX, current.pageY, current.width, current.height);
        }
      },
    }));
    await start();
    coordinator.completeTransition();
    invalidNextRead = true;
    current.width = 320;
    const batches = jest.spyOn(measurement, 'measureElementsBatched');

    const session = await start();
    const finalBatch = await batches.mock.results.at(-1)!.value;

    expect(batches).toHaveBeenCalledTimes(4);
    expect(session?.pairs[0]?.targetMetrics).toBe(finalBatch.get('card'));
    expect(session?.pairs[0]?.targetMetrics.width).toBe(320);
  });

  test.each([true, false])(
    'a stability timeout keeps the final read and registry fallback (valid final read: %s)',
    async (validFinalRead) => {
      registerSource();
      const startedAt = Date.now();
      let reads = 0;
      registerTarget(() => ({
        measureInWindow: (callback: Function) => {
          reads += 1;
          if (Date.now() - startedAt >= 500) {
            callback(
              999,
              0,
              validFinalRead ? 200 : 0,
              validFinalRead ? 200 : 0
            );
          } else {
            callback(reads, 0, 200, 200);
          }
        },
      }));
      const batches = jest.spyOn(measurement, 'measureElementsBatched');

      const session = await start();
      const finalBatch = await batches.mock.results.at(-1)!.value;
      const lastStabilityBatch = await batches.mock.results.at(-2)!.value;

      expect(batches.mock.calls.at(-1)![0].map(({ id }) => id)).toEqual([
        'target:card',
      ]);
      expect(session?.pairs[0]?.targetMetrics).toBe(
        validFinalRead
          ? finalBatch.get('target:card')
          : lastStabilityBatch.get('card')
      );
      expect(session?.pairs[0]?.targetMetrics.pageX).toBe(
        validFinalRead ? 999 : reads - 1
      );
    }
  );

  test('failed stability and final reads do not manufacture a valid pair', async () => {
    registerSource();
    registerTarget(() => ({
      measureInWindow: (callback: Function) => callback(0, 0, 0, 0),
    }));
    const onUnavailable = jest.fn();
    const batches = jest.spyOn(measurement, 'measureElementsBatched');

    const pending = coordinator.startTransition({ ...config, onUnavailable });
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toBeNull();
    expect(batches.mock.calls.at(-1)![0][0]?.id).toBe('target:card');
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });

  test('a replaced target is remeasured after the old ref validates', async () => {
    registerSource();
    let replaceDuringRead = false;
    const replacementMetrics = { ...targetMetrics, width: 320 };
    registerTarget(() => ({
      measureInWindow: (callback: Function) => {
        if (replaceDuringRead) {
          replaceDuringRead = false;
          registerTarget(refWithMetrics(replacementMetrics));
        }
        callback(0, 0, 200, 200);
      },
    }));
    await start();
    coordinator.completeTransition();
    replaceDuringRead = true;
    const batches = jest.spyOn(measurement, 'measureElementsBatched');

    const session = await start();

    expect(batches).toHaveBeenCalledTimes(2);
    expect(batches.mock.calls[1]![0][0]?.id).toBe('target:card');
    expect(session?.pairs[0]?.targetMetrics).toEqual(replacementMetrics);
  });

  test('cancellation during a target batch cannot reactivate the session', async () => {
    registerSource();
    registerTarget(() => ({
      measureInWindow: (callback: Function) => {
        coordinator.cancelTransition();
        callback(0, 0, 200, 200);
      },
    }));
    const batches = jest.spyOn(measurement, 'measureElementsBatched');

    await expect(start()).resolves.toBeNull();
    expect(batches).toHaveBeenCalledTimes(1);
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });
});

describe('TransitionCoordinator presentation freezing', () => {
  let registry: ElementRegistry;
  let progress: { value: number };
  let coordinator: TransitionCoordinator;

  beforeEach(() => {
    registry = new ElementRegistry();
    progress = { value: 0 };
    coordinator = new TransitionCoordinator(registry, progress as any);
  });

  test('captures source/target presentations once at session start', async () => {
    const liveValue = { value: 0 };
    const sourcePresentation: { current: ElementPresentation } = {
      current: {
        metadata: 'source-v1',
        style: { backgroundColor: 'red' },
        transition,
        metadata: { revision: 1, liveValue },
      },
    };
    const targetPresentation: { current: ElementPresentation } = {
      current: {
        metadata: 'target-v1',
        style: { backgroundColor: 'blue' },
        transition,
        metadata: { revision: 10 },
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
        sourcePresentation
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
        targetPresentation
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

    // Frozen presentations are stored on the pair.
    expect(pair.sourcePresentation.metadata).toBe('source-v1');
    expect(pair.targetPresentation.metadata).toBe('target-v1');
    expect(pair.sourcePresentation.style?.backgroundColor).toBe('red');
    expect(pair.targetPresentation.style?.backgroundColor).toBe('blue');
    expect(pair.sourcePresentation.metadata).toEqual({
      revision: 1,
      liveValue,
    });
    expect(pair.targetPresentation.metadata).toEqual({ revision: 10 });

    // Mutating the underlying SharedElement state AFTER the session started
    // must NOT affect what the overlay renders — the snapshot is frozen.
    sourcePresentation.current = {
      metadata: 'source-v2',
      style: { backgroundColor: 'green' },
      transition,
      metadata: { revision: 2, liveValue: { value: 999 } },
    };
    targetPresentation.current = {
      metadata: 'target-v2',
      style: { backgroundColor: 'yellow' },
      transition,
      metadata: { revision: 11 },
    };

    expect(pair.sourcePresentation.metadata).toBe('source-v1');
    expect(pair.targetPresentation.metadata).toBe('target-v1');
    expect(pair.sourcePresentation.style?.backgroundColor).toBe('red');
    expect(pair.targetPresentation.style?.backgroundColor).toBe('blue');
    expect(pair.sourcePresentation.metadata).toEqual({
      revision: 1,
      liveValue,
    });
    expect(pair.targetPresentation.metadata).toEqual({ revision: 10 });

    // Frozen metadata can deliberately retain a SharedValue-like live ref.
    liveValue.value = 0.625;
    expect(
      (pair.sourcePresentation.metadata as { liveValue: { value: number } })
        .liveValue.value
    ).toBe(0.625);
  }, 5000);

  test('hidden elements are released after completeTransition', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
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
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
    expect(coordinator.getSettledScreenId()).toBe('detail');
  }, 5000);

  test('live pairs are never hidden because the real view is what animates', async () => {
    const liveTransition: SharedElementTransition = {
      renderer: () => null,
      mode: 'live',
    };
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition: liveTransition },
    };
    const targetTransition: SharedElementTransition = {
      renderer: () => null,
      mode: 'standin',
    };
    const targetSnap: { current: ElementPresentation } = {
      current: { metadata: null, transition: targetTransition },
    };

    registry.register(
      makeElement(
        {
          id: 'player',
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
          id: 'player',
          groupId: 'group',
          screenId: 'detail',
          ref: refWithMetrics({ pageX: 0, pageY: 0, width: 100, height: 100 }),
          metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
        },
        targetSnap
      )
    );

    const session = await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });

    expect(session?.pairs).toHaveLength(1);
    expect(session?.pairs[0]?.transition).toBe(liveTransition);
    expect(session?.pairs[0]?.targetPresentation.transition).toBe(
      targetTransition
    );
    expect(coordinator.getHiddenElements().size).toBe(0);
  }, 5000);

  test('backward pairing selects the departing detail transition', async () => {
    const listTransition: SharedElementTransition = {
      renderer: () => null,
      mode: 'live',
    };
    const detailTransition: SharedElementTransition = {
      renderer: () => null,
      mode: 'live',
    };
    const register = (
      screenId: string,
      selectedTransition: SharedElementTransition
    ) => {
      const presentation = {
        current: { metadata: null, transition: selectedTransition },
      };
      registry.register(
        makeElement(
          {
            id: 'player',
            groupId: 'group',
            screenId,
            metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
          },
          presentation
        )
      );
    };
    register('list', listTransition);
    register('detail', detailTransition);

    const backward = await coordinator.startTransition({
      groupId: 'group',
      sourceScreenId: 'detail',
      targetScreenId: 'list',
      direction: 'backward',
    });

    expect(backward?.pairs[0]?.transition).toBe(detailTransition);
    expect(backward?.pairs[0]?.source.screenId).toBe('detail');
    expect(backward?.pairs[0]?.target.screenId).toBe('list');
    expect(coordinator.getHiddenElements().size).toBe(0);
  });

  test('cancelTransition also releases hidden elements', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
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
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
    expect(coordinator.getSettledScreenId()).toBe('list');
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
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
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

  test('cancelled preparation cannot reactivate after target registration', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
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

    coordinator.cancelTransition();
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

    await expect(sessionPromise).resolves.toBeNull();
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  }, 5000);

  test('cancelled preparation cannot reactivate after stable measurement', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
    };
    const stability = deferred<Map<string, unknown>>();
    (coordinator as any).waitForStableTargetMeasurements = jest.fn(
      () => stability.promise
    );

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
      makeElement(
        {
          screenId: 'detail',
          metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
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
    await Promise.resolve();

    coordinator.cancelTransition();
    stability.resolve(new Map());

    await expect(sessionPromise).resolves.toBeNull();
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });

  test.each(['first', 'second'] as const)(
    'keeps the replacement session when the superseded start finishes %s',
    async (staleFinishOrder) => {
      const snap: { current: ElementPresentation } = {
        current: { metadata: null, transition },
      };
      const firstStability = deferred<Map<string, unknown>>();
      const secondStability = deferred<Map<string, unknown>>();
      (coordinator as any).waitForStableTargetMeasurements = jest.fn(
        (targetScreenId: string) =>
          targetScreenId === 'first-detail'
            ? firstStability.promise
            : secondStability.promise
      );

      for (const [id, groupId, sourceScreenId, targetScreenId] of [
        ['first-card', 'first-group', 'first-list', 'first-detail'],
        ['second-card', 'second-group', 'second-list', 'second-detail'],
      ] as const) {
        registry.register(
          makeElement(
            {
              id,
              groupId,
              screenId: sourceScreenId,
              metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
            },
            snap
          )
        );
        registry.register(
          makeElement(
            {
              id,
              groupId,
              screenId: targetScreenId,
              metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
            },
            snap
          )
        );
      }

      const firstSessionPromise = coordinator.startTransition({
        groupId: 'first-group',
        sourceScreenId: 'first-list',
        targetScreenId: 'first-detail',
        direction: 'forward',
      });
      await Promise.resolve();
      const secondSessionPromise = coordinator.startTransition({
        groupId: 'second-group',
        sourceScreenId: 'second-list',
        targetScreenId: 'second-detail',
        direction: 'forward',
      });
      await Promise.resolve();

      if (staleFinishOrder === 'first') {
        firstStability.resolve(new Map());
        await expect(firstSessionPromise).resolves.toBeNull();
        secondStability.resolve(new Map());
      } else {
        secondStability.resolve(new Map());
      }

      const secondSession = await secondSessionPromise;
      if (staleFinishOrder === 'second') {
        firstStability.resolve(new Map());
        await expect(firstSessionPromise).resolves.toBeNull();
      }

      expect(secondSession?.targetScreenId).toBe('second-detail');
      expect(coordinator.getActiveSession()?.id).toBe(secondSession?.id);
      expect(coordinator.getHiddenElements().size).toBe(2);
    }
  );

  test('stale empty-pair cleanup cannot clear a replacement session', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
    };
    const firstStability = deferred<Map<string, unknown>>();
    const secondStability = deferred<Map<string, unknown>>();
    (coordinator as any).waitForStableTargetMeasurements = jest.fn(
      (targetScreenId: string) =>
        targetScreenId === 'first-detail'
          ? firstStability.promise
          : secondStability.promise
    );

    for (const [id, groupId, sourceScreenId, targetScreenId] of [
      ['first-card', 'first-group', 'first-list', 'first-detail'],
      ['second-card', 'second-group', 'second-list', 'second-detail'],
    ] as const) {
      registry.register(
        makeElement(
          {
            id,
            groupId,
            screenId: sourceScreenId,
            metrics: { pageX: 0, pageY: 0, width: 50, height: 50 },
          },
          snap
        )
      );
      registry.register(
        makeElement(
          {
            id,
            groupId,
            screenId: targetScreenId,
            metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
          },
          snap
        )
      );
    }

    const firstSessionPromise = coordinator.startTransition({
      groupId: 'first-group',
      sourceScreenId: 'first-list',
      targetScreenId: 'first-detail',
      direction: 'forward',
    });
    await Promise.resolve();
    const secondSessionPromise = coordinator.startTransition({
      groupId: 'second-group',
      sourceScreenId: 'second-list',
      targetScreenId: 'second-detail',
      direction: 'forward',
    });
    await Promise.resolve();

    secondStability.resolve(new Map());
    const secondSession = await secondSessionPromise;
    registry.unregister('first-card', 'first-detail', 'first-group');
    firstStability.resolve(new Map());

    await expect(firstSessionPromise).resolves.toBeNull();
    expect(coordinator.getActiveSession()?.id).toBe(secondSession?.id);
    expect(coordinator.getHiddenElements().size).toBe(2);
  });

  test('disposal invalidates preparation before it can activate', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
    };
    const stability = deferred<Map<string, unknown>>();
    (coordinator as any).waitForStableTargetMeasurements = jest.fn(
      () => stability.promise
    );
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
      makeElement(
        {
          screenId: 'detail',
          metrics: { pageX: 0, pageY: 0, width: 100, height: 100 },
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
    await Promise.resolve();

    coordinator.dispose();
    stability.resolve(new Map());

    await expect(sessionPromise).resolves.toBeNull();
    expect(coordinator.getActiveSession()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });

  test('discovers pair ids only from the source screen group', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
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

  test.each([false, true])(
    'repeated transitions validate cached metrics with fewer reads (new instance: %s)',
    async (newInstance) => {
      coordinator = new TransitionCoordinator(
        registry,
        progress as any,
        (screenId) => (screenId.startsWith('detail') ? 'detail' : screenId)
      );
      const snap: { current: ElementPresentation } = {
        current: { metadata: null, transition },
      };
      const target = countingRef({
        pageX: 0,
        pageY: 0,
        width: 200,
        height: 200,
      });

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

      const nextTargetScreenId = newInstance ? 'detail-next' : 'detail';
      if (newInstance) {
        registry.unregister('card', 'detail', 'group');
        registry.register(
          makeElement({ screenId: nextTargetScreenId, ref: target.ref }, snap)
        );
      }
      await coordinator.startTransition({
        groupId: 'group',
        sourceScreenId: 'list',
        targetScreenId: nextTargetScreenId,
        direction: 'forward',
      });
      coordinator.completeTransition();

      // Hot path reuses the single cache-validation read for pairing.
      expect(target.state.calls).toBeLessThan(firstRunReads);
      expect(target.state.calls).toBe(1);
    },
    5000
  );

  test('stale cached target metrics fall back to fresh measurement', async () => {
    const snap: { current: ElementPresentation } = {
      current: { metadata: null, transition },
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
