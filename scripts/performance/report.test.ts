import type { InputRecord, MeasurementDocument } from './types.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, summarize, markdown } from './report.mts';

function fixture(scenario: string, profile = false): InputRecord {
  return {
    schemaVersion: 1,
    fixtureVersion: 2,
    runId: `${scenario}-1`,
    scenario,
    clock: 'js-performance-now',
    valid: true,
    errors: [],
    droppedSamples: 0,
    payloadMounts: 1,
    payloadUnmounts: 0,
    journeys: ['forward', 'backward'].map((direction) => ({
      direction,
      sessionId: `session-${direction}`,
      failure: null,
      requestToSessionActiveMs: 40,
      sessionActiveToEndMs: 300,
      requestToSessionEndMs: 340,
      probe: {
        screen: direction === 'forward' ? 'detail' : 'list',
        meaning: 'observed-successful-probe-upper-bound-including-test-wait',
        requestToProbeHandlerMs: 410,
        sessionEndToProbeHandlerMs: 70,
      },
    })),
    reactProfiling: {
      requested: profile,
      supported: profile,
      status: profile ? 'observed' : 'not-requested',
      observations: profile
        ? [{ actualDurationMs: 2, reactCommitTimeMs: 900 }]
        : [],
    },
    native: {
      platform: 'android',
      clock: 'android-uptime-ms',
      droppedSamples: 0,
      exportedAtUptimeMs: 2100,
      touches: [1000, 2000].map((eventUptimeMs) => ({
        kind: 'activity-action-up',
        eventUptimeMs,
        dispatchUptimeMs: eventUptimeMs + 1,
      })),
      inputAcknowledgements: ['detail', 'list'].map((probe, index) => ({
        probe,
        eventUptimeMs: (index + 1) * 1000,
        nativeAckUptimeMs: (index + 1) * 1000 + 8,
        touchToNativeAckMs: 8,
      })),
    },
  };
}

function documents(profile = false): MeasurementDocument[] {
  return [
    ...['ordinary', 'live'].flatMap((scenario) => [
      { file: `${scenario}.json`, data: fixture(scenario, profile) },
    ]),
    {
      file: 'native-benchmarkData.json',
      data: {
        benchmarks: ['ordinary', 'live'].flatMap((scenario) => [
          {
            name: `transitionFrames[${scenario}]`,
            metrics: { frameCount: { runs: [3, 1] } },
            sampledMetrics: {
              frameOverrunMs: { runs: [[-5, -2, 3], [-1]] },
              frameDurationCpuMs: { runs: [[3, 5, 19], [9]] },
            },
          },
        ]),
      },
    },
  ];
}

const options = {
  platform: 'android',
  mode: 'native-release',
  metadata: { iterations: 2, timingCycles: 1 },
};

function withPreparationTrace(data: InputRecord) {
  data.preparationTracing = {
    version: 1,
    requested: true,
    directions: ['forward'],
  };
  Object.assign(data.journeys[0], {
    requestJsMs: 100,
    sessionActiveJsMs: 140,
    requestToOverlayReadyMs: 60,
    preparationTrace: {
      traceId: 'trace-forward',
      sessionId: 'session-forward',
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
          name: 'coordinator',
          startedAtMs: 110,
          durationMs: 30,
          completed: true,
        },
        {
          name: 'target-measure',
          startedAtMs: 110,
          durationMs: 5,
          completed: true,
        },
        {
          name: 'target-measure',
          startedAtMs: 130,
          durationMs: 7,
          completed: true,
        },
        {
          name: 'overlay-ready',
          startedAtMs: 140,
          durationMs: 20,
          completed: true,
        },
      ],
    },
  });
}

