import type { InputRecord, MeasurementDocument } from './types.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, summarize, markdown } from './report.mts';

function fixture(scenario: string, profile = false): InputRecord {
  return {
    schemaVersion: 1,
    fixtureVersion: 1,
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

function memory(scenario: string, profile = false): InputRecord {
  return {
    schemaVersion: 1,
    kind: 'memory',
    scenario,
    reactProfile: profile,
    samples: [
      { iteration: 0, phase: 'baseline', totalPssKb: 1000, totalRssKb: null },
      { iteration: 0, phase: 'detail', totalPssKb: 1500, totalRssKb: 2500 },
      { iteration: 0, phase: 'after-back', totalPssKb: 900, totalRssKb: 1800 },
    ],
  };
}

function documents(profile = false): MeasurementDocument[] {
  return [
    ...['ordinary', 'live'].flatMap((scenario) => [
      { file: `${scenario}.json`, data: fixture(scenario, profile) },
      { file: `${scenario}-memory.json`, data: memory(scenario, profile) },
    ]),
    {
      file: 'native-benchmarkData.json',
      data: {
        benchmarks: ['ordinary', 'live'].flatMap((scenario) => [
          ...['coldStartup', 'warmStartup'].map((kind) => ({
            name: `${kind}[${scenario}]`,
            metrics: {
              timeToInitialDisplayMs: { runs: [400, 420] },
              timeToFullDisplayMs: { runs: [500, 540] },
            },
            sampledMetrics: {},
          })),
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
  metadata: { iterations: 2, memoryCycles: 1 },
};

test('aggregates valid native data without inventing unsupported profiling or memory values', () => {
  const summary = summarize(documents(), options);
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(
    summary.metrics[
      'android.transitionFrames[ordinary].deadlineOverrunPercent'
    ]!.median,
    25
  );
  assert.equal(
    summary.metrics['ordinary.native.touchToAcknowledgementMs']!.median,
    8
  );
  assert.equal(
    summary.metrics['ordinary.memory.retainedPssDeltaKb']!.median,
    -100
  );
  assert.equal(summary.metrics['ordinary.memory.baseline.rssKb'], undefined);
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
  assert.equal(summary.metrics['live.react.renderWorkPerUpdateMs']!.median, 2);
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

test('rejects absent frame collection, missing memory checkpoints and duplicate runs', () => {
  const input = documents();
  input.at(-1)!.data.benchmarks[2].sampledMetrics = {};
  input[1].data.samples.pop();
  input.push(input[0]);
  const summary = summarize(input, options);
  assert.equal(summary.valid, false);
  assert.match(summary.errors.join(), /frame-overrun/);
  assert.match(summary.errors.join(), /memory checkpoint/);
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

test('requires all memory phases once per contiguous iteration and requested cycle count', () => {
  for (const mutate of [
    (data: InputRecord) => {
      data.samples.push({ ...data.samples[0] });
    },
    (data: InputRecord) => {
      data.samples[2].iteration = 1;
    },
    (data: InputRecord) => {
      data.samples[0].iteration = -1;
    },
    (data: InputRecord) => {
      data.samples[0].iteration = 0.5;
    },
    (data: InputRecord) => {
      data.samples = data.samples.map((sample: InputRecord) => ({
        ...sample,
        iteration: 1,
      }));
    },
  ]) {
    const input = documents();
    mutate(input[1].data);
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.equal(summary.metrics['ordinary.memory.baseline.pssKb'], undefined);
  }
  const wrongCycles = summarize(documents(), {
    ...options,
    metadata: { iterations: 2, memoryCycles: 2 },
  });
  assert.match(wrongCycles.errors.join(), /expected cycles/);

  const complete = documents();
  for (const document of complete.filter(
    ({ data }) => data.kind === 'memory'
  )) {
    document.data.samples.push(
      ...document.data.samples.map((sample: InputRecord) => ({
        ...sample,
        iteration: 1,
      }))
    );
  }
  const valid = summarize(complete, {
    ...options,
    metadata: { iterations: 2, memoryCycles: 2 },
  });
  assert.equal(valid.valid, true, valid.errors.join('\n'));
});

test('requires both startup modes and frame-overrun data for each scenario', () => {
  for (const missing of [
    'coldStartup[ordinary]',
    'warmStartup[ordinary]',
    'transitionFrames[ordinary]',
    'coldStartup[live]',
    'warmStartup[live]',
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
      data.benchmarks[0].metrics.timeToInitialDisplayMs.runs = [400];
    },
    (data: InputRecord) => {
      data.benchmarks[0].metrics.timeToInitialDisplayMs.runs = [[400], [420]];
    },
    (data: InputRecord) => {
      data.benchmarks[0].metrics = {};
    },
    (data: InputRecord) => {
      delete data.benchmarks[0].metrics.timeToFullDisplayMs;
    },
    (data: InputRecord) => {
      data.benchmarks[2].sampledMetrics.frameOverrunMs.runs = [[1], []];
    },
    (data: InputRecord) => {
      data.benchmarks[2].sampledMetrics.frameOverrunMs.runs = [-1, 1];
    },
    (data: InputRecord) => {
      data.benchmarks[2].sampledMetrics.frameOverrunMs.runs = [[-1]];
    },
    (data: InputRecord) => {
      data.benchmarks[2].sampledMetrics.frameDurationCpuMs.runs[0][0] = -1;
    },
    (data: InputRecord) => {
      data.benchmarks[2].sampledMetrics.frameOverrunMs.runs[0][0] =
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

test('rejects invalid expected counts and duplicate native or memory artifacts', () => {
  for (const metadata of [
    { iterations: 0 },
    { iterations: 1.5 },
    { memoryCycles: 101 },
  ]) {
    assert.match(
      summarize(documents(), { ...options, metadata }).errors.join(),
      /integer between 1 and 100/
    );
  }
  for (const documentIndex of [1, 4]) {
    const input = documents();
    input.push({ ...input[documentIndex], file: 'copied-artifact.json' });
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.match(
      summary.errors.join(),
      /Duplicate (Android benchmark|memory report)/
    );
  }
});

function iosDocuments(profile = false): MeasurementDocument[] {
  const fixtures = documents(profile).filter(({ data }) => data.fixtureVersion);
  if (profile) return [...fixtures, { file: 'xctest-metrics.json', data: [] }];
  const metric = (
    identifier: string,
    displayName: string,
    unitOfMeasurement: string,
    measurements: number[]
  ) => ({
    identifier: `com.apple.dt.XCTMetric_${identifier}`,
    displayName,
    unitOfMeasurement,
    measurements,
  });
  return [
    ...fixtures,
    {
      file: 'xctest-metrics.json',
      data: ['Ordinary', 'Live'].flatMap((scenario) =>
        ['Launch', 'RoundTrip'].map((kind) => ({
          testIdentifier: `PerformanceTests/test${scenario}${kind}()`,
          testRuns: [
            {
              device: { deviceId: 'sim-1', deviceName: 'iPhone' },
              testPlanConfiguration: {
                configurationId: '1',
                configurationName: 'Performance',
              },
              metrics:
                kind === 'Launch'
                  ? [
                      metric(
                        'ApplicationLaunch.duration',
                        'Application Launch',
                        's',
                        [0.3, 0.4]
                      ),
                    ]
                  : [
                      metric(
                        'Clock.time.monotonic',
                        'Clock Monotonic Time',
                        's',
                        [1.2, 1.4]
                      ),
                      metric(
                        'Memory.physical_peak',
                        'Memory Peak Physical',
                        'kB',
                        [23000, 24000]
                      ),
                    ],
            },
          ],
        }))
      ),
    },
  ];
}

test('iOS reports XCTest measurements and requires both native scenarios', () => {
  const iosOptions = { platform: 'ios', mode: 'native-release' };
  const summary = summarize(iosDocuments(), iosOptions);
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(
    summary.metrics['ios.ordinary.xctest.applicationLaunchSeconds']!.median,
    0.35
  );
  assert.equal(
    summary.metrics['ios.live.xctest.memoryPeakPhysical_kB']!.median,
    23500
  );
  assert.equal(
    summary.metricDefinitions!['ios.live.xctest.roundTripSeconds']
      .unitOfMeasurement,
    's'
  );
  assert.equal(
    Object.keys(summary.metrics).some((key) => key.startsWith('android.')),
    false
  );
  const missing = iosDocuments();
  missing.at(-1)!.data.pop();
  assert.match(
    summarize(missing, iosOptions).errors.join(),
    /Missing live native XCTest memory/
  );
  assert.equal(summarize(iosDocuments().slice(0, -1), iosOptions).valid, false);
  const duplicate = iosDocuments();
  duplicate.push(duplicate.at(-1)!);
  assert.match(
    summarize(duplicate, iosOptions).errors.join(),
    /Duplicate XCTest/
  );
});

test('iOS profiling requires React observations and permits empty native metric export', () => {
  const iosOptions = { platform: 'ios', mode: 'react-profile' };
  assert.equal(summarize(iosDocuments(true), iosOptions).valid, true);
  const mixed = iosDocuments(true);
  mixed.at(-1)!.data = iosDocuments().at(-1)!.data;
  assert.match(
    summarize(mixed, iosOptions).errors.join(),
    /Native XCTest timings found/
  );
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
