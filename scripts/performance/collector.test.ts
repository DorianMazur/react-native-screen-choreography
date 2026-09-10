import assert from 'node:assert/strict';
import test from 'node:test';
import { BenchmarkCollector } from '../../examples/react-navigation/src/performance/collector.ts';
import type { ChoreographyPreparationTrace } from '../../src/types.ts';

function fixture(profiling = false, preparationTracing = false) {
  let time = 100;
  const collector = new BenchmarkCollector(
    'test-1',
    'live',
    profiling,
    () => time,
    { preparationTracing }
  );
  collector.payloadLifecycle(collector.allocatePayloadInstance(), true);
  return {
    collector,
    at: (next: number) => {
      time = next;
    },
  };
}

function preparationTrace(): ChoreographyPreparationTrace {
  return {
    traceId: 'trace-forward',
    sessionId: 'forward-session',
    groupId: 'photo',
    sourceScreenId: 'list',
    targetScreenId: 'detail:instance',
    direction: 'forward',
    clock: 'js-performance-now',
    startedAtMs: 105,
    completedAtMs: 160,
    outcome: 'overlay-ready',
    droppedStages: 0,
    stages: [
      {
        name: 'screen-ready',
        startedAtMs: 110,
        durationMs: 20,
        completed: true,
        details: { ready: true },
      },
    ],
  };
}

function completeRoundTrip(
  collector: BenchmarkCollector,
  at: (time: number) => void
) {
  assert.equal(collector.request('forward'), true);
  at(140);
  collector.sessionActive('forward-session', 'forward', 1);
  at(500);
  assert.equal(collector.sessionEnd('forward-session'), 'detail');
  at(650);
  assert.equal(collector.probe('detail'), true);
  at(700);
  assert.equal(collector.request('backward'), true);
  at(740);
  collector.sessionActive('back-session', 'backward', 1);
  at(1120);
  assert.equal(collector.sessionEnd('back-session'), 'list');
  at(1280);
  assert.equal(collector.probe('list'), true);
}

test('reports same-clock durations and verifies both destination probes', () => {
  const { collector, at } = fixture();
  completeRoundTrip(collector, at);
  const report = collector.report();
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.journeys[0].requestToSessionActiveMs, 40);
  assert.equal(report.journeys[0].sessionActiveToEndMs, 360);
  assert.equal(report.journeys[0].requestToSessionEndMs, 400);
  assert.equal(report.journeys[0].probe!.sessionEndToProbeHandlerMs, 150);
  assert.equal(report.journeys[1].probe!.requestToProbeHandlerMs, 580);
  assert.equal(report.reactProfiling.supported, false);
  assert.deepEqual(report.reactProfiling.observations, []);
  assert.ok(
    report.samples.every((sample) => sample.clock === 'js-performance-now')
  );
});

test('delayed diagnostics attach by session and preserve the original request timing', () => {
  const { collector, at } = fixture(false, true);
  completeRoundTrip(collector, at);
  // Delivery can happen after a later request; its callback time is not a metric.
  collector.preparationTrace(preparationTrace());
  const report = collector.report();
  assert.equal(report.valid, true, report.errors.join());
  assert.equal(report.journeys[0].requestToSessionActiveMs, 40);
  assert.equal(report.journeys[0].requestToOverlayReadyMs, 60);
  assert.equal(report.journeys[1].requestToOverlayReadyMs, undefined);
  assert.equal(report.preparationTracing.requested, true);
});

test('tracing requires a forward report only when explicitly requested', () => {
  for (const requested of [false, true]) {
    const { collector, at } = fixture(false, requested);
    completeRoundTrip(collector, at);
    const report = collector.report();
    assert.equal(report.valid, !requested);
    assert.equal(report.journeys[0].requestToOverlayReadyMs, undefined);
    assert.equal(
      report.errors.includes('missing-forward-preparation-trace'),
      requested
    );
  }
});