test('optional startup diagnostics preserve definition 3 and aggregate repeated stages per journey', () => {
  const input = documents();
  withPreparationTrace(input[0].data);
  const summary = summarize(input, options);
  assert.equal(summary.valid, true, summary.errors.join());
  assert.equal(summary.measurementDefinitionVersion, 3);
  assert.equal(
    summary.metrics['ordinary.forward.requestToSessionActiveMs']!.median,
    40
  );
  assert.equal(
    summary.metrics['ordinary.forward.requestToOverlayReadyMs']!.median,
    60
  );
  assert.equal(
    summary.metrics['ordinary.forward.preparation.target-measureMs']!.median,
    12
  );
  assert.equal(
    summary.metrics['ordinary.forward.preparation.target-measureMs']!.count,
    1
  );
  assert.equal(
    summary.metrics['ordinary.forward.preparation.coordinatorMs']!.median,
    30
  );
  assert.equal(
    summary.metrics['ordinary.backward.requestToOverlayReadyMs'],
    undefined
  );
  assert.equal(
    summary.metrics['live.forward.requestToOverlayReadyMs'],
    undefined
  );
  assert.match(markdown(summary), /not first presented motion/);
});

test('invalid or missing requested startup diagnostics fail atomically', () => {
  for (const mutate of [
    (data: InputRecord) => {
      delete data.journeys[0].preparationTrace;
    },
    (data: InputRecord) => {
      delete data.journeys[0].requestToOverlayReadyMs;
    },
    (data: InputRecord) => {
      data.journeys[0].requestToOverlayReadyMs = 0;
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.sessionId = 'stale';
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.clock = 'android-uptime-ms';
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.completedAtMs = 139;
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.droppedStages = 1;
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.stages[0].completed = false;
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.stages[0].durationMs = 100;
    },
    (data: InputRecord) => {
      data.journeys[0].preparationTrace.stages[0].durationMs = -1;
    },
  ]) {
    const input = documents();
    withPreparationTrace(input[0].data);
    mutate(input[0].data);
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.equal(
      summary.metrics['ordinary.forward.requestToSessionActiveMs'],
      undefined
    );
    assert.equal(
      summary.metrics['ordinary.forward.requestToOverlayReadyMs'],
      undefined
    );
  }
});

test('overlay timeouts are counted separately and excluded from acknowledged timing distributions', () => {
  const input = documents();
  withPreparationTrace(input[0].data);
  const journey = input[0].data.journeys[0];
  journey.preparationTrace.outcome = 'overlay-timeout';
  delete journey.requestToOverlayReadyMs;
  const summary = summarize(input, options);
  assert.equal(summary.valid, true, summary.errors.join());
  assert.deepEqual(summary.preparationDiagnostics['ordinary.forward'], {
    tracedJourneys: 1,
    overlayAcknowledgedJourneys: 0,
    overlayTimeoutJourneys: 1,
  });
  assert.equal(
    summary.metrics['ordinary.forward.requestToOverlayReadyMs'],
    undefined
  );
  assert.equal(
    summary.metrics['ordinary.forward.requestToSessionActiveMs']!.median,
    40
  );
  assert.match(markdown(summary), /Overlay timeout/);
  assert.match(markdown(summary), /ordinary.forward \| 1 \| 0 \| 1/);

  journey.requestToOverlayReadyMs = 60;
  const invalid = summarize(input, options);
  assert.equal(invalid.valid, false);
  assert.match(
    invalid.errors.join(),
    /timeout must not report observed overlay readiness/
  );
});

test('aggregates valid native data without inventing unsupported profiling values', () => {
  const summary = summarize(documents(), options);
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(
    summary.metrics[
      'android.transitionFrames[ordinary].deadlineOverrunPercent'
    ]!.median,
    25
  );
  assert.equal(
    summary.metrics['ordinary.native.touchToAcknowledgementMs'],
    undefined
  );
  assert.equal(
    summary.metrics['ordinary.react.renderWorkPerUpdateMs'],
    undefined
  );
  assert.equal(
    summary.metrics['ordinary.forward.requestToSessionActiveMs']!.p95,
    null
  );
  assert.match(markdown(summary), /informational/);
});

test('profiling data is required only for a separate profiling artifact', () => {
  const summary = summarize(documents(true), {
    ...options,
    mode: 'react-profile',
  });
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(summary.metrics['live.react.renderWorkPerRunMs']!.median, 2);
  assert.equal(summarize(documents(true), options).valid, false);
  const missing = documents(true);
  missing[0].data.reactProfiling.observations = [];
  assert.match(
    summarize(missing, { ...options, mode: 'react-profile' }).errors.join(),
    /no timing observations/
  );
});

