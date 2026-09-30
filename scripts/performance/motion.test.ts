import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observeMotion,
  type MotionObservation,
} from '../../examples/react-navigation/src/performance/motion.ts';
import { BenchmarkCollector } from '../../examples/react-navigation/src/performance/collector.ts';

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
