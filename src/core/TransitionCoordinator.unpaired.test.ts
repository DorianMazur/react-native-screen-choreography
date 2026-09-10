import { TransitionCoordinator } from './TransitionCoordinator';
import { ElementRegistry } from './ElementRegistry';
import { getElementIdentityKey } from './elementIdentity';
import type { ElementMetrics, SharedElementTransition } from '../types';

const shared: SharedElementTransition = { renderer: () => null };
const exit: SharedElementTransition = { ...shared, unpaired: 'collapsed' };
const enter: SharedElementTransition = { ...shared, unpaired: 'expanded' };
const both: SharedElementTransition = { ...shared, unpaired: 'either' };

describe('Declarative one-sided pairing', () => {
  let registry: ElementRegistry;
  let coordinator: TransitionCoordinator;
  const measurements = new Map<string, jest.Mock>();

  beforeEach(() => {
    jest.useFakeTimers();
    registry = new ElementRegistry();
    coordinator = new TransitionCoordinator(registry, { value: 0 } as never);
    measurements.clear();
  });
  afterEach(() => {
    coordinator.dispose();
    jest.useRealTimers();
  });

  function register(
    id: string,
    screenId: string,
    transition = shared,
    groupId = 'article'
  ) {
    const metrics: ElementMetrics = {
      pageX: 10,
      pageY: 20,
      width: 120,
      height: 40,
    };
    const measureInWindow = jest.fn((callback: (...values: number[]) => void) =>
      callback(metrics.pageX, metrics.pageY, metrics.width, metrics.height)
    );
    measurements.set(`${screenId}:${id}`, measureInWindow);
    registry.register({
      id,
      screenId,
      groupId,
      ref: () => ({ measureInWindow }),
      metrics: null,
      getTransition: () => transition,
      getPresentation: () => ({ content: `${screenId}:${id}`, transition }),
    });
  }

  async function start(direction: 'forward' | 'backward' = 'forward') {
    const sourceScreenId = direction === 'forward' ? 'list' : 'detail';
    const targetScreenId = direction === 'forward' ? 'detail' : 'list';
    await coordinator.preMeasureGroup('article', sourceScreenId);
    const pending = coordinator.startTransition({
      groupId: 'article',
      sourceScreenId,
      targetScreenId,
      direction,
    });
    await jest.advanceTimersByTimeAsync(1200);
    return pending;
  }

  test.each(['forward', 'backward'] as const)(
    'pairs shared, entering, and exiting roles on %s without registering fake views',
    async (direction) => {
      register('surface', 'list');
      register('surface', 'detail');
      register('assets', 'list', exit);
      register('controls', 'detail', enter);
      register('unrelated', 'detail', enter, 'other-article');

      const session = await start(direction);
      expect(session?.pairs.map((pair) => pair.id).sort()).toEqual([
        'assets',
        'controls',
        'surface',
      ]);
      expect(registry.size).toBe(5);
      const assets = session!.pairs.find((pair) => pair.id === 'assets')!;
      const controls = session!.pairs.find((pair) => pair.id === 'controls')!;
      const sourceIsCollapsed = direction === 'forward';
      expect(assets.sourcePresent).toBe(sourceIsCollapsed);
      expect(assets.targetPresent).toBe(!sourceIsCollapsed);
      expect(controls.sourcePresent).toBe(!sourceIsCollapsed);
      expect(controls.targetPresent).toBe(sourceIsCollapsed);
      expect(
        (sourceIsCollapsed
          ? assets.targetPresentation
          : assets.sourcePresentation
        ).content
      ).toBeNull();
      expect(coordinator.getHiddenElements()).toEqual(
        new Set([
          getElementIdentityKey('list', 'article', 'surface'),
          getElementIdentityKey('detail', 'article', 'surface'),
          getElementIdentityKey('list', 'article', 'assets'),
          getElementIdentityKey('detail', 'article', 'controls'),
        ])
      );
      expect(measurements.get('detail:unrelated')).not.toHaveBeenCalled();

      // Refreshing a session does not measure or register its virtual endpoints.
      await coordinator.refreshActiveSessionMetrics('source');
      await coordinator.refreshActiveSessionMetrics('target');
      expect(
        registry.getByIdAndScreen('controls', 'list', 'article')
      ).toBeUndefined();
      expect(
        registry.getByIdAndScreen('assets', 'detail', 'article')
      ).toBeUndefined();
      coordinator.completeTransition(session!.id);
      expect(coordinator.getHiddenElements().size).toBe(0);
    }
  );

  test.each([
    ['forward', 'assets', 'list', exit],
    ['backward', 'assets', 'list', exit],
    ['forward', 'controls', 'detail', enter],
    ['backward', 'controls', 'detail', enter],
  ] as const)(
    'supports a %s session containing only %s',
    async (direction, id, screenId, transition) => {
      register(id, screenId, transition);
      const started = Date.now();
      const sourceScreenId = direction === 'forward' ? 'list' : 'detail';
      const pending = coordinator.startTransition({
        groupId: 'article',
        sourceScreenId,
        targetScreenId: direction === 'forward' ? 'detail' : 'list',
        direction,
      });
      let activatedAt: number | undefined;
      pending.then(() => {
        activatedAt = Date.now();
      });
      await jest.advanceTimersByTimeAsync(100);
      const session = await pending;
      expect(session?.pairs).toHaveLength(1);
      expect(activatedAt! - started).toBeLessThan(100);
      expect(coordinator.getHiddenElements().size).toBe(1);
    }
  );

  test('supports independent enter/exit content with either endpoint absent', async () => {
    register('metadata', 'list', both);
    expect((await start())?.pairs).toHaveLength(1);
    coordinator.cancelTransition();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });

  test('collects entering roles registered while awaiting a shared destination', async () => {
    register('surface', 'list');
    setTimeout(() => {
      register('controls', 'detail', enter);
      register('surface', 'detail');
    }, 20);
    expect((await start())?.pairs.map((pair) => pair.id).sort()).toEqual([
      'controls',
      'surface',
    ]);
  });

  test('does not grant missing endpoints to legacy transitions', async () => {
    register('unmatched', 'list');
    expect(await start()).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });

  test('does not treat an enter track on the collapsed screen as exit content', async () => {
    register('wrong-endpoint', 'list', enter);
    expect(await start()).toBeNull();
  });

  test('does not animate unpaired live payloads', async () => {
    register('live', 'list', { ...exit, mode: 'live' });
    expect(await start()).toBeNull();
  });

  test('revalidates the frozen pairing policy after asynchronous measurement', async () => {
    let transition = exit;
    let measured: ((...values: number[]) => void) | undefined;
    registry.register({
      id: 'assets',
      groupId: 'article',
      screenId: 'list',
      metrics: null,
      ref: () => ({
        measureInWindow: (callback: (...values: number[]) => void) => {
          measured = callback;
        },
      }),
      getTransition: () => transition,
      getPresentation: () => ({ content: 'assets', transition }),
    });
    const pending = coordinator.startTransition({
      groupId: 'article',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      direction: 'forward',
    });
    expect(measured).toBeDefined();
    transition = shared;
    measured!(10, 20, 100, 40);
    expect(await pending).toBeNull();
    expect(coordinator.getHiddenElements().size).toBe(0);
  });
});