test('rejects incomplete runs even if a producer incorrectly sets valid=true', () => {
  for (const mutate of [
    (data: InputRecord) => {
      data.journeys[0].probe = null;
    },
    (data: InputRecord) => {
      data.journeys[0].requestToSessionActiveMs = null;
    },
    (data: InputRecord) => {
      data.journeys[0].requestToSessionActiveMs = -1;
    },
    (data: InputRecord) => {
      data.journeys[0].probe.screen = 'list';
    },
    (data: InputRecord) => {
      data.journeys.pop();
    },
    (data: InputRecord) => {
      data.clock = 'native-uptime';
    },
    (data: InputRecord) => {
      data.droppedSamples = 1;
    },
    (data: InputRecord) => {
      data.schemaVersion = 99;
    },
  ]) {
    const input = documents();
    mutate(input[0].data);
    assert.equal(summarize(input, options).valid, false);
  }
});

test('rejects absent frame collection and duplicate runs', () => {
  const input = documents();
  input.at(-1)!.data.benchmarks[0].sampledMetrics = {};
  input.push(input[0]);
  const summary = summarize(input, options);
  assert.equal(summary.valid, false);
  assert.match(summary.errors.join(), /frame-overrun/);
  assert.match(summary.errors.join(), /Duplicate run ID/);
});

test('requires complete and consistent native touch acknowledgements for Android', () => {
  for (const mutate of [
    (data: InputRecord) => {
      delete data.native;
    },
    (data: InputRecord) => {
      delete data.native.droppedSamples;
    },
    (data: InputRecord) => {
      data.native.droppedSamples = 1;
    },
    (data: InputRecord) => {
      data.native.clock = 'js-performance-now';
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements.pop();
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements.push(
        data.native.inputAcknowledgements[0]
      );
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements[0].probe = 'list';
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements[0].eventUptimeMs = null;
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements[0].nativeAckUptimeMs = Number.NaN;
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements[0].touchToNativeAckMs = -1;
    },
    (data: InputRecord) => {
      data.native.inputAcknowledgements[0].touchToNativeAckMs = 9;
    },
    (data: InputRecord) => {
      data.native.exportedAtUptimeMs = 1000;
    },
    (data: InputRecord) => {
      data.native.touches = [];
    },
    (data: InputRecord) => {
      data.native.touches[0].dispatchUptimeMs = 999;
    },
    (data: InputRecord) => {
      data.native.touches[0].dispatchUptimeMs = 1010;
    },
  ]) {
    const input = documents();
    mutate(input[0].data);
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    // Validation is atomic per producer: failed fixtures contribute no metrics.
    assert.equal(summary.metrics['ordinary.payloadMountsPerRun'], undefined);
  }
});

test('requires the requested number of forward and backward timing samples', () => {
  const summary = summarize(documents(), {
    ...options,
    metadata: { iterations: 2, timingCycles: 20 },
  });
  assert.equal(summary.valid, false);
  assert.match(
    summary.errors.join(),
    /Timing journey count must match expected cycles/
  );
  assert.equal(
    summary.metrics['ordinary.forward.requestToSessionActiveMs'],
    undefined
  );
});

