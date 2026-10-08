import { NavigationSessionController } from './NavigationSessionController';
import type {
  ChoreographyNavigationEvent,
  TransitionSessionData,
} from '../types';

function harness() {
  const controller = new NavigationSessionController();
  const events: ChoreographyNavigationEvent[] = [];
  const observer = controller.observeNavigation('list', 'Detail', (event) =>
    events.push(event)
  )!;
  const session = {
    id: 'opening',
    sourceScreenId: 'list',
    targetScreenId: 'detail:instance',
    groupId: 'group',
    direction: 'forward',
    state: 'active',
    pairs: [],
    progress: { value: 0 },
  } as unknown as TransitionSessionData;
  const args = {
    observer,
    groupId: 'group',
    sourceScreenId: 'list',
    targetScreenId: 'Detail',
    isAndroid: false,
    captureSourceGroup: async () => {},
    setPendingTargetScreen: jest.fn(),
    dispatchNavigation: jest.fn(),
    resolveTargetScreenId: async (): Promise<string | null> =>
      'detail:instance',
    waitForScreenReady: async () => true,
    waitForNextFrame: async () => {},
    startTransition: async () => {
      controller.setActiveSession(session);
      return session;
    },
    waitForOverlayReady: async () => true,
  };
  return { controller, observer, session, args, events };
}

test('queue replacement finalizes only the old request; replay keeps the request identity through completion', async () => {
  const { controller, observer, args, events } = harness();
  const nextEvents: ChoreographyNavigationEvent[] = [];
  const next = controller.observeNavigation('list', 'Detail', (e) =>
    nextEvents.push(e)
  )!;
  const request = {
    targetScreenId: 'Detail',
    sourceScreenId: 'list',
    dispatchNavigation: jest.fn(),
    observer,
  };
  controller.queueNavigation(request);
  controller.queueNavigation({ ...request, observer: next });
  expect(controller.takeQueuedNavigation()?.observer).toBe(next);
  next.emit({ status: 'started', finished: false });
  await controller.prepareForwardTransition({ ...args, observer: next });
  expect(nextEvents.map((e) => e.status)).toEqual(['queued', 'started']);
  controller.setActiveSession(null, 'detail:instance');
  controller.disposeRequests();
  await Promise.resolve();
  expect(events.map((e) => e.status)).toEqual(['queued', 'superseded']);
  expect(nextEvents.map((e) => e.status)).toEqual([
    'queued',
    'started',
    'completed',
  ]);
  expect(new Set(nextEvents.map((e) => e.requestId))).toEqual(
    new Set([next.id])
  );
  expect(next.id).not.toBe(observer.id);
  expect(nextEvents.at(-1)).toMatchObject({
    targetScreenId: 'detail:instance',
    sessionId: 'opening',
    finished: true,
  });
});

test.each([
  ['completed', 'detail:instance', false, true, undefined],
  ['cancelled', 'list', false, true, 'interrupted'],
  ['fallback', 'detail:instance', true, false, 'reduced-motion'],
  ['fallback', 'detail:instance', false, false, 'overlay-unavailable'],
] as const)(
  'session settlement reports %s at %s (reduced motion: %s, presented: %s)',
  async (status, settled, reducedMotion, presented, reason) => {
    const { controller, session, args, events } = harness();
    session.reducedMotion = reducedMotion;
    await controller.prepareForwardTransition(args);
    expect(events).toEqual([]);
    // Geometry and phase updates cannot complete the request.
    controller.setActiveSession({ ...session, pairs: [], state: 'completing' });
    expect(events).toEqual([]);
    controller.setActiveSession(null, settled, presented);
    controller.setActiveSession(null, settled, presented);
    await Promise.resolve();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status,
      finished: true,
      ...(reason ? { reason } : {}),
    });
  }
);

test('replacement and late completion cannot settle a newer request with the same endpoints', async () => {
  const { controller, session, args, events } = harness();
  await controller.prepareForwardTransition(args);
  controller.setActiveSession({ ...session, id: 'replacement' });
  const laterEvents: ChoreographyNavigationEvent[] = [];
  const later = controller.observeNavigation('list', 'Detail', (e) =>
    laterEvents.push(e)
  )!;
  await controller.prepareForwardTransition({
    ...args,
    observer: later,
    startTransition: async () => {
      const nextSession = { ...session, id: 'next' };
      controller.setActiveSession(nextSession);
      return nextSession;
    },
  });
  args.observer.emit({ status: 'completed', finished: true });
  await Promise.resolve();
  expect(events).toHaveLength(1);
  expect(events[0]?.status).toBe('cancelled');
  expect(laterEvents).toEqual([]);
  controller.setActiveSession(null, 'detail:instance');
  await Promise.resolve();
  expect(laterEvents).toHaveLength(1);
  expect(laterEvents[0]).toMatchObject({
    status: 'completed',
    sessionId: 'next',
  });
});