test('an overlay timeout remains visible without fabricating an acknowledged readiness metric', () => {
  const { collector, at } = fixture(false, true);
  completeRoundTrip(collector, at);
  const trace = preparationTrace();
  trace.outcome = 'overlay-timeout';
  collector.preparationTrace(trace);
  const report = collector.report();
  assert.equal(report.valid, true, report.errors.join());
  assert.equal(report.journeys[0].requestToSessionActiveMs, 40);
  assert.equal(report.journeys[0].requestToOverlayReadyMs, undefined);
  assert.equal(report.journeys[0].preparationTrace!.outcome, 'overlay-timeout');
});

test('invalid, unmatched, and duplicate traces cannot manufacture startup metrics', () => {
  for (const mutate of [
    (trace: ChoreographyPreparationTrace) => {
      trace.sessionId = 'stale';
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.completedAtMs = 139;
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.startedAtMs = 99;
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.completedAtMs = Number.NaN;
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.outcome = 'cancelled';
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.droppedStages = 1;
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.stages[0].completed = false;
    },
    (trace: ChoreographyPreparationTrace) => {
      trace.stages[0].durationMs = 100;
    },
  ]) {
    const { collector, at } = fixture(false, true);
    completeRoundTrip(collector, at);
    const trace = preparationTrace();
    mutate(trace);
    collector.preparationTrace(trace);
    const report = collector.report();
    assert.equal(report.valid, false);
    assert.equal(report.journeys[0].requestToOverlayReadyMs, undefined);
  }
  const { collector, at } = fixture(false, true);
  completeRoundTrip(collector, at);
  collector.preparationTrace(preparationTrace());
  collector.preparationTrace(preparationTrace());
  assert.ok(collector.report().errors.includes('duplicate-preparation-trace'));
});

test('trace exports and observer inputs cannot mutate retained diagnostics', () => {
  const { collector, at } = fixture(false, true);
  completeRoundTrip(collector, at);
  const trace = preparationTrace();
  collector.preparationTrace(trace);
  trace.stages[0].durationMs = 1234;
  const saved = collector.report();
  const savedStage = saved.journeys[0].preparationTrace!.stages[0];
  savedStage.durationMs = 999;
  (savedStage.details as Record<string, boolean>).ready = false;
  assert.equal(
    collector.report().journeys[0].preparationTrace!.stages[0].durationMs,
    20
  );
  assert.equal(
    collector.report().journeys[0].preparationTrace!.stages[0].details!.ready,
    true
  );
});

test('missing measurements remain null and incomplete navigation is invalid', () => {
  const { collector } = fixture();
  collector.request('forward');
  const report = collector.report();
  assert.equal(report.valid, false);
  assert.equal(report.journeys[0].requestToSessionActiveMs, null);
  assert.equal(report.journeys[0].requestToSessionEndMs, null);
  assert.equal(report.journeys[0].probe, null);
  assert.ok(report.errors.includes('incomplete-verified-round-trip'));
});

test('a direct or premature probe cannot manufacture successful navigation', () => {
  const { collector, at } = fixture();
  assert.equal(collector.probe('detail'), false);
  collector.request('forward');
  collector.sessionActive('forward-session', 'forward', 1);
  assert.equal(collector.probe('detail'), false);
  at(500);
  collector.sessionEnd('forward-session');
  assert.equal(collector.probe('list'), false);
  assert.equal(collector.request('backward'), false);
  at(520);
  assert.equal(collector.probe('detail'), true);
  assert.equal(collector.probe('detail'), false);
});

test('stale session callbacks invalidate a run without filling missing metrics', () => {
  const { collector } = fixture();
  collector.request('forward');
  collector.sessionActive('current', 'forward', 1);
  assert.equal(collector.sessionEnd('stale'), null);
  const report = collector.report();
  assert.ok(report.errors.includes('unmatched-or-duplicate-session-end'));
  assert.equal(report.journeys[0].sessionEndJsMs, null);
});

