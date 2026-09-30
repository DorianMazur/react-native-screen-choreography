import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observeMotion,
  installMotionObserver,
  type MotionObservation,
  type MotionRequest,
} from '../../examples/react-navigation/src/performance/motion.ts';
import { BenchmarkCollector } from '../../examples/react-navigation/src/performance/collector.ts';

function signal<T>(initial: T) {
  let value = initial;
  const listeners = new Map<number, (value: T) => void>();
  return {
    get value() {
      return value;
    },
    set value(next: T) {
      value = next;
      // Reanimated invokes listeners during the UI value setter; its reaction
      // mappers drain later and can only see the last value in a batch.
      listeners.forEach((listener) => listener(next));
    },
    addListener: (id: number, listener: (value: T) => void) =>
      listeners.set(id, listener),
    removeListener: (id: number) => {
      listeners.delete(id);
    },
    listenerCount: () => listeners.size,
  };
}

for (const direction of ['forward', 'backward'] as const) {
  test(`${direction}: records terminal handoff before cleanup in the same UI batch`, () => {
    const endpoint = direction === 'forward' ? 1 : 0;
    const request = signal<MotionRequest | null>(null);
    const progress = signal(1 - endpoint);
    const handoff = signal({
      sessionId: null as string | null,
      completed: false,
    });
    let now = 100;
    const samples: MotionObservation[] = [];
    const dispose = installMotionObserver({
      request,
      progress,
      handoff,
      listenerId: -1,
      now: () => now,
      deliver: (sample) => samples.push(sample),
    });
    request.value = { requestId: 1, direction, sessionId: null };
    now = 110;
    request.value = { ...request.value, sessionId: 'session' };
    handoff.value = { sessionId: 'session', completed: false };
    now = 120;
    progress.value = 0.5;
    const beforeCompletion = observeMotion(
      request.value,
      null,
      progress.value,
      handoff.value,
      now
    );
    now = 200;
    progress.value = endpoint;
    now = 205;
    handoff.value = { sessionId: 'session', completed: true };
    // RN cleanup clears the transient signal before the observer mapper drains.
    handoff.value = { sessionId: null, completed: false };
    now = 220;
    assert.equal(
      observeMotion(
        request.value,
        beforeCompletion,
        progress.value,
        handoff.value,
        now
      ).handoffMs,
      null
    );
    assert.deepEqual(samples, [
      { requestId: 1, firstMotionMs: 120, motionEndMs: 200, handoffMs: 205 },
    ]);
    // More endpoint/handoff notifications must not deliver a duplicate sample.
    progress.value = endpoint;
    handoff.value = { sessionId: 'session', completed: true };
    assert.equal(samples.length, 1);
    dispose();
    assert.equal(request.listenerCount(), 0);
    assert.equal(progress.listenerCount(), 0);
    assert.equal(handoff.listenerCount(), 0);
  });
}

test('motion listeners isolate requests, reject stale handoffs and release only their subscriptions', () => {
  const request = signal<MotionRequest | null>({
    requestId: 1,
    direction: 'forward',
    sessionId: null,
  });
  const progress = signal(0);
  const handoff = signal({
    sessionId: 'old' as string | null,
    completed: false,
  });
  let now = 100;
  const samples: MotionObservation[] = [];
  progress.addListener(10001, () => {});
  const dispose = installMotionObserver({
    request,
    progress,
    handoff,
    listenerId: -1,
    now: () => now,
    deliver: (sample) => samples.push(sample),
  });
  request.value = { ...request.value!, sessionId: 'first' };
  now = 120;
  progress.value = 0.5;
  now = 200;
  progress.value = 1;
  handoff.value = { sessionId: 'old', completed: true };
  assert.equal(samples.length, 0);
  now = 205;
  handoff.value = { sessionId: 'first', completed: true };
  request.value = null;
  request.value = { requestId: 2, direction: 'backward', sessionId: null };
  handoff.value = { sessionId: 'first', completed: true };
  request.value = { ...request.value, sessionId: 'second' };
  now = 320;
  progress.value = 0.5;
  now = 400;
  progress.value = 0;
  handoff.value = { sessionId: 'first', completed: true };
  assert.equal(samples.length, 1);
  now = 415;
  handoff.value = { sessionId: 'second', completed: true };
  assert.deepEqual(samples[1], {
    requestId: 2,
    firstMotionMs: 320,
    motionEndMs: 400,
    handoffMs: 415,
  });
  dispose();
  assert.equal(progress.listenerCount(), 1);
  request.value = { requestId: 3, direction: 'forward', sessionId: 'third' };
  progress.value = 1;
  handoff.value = { sessionId: 'third', completed: true };
  assert.equal(samples.length, 2);
});