test.each(['queue-cleared', 'source-removed', 'provider-unmounted'] as const)(
  '%s releases pending observers exactly once, including late preparation',
  async (reason) => {
    const { controller, observer, args, events } = harness();
    controller.queueNavigation({
      targetScreenId: 'Detail',
      sourceScreenId: 'list',
      dispatchNavigation: jest.fn(),
      observer,
    });
    if (reason === 'queue-cleared') controller.clearQueuedNavigation();
    if (reason === 'source-removed') controller.cancelRequestsForScreen('list');
    if (reason === 'provider-unmounted') controller.disposeRequests();
    observer.emit({ status: 'completed', finished: true });
    controller.disposeRequests();
    await Promise.resolve();
    expect(events.filter((e) => e.finished)).toEqual([
      expect.objectContaining({
        status: 'cancelled',
        reason,
        requestId: observer.id,
      }),
    ]);
    expect(args.dispatchNavigation).not.toHaveBeenCalled();
  }
);

test.each([
  'target-unavailable',
  'screen-not-ready',
  'transition-unavailable',
  'overlay-unavailable',
] as const)(
  'reports %s without claiming animated completion',
  async (reason) => {
    const { controller, args, events } = harness();
    await controller.prepareForwardTransition({
      ...args,
      resolveTargetScreenId: async () =>
        reason === 'target-unavailable' ? null : 'detail:instance',
      waitForScreenReady: async () => reason !== 'screen-not-ready',
      startTransition: async () =>
        reason === 'transition-unavailable' ? null : args.startTransition(),
      waitForOverlayReady: async () => reason !== 'overlay-unavailable',
    });
    expect(events).toEqual([
      expect.objectContaining({
        status: reason === 'target-unavailable' ? 'cancelled' : 'fallback',
        reason,
        finished: true,
      }),
    ]);
  }
);

test('missing endpoints report fallback even when coordinator cancellation invalidates preparation', async () => {
  const { controller, args, events } = harness();
  let current = true;
  await controller.prepareForwardTransition({
    ...args,
    isPreparationCurrent: () => current,
    startTransition: async (config) => {
      config.onUnavailable?.('missing-endpoints');
      current = false;
      return null;
    },
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    status: 'fallback',
    reason: 'transition-unavailable',
  });
});

test('capture errors are reported and rethrown; observer exceptions do not affect navigation', async () => {
  const { controller, args, events } = harness();
  const error = new Error('capture failed');
  await expect(
    controller.prepareForwardTransition({
      ...args,
      captureSourceGroup: async () => {
        throw error;
      },
    })
  ).rejects.toBe(error);
  expect(events).toEqual([
    expect.objectContaining({ status: 'failed', error }),
  ]);
  const listener = jest.fn(() => {
    throw new Error('application listener failed');
  });
  const observer = controller.observeNavigation('list', 'Detail', listener)!;
  observer.emit({ status: 'completed', finished: true });
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
  controller.disposeRequests();
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
});

test('terminal callbacks run after bookkeeping and can enqueue another request', async () => {
  const { controller, args } = harness();
  const nextEvents: ChoreographyNavigationEvent[] = [];
  const observer = controller.observeNavigation('list', 'Detail', () => {
    expect(controller.getActiveSession()).toBeNull();
    const next = controller.observeNavigation('list', 'Next', (e) =>
      nextEvents.push(e)
    )!;
    controller.queueNavigation({
      targetScreenId: 'Next',
      sourceScreenId: 'list',
      dispatchNavigation: jest.fn(),
      observer: next,
    });
  })!;
  await controller.prepareForwardTransition({ ...args, observer });
  controller.setActiveSession(null, 'detail:instance');
  await Promise.resolve();
  await Promise.resolve();
  expect(nextEvents.map((e) => e.status)).toEqual(['queued']);
  controller.clearQueuedNavigation();
  await Promise.resolve();
  expect(nextEvents.at(-1)?.status).toBe('cancelled');
});