test('requested profiling requires real callbacks; release does not invent samples', () => {
  const { collector, at } = fixture(true);
  completeRoundTrip(collector, at);
  assert.equal(collector.report().valid, false);
  assert.equal(
    collector.report().reactProfiling.status,
    'requested-but-no-callbacks'
  );
  collector.reactCommit({
    id: 'benchmark-root',
    phase: 'update',
    actualDurationMs: 4,
    baseDurationMs: 6,
    reactStartTimeMs: 10,
    reactCommitTimeMs: 20,
  });
  const report = collector.report();
  assert.equal(report.valid, true);
  assert.equal(report.reactProfiling.supported, true);
  assert.equal(report.reactProfiling.observations[0].actualDurationMs, 4);
  assert.match(report.reactProfiling.meaning, /not-native-commit-time/);
});

test('snapshot export is detached from subsequent observation changes', () => {
  const { collector, at } = fixture();
  completeRoundTrip(collector, at);
  const saved = collector.report();
  saved.journeys[0].probe!.screen = 'list';
  saved.samples[0].kind = 'mutated';
  assert.equal(collector.report().journeys[0].probe!.screen, 'detail');
  assert.equal(collector.report().samples[0].kind, 'payload-mounted');
});

test('bounded telemetry reports overflow rather than silently losing observations', () => {
  const { collector } = fixture();
  for (let index = 0; index < 5000; index += 1) collector.note('test');
  const report = collector.report();
  assert.equal(report.samples.length, 4096);
  assert.equal(report.droppedSamples, 905);
  assert.equal(report.valid, false);
  assert.ok(report.errors.includes('sample-buffer-overflow'));
});

test('reset during an unfinished request preserves the failure in its report', () => {
  const { collector } = fixture();
  collector.request('forward');
  collector.abortUnfinished('reset-before-probe-completion');
  assert.equal(
    collector.report().journeys[0].failure,
    'reset-before-probe-completion'
  );
});

test('nonfinite or backwards durations fail instead of emitting bogus numbers', () => {
  const { collector, at } = fixture();
  collector.request('forward');
  at(90);
  assert.throws(
    () => collector.sessionActive('bad-clock', 'forward', 1),
    /monotonic/
  );
  at(Number.NaN);
  assert.throws(() => collector.note('bad-clock'), /finite/);
});

test('supports all 100 native timing cycles without recycling the live owner', () => {
  const { collector, at } = fixture();
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const offset = cycle * 1500;
    at(offset + 100);
    completeRoundTrip(collector, (time) => at(offset + time));
  }
  const report = collector.report();
  assert.equal(report.valid, true);
  assert.equal(report.journeys.length, 200);
  assert.equal(report.payloadMounts, 1);
  assert.equal(report.payloadUnmounts, 0);
  assert.equal(report.droppedSamples, 0);
  assert.equal(collector.request('forward'), false);
  assert.ok(collector.report().errors.includes('journey-limit-exceeded'));
});

test('a live payload unmount or extra mount invalidates otherwise verified input', () => {
  const { collector, at } = fixture();
  completeRoundTrip(collector, at);
  collector.payloadLifecycle(1, false);
  collector.payloadLifecycle(collector.allocatePayloadInstance(), true);
  const report = collector.report();
  assert.equal(report.valid, false);
  assert.ok(report.errors.includes('live-payload-owner-not-retained'));
});

test('a live report without an observed payload mount is invalid', () => {
  let time = 100;
  const collector = new BenchmarkCollector(
    'missing-owner',
    'live',
    false,
    () => time
  );
  completeRoundTrip(collector, (next: number) => {
    time = next;
  });
  assert.equal(collector.report().valid, false);
  assert.ok(
    collector.report().errors.includes('live-payload-owner-not-retained')
  );
});