test('reports 20 preparation samples per direction without memory artifacts', () => {
  const input = documents();
  for (const { data } of input.filter(
    (document) => document.data.fixtureVersion
  )) {
    data.journeys = Array.from({ length: 20 }, () => data.journeys).flat();
    data.native.exportedAtUptimeMs = 41000;
    data.native.touches = data.journeys.map((_: unknown, index: number) => ({
      kind: 'activity-action-up',
      eventUptimeMs: (index + 1) * 1000,
      dispatchUptimeMs: (index + 1) * 1000 + 1,
    }));
    data.native.inputAcknowledgements = data.journeys.map(
      (journey: InputRecord, index: number) => ({
        probe: journey.probe.screen,
        eventUptimeMs: (index + 1) * 1000,
        nativeAckUptimeMs: (index + 1) * 1000 + 8,
        touchToNativeAckMs: 8,
      })
    );
  }
  for (const benchmark of input.at(-1)!.data.benchmarks) {
    benchmark.metrics.frameCount.runs = Array(20).fill(1);
    benchmark.sampledMetrics.frameOverrunMs.runs = Array.from(
      { length: 20 },
      () => [-1]
    );
    benchmark.sampledMetrics.frameDurationCpuMs.runs = Array.from(
      { length: 20 },
      () => [3]
    );
  }
  const summary = summarize(input, {
    ...options,
    metadata: { iterations: 20, timingCycles: 20 },
  });
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(summary.measurementDefinitionVersion, 3);
  for (const scenario of ['ordinary', 'live']) {
    for (const direction of ['forward', 'backward']) {
      assert.equal(
        summary.metrics[`${scenario}.${direction}.requestToSessionActiveMs`]!
          .count,
        20
      );
    }
  }
  assert.equal(
    Object.keys(summary.metrics).some((key) => key.includes('memory')),
    false
  );
});

test('requires frame-overrun data for each scenario', () => {
  for (const missing of [
    'transitionFrames[ordinary]',
    'transitionFrames[live]',
  ]) {
    const input = documents();
    input.at(-1)!.data.benchmarks = input
      .at(-1)!
      .data.benchmarks.filter(({ name }: { name: string }) => name !== missing);
    const summary = summarize(input, options);
    assert.equal(summary.valid, false, missing);
    assert.match(summary.errors.join(), /Missing .* native/);
  }
});

test('validates pinned Macrobenchmark run arrays, counts, duplicate names and per-frame values', () => {
  for (const mutate of [
    (data: InputRecord) => {
      data.benchmarks[0].sampledMetrics.frameOverrunMs.runs = [[1], []];
    },
    (data: InputRecord) => {
      data.benchmarks[0].sampledMetrics.frameOverrunMs.runs = [-1, 1];
    },
    (data: InputRecord) => {
      data.benchmarks[0].sampledMetrics.frameOverrunMs.runs = [[-1]];
    },
    (data: InputRecord) => {
      data.benchmarks[0].sampledMetrics.frameDurationCpuMs.runs[0][0] = -1;
    },
    (data: InputRecord) => {
      data.benchmarks[0].sampledMetrics.frameOverrunMs.runs[0][0] =
        Number.POSITIVE_INFINITY;
    },
    (data: InputRecord) => {
      data.benchmarks.push(data.benchmarks[0]);
    },
    (data: InputRecord) => {
      data.benchmarks[0].name = 'roundTrip';
    },
  ]) {
    const input = documents();
    mutate(input.at(-1)!.data);
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.equal(
      Object.keys(summary.metrics).some((key) => key.startsWith('android.')),
      false
    );
  }
});

test('rejects invalid expected counts and duplicate native artifacts', () => {
  for (const metadata of [
    { iterations: 0 },
    { iterations: 1.5 },
    { timingCycles: 101 },
  ]) {
    assert.match(
      summarize(documents(), { ...options, metadata }).errors.join(),
      /integer between 1 and 100/
    );
  }
  for (const documentIndex of [2]) {
    const input = documents();
    input.push({ ...input[documentIndex], file: 'copied-artifact.json' });
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.match(summary.errors.join(), /Duplicate Android benchmark/);
  }
});

test('tail estimates require enough observations', () => {
  assert.equal(distribution([]), null);
  assert.equal(distribution([1, 3])!.median, 2);
  assert.equal(distribution([1, 3])!.p95, null);
  assert.equal(
    distribution(Array.from({ length: 20 }, (_, i) => i))!.p95,
    18.05
  );
});

test('rejects synthetic-panel fixtures from before the gallery workload', () => {
  const input = documents();
  input[0]!.data.fixtureVersion = 1;
  const summary = summarize(input, options);
  assert.equal(summary.valid, false);
});

test('rejects unsupported benchmark platforms', () => {
  assert.throws(
    () => summarize(documents(), { ...options, platform: 'ios' }),
    /platform must be android/
  );
});