for (const direction of ['forward', 'backward'] as const) {
  test(`${direction}: measures actual progress, endpoint and matching handoff separately`, () => {
    const request = { requestId: 1, direction, sessionId: 'session' };
    const end = direction === 'forward' ? 1 : 0;
    let observation = observeMotion(request, null, 1 - end, undefined, 100);
    assert.equal(observation.firstMotionMs, null);
    observation = observeMotion(request, observation, 0.5, undefined, 120);
    assert.equal(observation.firstMotionMs, 120);
    observation = observeMotion(
      request,
      observation,
      end + 0.01,
      undefined,
      200
    );
    assert.equal(
      observation.motionEndMs,
      null,
      'spring overshoot is not completion'
    );
    observation = observeMotion(
      request,
      observation,
      end,
      { sessionId: 'old', completed: true },
      220
    );
    assert.equal(observation.motionEndMs, 220);
    assert.equal(observation.handoffMs, null);
    observation = observeMotion(
      request,
      observation,
      end,
      { sessionId: 'session', completed: true },
      235
    );
    assert.equal(observation.handoffMs, 235);
    assert.deepEqual(
      observeMotion(request, observation, end, undefined, 300),
      observation
    );
    const next = observeMotion(
      { ...request, requestId: 2, sessionId: null },
      observation,
      0.5,
      undefined,
      400
    );
    assert.equal(
      next.firstMotionMs,
      null,
      'a new request must wait for its own session'
    );
  });
}

test('collector preserves UI timestamps even when RN delivery is delayed until after cleanup', () => {
  let now = 100;
  const collector = new BenchmarkCollector('motion', 'gallery', () => now, {
    motionTracing: true,
  });
  collector.payloadLifecycle(collector.allocatePayloadInstance(), true);
  for (const [index, direction] of (
    ['forward', 'backward'] as const
  ).entries()) {
    now = 100 + index * 1000;
    collector.request(direction);
    now += 20;
    collector.sessionActive(`session-${index}`, direction, 1);
    now += 400;
    collector.sessionEnd(`session-${index}`);
    collector.motion({
      requestId: index + 1,
      firstMotionMs: now - 380,
      motionEndMs: now - 30,
      handoffMs: now - 10,
    });
    collector.probe(direction === 'forward' ? 'detail' : 'list');
  }
  assert.equal(collector.report().valid, true);
  assert.equal(collector.report().motionTracing?.version, 2);
  const saved = collector.report();
  saved.journeys[0].motion!.firstMotionMs = 999;
  assert.equal(collector.report().journeys[0].motion!.firstMotionMs, 140);
  collector.motion(collector.report().journeys[0].motion!);
  assert.ok(
    collector
      .report()
      .errors.includes('invalid-or-duplicate-motion-observation')
  );
});

test('missing, stale and nonfinite motion observations cannot pass collection', () => {
  for (const change of [
    { requestId: 2 },
    { firstMotionMs: 90 },
    { firstMotionMs: NaN },
    { motionEndMs: 100 },
    { handoffMs: 150 },
    { handoffMs: 1000 },
  ]) {
    let now = 100;
    const collector = new BenchmarkCollector('motion', 'trips', () => now, {
      motionTracing: true,
    });
    collector.request('forward');
    now = 120;
    collector.sessionActive('s', 'forward', 1);
    now = 500;
    collector.motion({
      requestId: 1,
      firstMotionMs: 130,
      motionEndMs: 200,
      handoffMs: 220,
      ...change,
    } as MotionObservation);
    assert.equal(collector.report().journeys[0].motion, undefined);
    assert.ok(collector.report().errors.includes('missing-motion-observation'));
  }
});
