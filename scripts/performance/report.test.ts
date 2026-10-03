import type { InputRecord, MeasurementDocument } from './types.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { distribution, summarize, markdown } from './report.mts';
import { sameDefinition } from './metric-definitions.mts';
import {
  SCENARIOS,
  SCENARIO_IDS,
} from '../../examples/react-navigation/src/performance/scenarios.ts';

function fixture(scenario: string): InputRecord {
  return {
    schemaVersion: 1,
    fixtureVersion: 5,
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

function documents(overrides: InputRecord[] = []): MeasurementDocument[] {
  return SCENARIO_IDS.map((scenario) => ({
    file: `${scenario}.json`,
    data:
      overrides.find((data) => data.scenario === scenario) ?? fixture(scenario),
  }));
}

const options = {
  platform: 'android',
  mode: 'native-release',
  metadata: {},
};

test('CLI prints collection failures and preserves diagnostic summaries', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'choreography-report-'));
  try {
    const input = path.join(directory, 'raw');
    const output = path.join(directory, 'report');
    const metadata = path.join(directory, 'metadata.json');
    await mkdir(input);
    await writeFile(metadata, JSON.stringify(options.metadata));
    const invalid = fixture('gallery');
    invalid.valid = false;
    invalid.errors = ['missing-motion-observation'];
    await Promise.all(
      documents([invalid]).map(({ file, data }) =>
        writeFile(path.join(input, file), JSON.stringify(data))
      )
    );

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-transform-types',
        fileURLToPath(new URL('./report.mts', import.meta.url)),
        '--platform=android',
        '--mode=native-release',
        `--input=${input}`,
        `--output=${output}`,
        `--metadata=${metadata}`,
      ],
      { encoding: 'utf8' }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    const summary = JSON.parse(
      await readFile(path.join(output, 'summary.json'), 'utf8')
    );
    assert.equal(summary.valid, false);
    assert.match(result.stderr, /Performance collection failed:/);
    assert.match(result.stderr, /gallery\.json:.*missing-motion-observation/);
    for (const error of summary.errors)
      assert.ok(result.stderr.includes(error));
    assert.match(
      await readFile(path.join(output, 'summary.md'), 'utf8'),
      /Collection failed/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves sample readings and self-describing render counts without changing timing units', () => {
  const data = fixture('gallery');
  data.renderCounting = { version: 1, observed: ['list', 'detail', 'hero'] };
  data.journeys.forEach((journey: InputRecord) => {
    journey.renderCounts = {
      list: { mount: 0, update: 2 },
      detail: { mount: 1, update: 3 },
      hero: { mount: 0, update: 0 },
    };
  });
  const summary = summarize(documents([data]), options);
  assert.equal(summary.valid, true, summary.errors.join());
  const key = 'gallery.forward.renders.hero.update';
  assert.deepEqual(summary.samples[key], [0]);
  assert.equal(summary.metricDefinitions[key].unit, 'count');
  assert.equal(
    summary.metricDefinitions['gallery.forward.requestToSessionActiveMs'].unit,
    'ms'
  );
  assert.match(
    markdown(summary),
    /forward · hero · rerenders \| 1 \| — \| 0 \| —/
  );
  for (const bad of [undefined, -1, 0.5, NaN]) {
    data.journeys[0].renderCounts.hero.update = bad;
    const invalid = summarize(documents([data]), options);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.metrics[key], undefined);
  }
});

function withPreparationTrace(data: InputRecord) {
  data.preparationTracing = {
    version: 2,
    requested: true,
    directions: ['forward', 'backward'],
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
  const forward = data.journeys[0];
  Object.assign(data.journeys[1], {
    requestJsMs: 100,
    sessionActiveJsMs: 140,
    requestToOverlayReadyMs: 60,
    preparationTrace: {
      ...forward.preparationTrace,
      direction: 'backward',
      sessionId: 'session-backward',
      traceId: 'trace-backward',
    },
  });
}

test('optional startup diagnostics use definition 5 and aggregate repeated stages per journey', () => {
  const input = documents();
  withPreparationTrace(input[0].data);
  const summary = summarize(input, options);
  assert.equal(summary.valid, true, summary.errors.join());
  assert.equal(summary.measurementDefinitionVersion, 5);
  assert.equal(
    summary.metrics['gallery.forward.requestToSessionActiveMs']!.median,
    40
  );
  assert.equal(
    summary.metrics['gallery.forward.requestToOverlayReadyMs']!.median,
    60
  );
  assert.equal(
    summary.metrics['gallery.forward.preparation.target-measureMs']!.median,
    12
  );
  assert.equal(
    summary.metrics['gallery.forward.preparation.target-measureMs']!.count,
    1
  );
  assert.equal(
    summary.metrics['gallery.forward.preparation.coordinatorMs']!.median,
    30
  );
  assert.equal(
    summary.metrics['gallery.backward.requestToOverlayReadyMs']!.median,
    60
  );
  assert.equal(
    summary.metrics['gallery.forward.requestToOverlayReadyMs']!.median,
    60
  );
  assert.match(markdown(summary), /not display presentation timestamps/);
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
      summary.metrics['gallery.forward.requestToSessionActiveMs'],
      undefined
    );
    assert.equal(
      summary.metrics['gallery.forward.requestToOverlayReadyMs'],
      undefined
    );
  }
});

test('overlay timeouts fail validation while preserving diagnostic samples', () => {
  const input = documents();
  withPreparationTrace(input[0].data);
  const journey = input[0].data.journeys[0];
  journey.preparationTrace.outcome = 'overlay-timeout';
  delete journey.requestToOverlayReadyMs;
  const summary = summarize(input, options);
  assert.equal(summary.valid, false);
  assert.match(
    summary.errors.join(),
    /gallery.forward: 1\/1 transitions did not confirm overlay presentation/
  );
  assert.deepEqual(summary.preparationDiagnostics['gallery.forward'], {
    tracedJourneys: 1,
    overlayAcknowledgedJourneys: 0,
    overlayTimeoutJourneys: 1,
  });
  assert.equal(
    summary.metrics['gallery.forward.requestToOverlayReadyMs'],
    undefined
  );
  assert.equal(
    summary.metrics['gallery.forward.requestToSessionActiveMs']!.median,
    40
  );
  assert.doesNotMatch(markdown(summary), /Optional startup diagnostics/);
  assert.match(
    markdown(summary),
    /1\/1 transitions did not confirm overlay presentation/
  );

  journey.requestToOverlayReadyMs = 60;
  const invalid = summarize(input, options);
  assert.equal(invalid.valid, false);
  assert.match(
    invalid.errors.join(),
    /timeout must not report observed overlay readiness/
  );
});

test('aggregates native timing data without frame or render metrics', () => {
  const summary = summarize(documents(), options);
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(
    summary.metrics['gallery.native.touchToAcknowledgementMs'],
    undefined
  );
  assert.equal(
    summary.metrics['gallery.react.renderWorkPerUpdateMs'],
    undefined
  );
  assert.equal(
    summary.metrics['gallery.forward.requestToSessionActiveMs']!.p95,
    null
  );
  assert.match(markdown(summary), /informational/);
  assert.match(
    markdown(summary),
    /\| Metric \| Base \| PR \/ current \| Change \|/
  );
  assert.match(markdown(summary), /No baseline supplied/);
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

test('rejects duplicate fixture runs', () => {
  const input = documents();
  input.push(input[0]);
  const summary = summarize(input, options);
  assert.equal(summary.valid, false);
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
    assert.equal(summary.metrics['gallery.payloadMountsPerRun'], undefined);
  }
});

test('requires the requested number of forward and backward timing samples', () => {
  const summary = summarize(documents(), {
    ...options,
    metadata: { timingCycles: 20 },
  });
  assert.equal(summary.valid, false);
  assert.match(
    summary.errors.join(),
    /Total journey count must match measured cycles/
  );
  assert.equal(
    summary.metrics['gallery.forward.requestToSessionActiveMs'],
    undefined
  );
});

test('reports 20 round trips with preparation traces in both directions', () => {
  const input = documents();
  for (const { data } of input.filter(
    (document) => document.data.fixtureVersion
  )) {
    withPreparationTrace(data);
    data.journeys = Array.from({ length: 20 }, () =>
      structuredClone(data.journeys)
    ).flat();
    data.native.exportedAtUptimeMs = 43000;
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
  const summary = summarize(input, {
    ...options,
    metadata: { timingCycles: 20 },
  });
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  assert.equal(summary.measurementDefinitionVersion, 5);
  for (const scenario of SCENARIO_IDS) {
    for (const direction of ['forward', 'backward']) {
      assert.equal(
        summary.metrics[`${scenario}.${direction}.requestToSessionActiveMs`]!
          .count,
        20
      );
      assert.equal(
        summary.preparationDiagnostics[`${scenario}.${direction}`]
          .tracedJourneys,
        20
      );
      assert.equal(
        summary.metrics[`${scenario}.${direction}.preparation.overlay-readyMs`]!
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

test('requires every example and never merges their readings or workload definitions', () => {
  const input = documents();
  input.forEach(({ data }, index) => {
    data.journeys.forEach((journey: InputRecord) => {
      journey.requestToSessionActiveMs = (index + 1) * 10;
    });
  });
  const summary = summarize(input, options);
  assert.equal(summary.valid, true, summary.errors.join());
  SCENARIO_IDS.forEach((scenario, index) => {
    const key = `${scenario}.forward.requestToSessionActiveMs`;
    assert.equal(summary.metrics[key]!.median, (index + 1) * 10);
    assert.equal(
      summary.metricDefinitions[key].workload,
      SCENARIOS[scenario].workload
    );
    const missing = summarize(
      input.filter(({ data }) => data.scenario !== scenario),
      options
    );
    assert.equal(missing.valid, false);
    assert.match(
      missing.errors.join(),
      new RegExp(`Missing valid ${scenario} fixture run`)
    );
  });
  assert.match(markdown(summary), /Trips · tap to motion/);
  assert.match(markdown(summary), /Wallet · back tap to motion/);
});

test("instrumentation changes in one example do not invalidate another example's definitions", () => {
  const input = documents();
  const before = summarize(input, options);
  withPreparationTrace(input[1].data);
  const after = summarize(input, options);
  assert.deepEqual(
    after.metricDefinitions['gallery.forward.requestToSessionActiveMs'],
    before.metricDefinitions['gallery.forward.requestToSessionActiveMs']
  );
  assert.notDeepEqual(
    after.metricDefinitions['trips.forward.requestToSessionActiveMs'],
    before.metricDefinitions['trips.forward.requestToSessionActiveMs']
  );
});

test('rejects duplicate scenarios even when they have different run IDs', () => {
  const input = documents();
  input.push({
    file: 'another-gallery.json',
    data: { ...fixture('gallery'), runId: 'gallery-2' },
  });
  const summary = summarize(input, options);
  assert.equal(summary.valid, false);
  assert.match(summary.errors.join(), /Duplicate scenario/);
  assert.equal(
    summary.metrics['gallery.forward.requestToSessionActiveMs']!.count,
    1
  );
});

test('rejects invalid expected counts and duplicate fixture artifacts', () => {
  for (const metadata of [
    { timingCycles: 0 },
    { timingCycles: 1.5 },
    { timingCycles: 101 },
  ]) {
    assert.match(
      summarize(documents(), { ...options, metadata }).errors.join(),
      /integer between 1 and 99/
    );
  }
  for (const documentIndex of [0]) {
    const input = documents();
    input.push({ ...input[documentIndex], file: 'copied-artifact.json' });
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.match(summary.errors.join(), /Duplicate run ID/);
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

test('rejects every fixture version before the actual Gallery workload', () => {
  for (const fixtureVersion of [1, 2, 3, 4]) {
    const input = documents();
    input[0]!.data.fixtureVersion = fixtureVersion;
    const summary = summarize(input, options);
    assert.equal(summary.valid, false);
    assert.match(summary.errors.join(), /Unsupported fixture schema\/version/);
  }
});

test('rejects unsupported benchmark platforms', () => {
  assert.throws(
    () => summarize(documents(), { ...options, platform: 'web' }),
    /platform must be android/
  );
});

function withMotion(data: InputRecord) {
  data.fixtureVersion = 6;
  data.motionTracing = { version: 1, clock: 'rn-worklets-steady-clock-ms' };
  data.journeys.forEach((journey: InputRecord, index: number) => {
    const offset = index * 1000;
    Object.assign(journey, {
      requestId: index + 1,
      requestJsMs: offset + 100,
      sessionActiveJsMs: offset + 140,
      motion: {
        requestId: index + 1,
        firstMotionMs: offset + 170,
        motionEndMs: offset + 470,
        handoffMs: offset + 480,
      },
    });
    journey.probe.handlerJsMs = offset + 600;
  });
  return data;
}

function sampledDocuments(timingCycles = 20) {
  const input = documents();
  for (const { data } of input) {
    data.journeys = Array.from({ length: timingCycles }, () =>
      structuredClone(data.journeys)
    ).flat();
    withMotion(data);
    data.journeys.forEach((journey: InputRecord, index: number) => {
      // Distinct initial samples make accidental exclusions visible.
      const timing = index < 2 ? 900 : 40;
      journey.requestToSessionActiveMs = timing;
      journey.sessionActiveJsMs = journey.requestJsMs + timing;
      journey.motion.firstMotionMs = journey.sessionActiveJsMs + 30;
      journey.motion.motionEndMs = journey.motion.firstMotionMs + 300;
      journey.motion.handoffMs = journey.motion.motionEndMs + 10;
      journey.probe.handlerJsMs = journey.motion.handoffMs + 100;
    });
    data.native.exportedAtUptimeMs = data.journeys.length * 2000 + 100;
    data.native.touches = data.journeys.map((_: unknown, index: number) => ({
      kind: 'activity-action-up',
      eventUptimeMs: (index + 1) * 2000,
      dispatchUptimeMs: (index + 1) * 2000 + 1,
    }));
    data.native.inputAcknowledgements = data.journeys.map(
      (journey: InputRecord, index: number) => ({
        probe: journey.probe.screen,
        eventUptimeMs: (index + 1) * 2000,
        nativeAckUptimeMs: (index + 1) * 2000 + 8,
        touchToNativeAckMs: 8,
      })
    );
  }
  return input;
}

const sampledOptions = {
  ...options,
  metadata: { timingCycles: 20 },
};

test('includes all 20 round trips in one measured set', () => {
  const summary = summarize(sampledDocuments(), sampledOptions);
  assert.equal(summary.valid, true, summary.errors.join('\n'));
  for (const scenario of SCENARIO_IDS) {
    for (const direction of ['forward', 'backward']) {
      const key = `${scenario}.${direction}.requestToSessionActiveMs`;
      assert.deepEqual(summary.samples[key], [900, ...Array(19).fill(40)]);
      assert.equal(summary.metrics[key]!.count, 20);
      assert.equal(summary.metrics[key]!.median, 40);
      const motionKey = `${scenario}.${direction}.tapToMotion`;
      assert.deepEqual(summary.samples[motionKey], [
        930,
        ...Array(19).fill(70),
      ]);
      assert.equal(summary.metrics[motionKey]!.median, 70);
    }
  }
  assert.equal(
    Object.keys(summary.metrics).some((key) => key.includes('firstRun')),
    false
  );
  const body = markdown(summary);
  assert.doesNotMatch(body, /warm-up|first run|first visit/i);
  assert.match(body, /Gallery · tap to motion \(ms\) \| — \| 70 \| —/);
});

test('a failure in any journey invalidates the entire collection', () => {
  for (const index of [0, 2, 11]) {
    for (const corrupt of [
      (data: InputRecord) => {
        data.journeys[index].failure = 'presentation-failed';
      },
      (data: InputRecord) => {
        delete data.journeys[index].motion;
      },
      (data: InputRecord) => {
        data.native.inputAcknowledgements[index].eventUptimeMs++;
      },
    ]) {
      const input = sampledDocuments();
      corrupt(input[0]!.data);
      const summary = summarize(input, sampledOptions);
      assert.equal(summary.valid, false, `journey ${index}`);
      assert.equal(summary.metrics['gallery.forward.tapToMotion'], undefined);
    }
  }
});

test('unanimated fallback in any journey fails despite valid timing samples', () => {
  for (const index of [0, 2]) {
    const input = sampledDocuments();
    const journey = input[0]!.data.journeys[index];
    journey.preparationTrace = {
      traceId: 'timeout',
      sessionId: journey.sessionId,
      direction: journey.direction,
      groupId: 'photo',
      sourceScreenId: 'list',
      targetScreenId: 'detail',
      clock: 'js-performance-now',
      startedAtMs: journey.requestJsMs + 5,
      completedAtMs: journey.sessionActiveJsMs + 20,
      outcome: 'overlay-timeout',
      droppedStages: 0,
      stages: [
        {
          name: 'coordinator',
          startedAtMs: journey.requestJsMs + 5,
          durationMs: 10,
          completed: true,
        },
      ],
    };
    const summary = summarize(input, sampledOptions);
    assert.equal(summary.valid, false);
    const prefix = 'gallery.forward';
    assert.match(
      summary.errors.join(),
      new RegExp(
        `${prefix}: 1/1 transitions did not confirm overlay presentation`
      )
    );
    assert.equal(summary.metrics['gallery.forward.tapToMotion']!.count, 20);
    assert.equal(summary.metrics['gallery.forward.tapToMotion']!.median, 70);
    assert.equal(
      summary.preparationDiagnostics[prefix].overlayTimeoutJourneys,
      1
    );
  }
});

test('rejects missing or extra round trips and invalid measured cycle counts', () => {
  for (const timingCycles of [19, 21]) {
    const summary = summarize(sampledDocuments(timingCycles), sampledOptions);
    assert.equal(summary.valid, false);
    assert.match(summary.errors.join(), /Total journey count must match/);
  }
  for (const change of [
    { timingCycles: 0 },
    { timingCycles: 100 },
    { timingCycles: 1.5 },
  ]) {
    const summary = summarize(sampledDocuments(), {
      ...sampledOptions,
      metadata: { ...sampledOptions.metadata, ...change },
    });
    assert.equal(summary.valid, false);
    assert.match(summary.errors.join(), /cycles|round trips/);
  }
});

for (const platform of ['android', 'ios']) {
  test(`${platform}: reports preparation and all three motion metrics for every example`, () => {
    const input = documents();
    input.forEach(({ data }) => {
      withMotion(data);
      data.native.platform = platform;
      data.native.clock = `${platform}-uptime-ms`;
      data.native.touches.forEach((touch: InputRecord) => {
        touch.kind =
          platform === 'ios' ? 'window-touch-ended' : 'activity-action-up';
      });
    });
    const summary = summarize(input, { ...options, platform });
    assert.equal(summary.valid, true, summary.errors.join());
    input.forEach(({ data }) => {
      data.motionTracing.version = 2;
    });
    const synchronous = summarize(input, { ...options, platform });
    assert.equal(synchronous.valid, true, synchronous.errors.join());
    assert.deepEqual(synchronous.metrics, summary.metrics);
    const body = markdown(summary);
    for (const scenario of SCENARIO_IDS)
      for (const direction of ['forward', 'backward']) {
        const prefix = `${scenario}.${direction}`;
        assert.match(
          body,
          new RegExp(
            `${SCENARIOS[scenario].label} · ${direction === 'forward' ? 'open' : 'return'} preparation \\(ms\\) \\| — \\| 40 \\| —`
          )
        );
        assert.equal(summary.metrics[`${prefix}.tapToMotion`]!.median, 70);
        assert.equal(
          summary.metrics[`${prefix}.transitionDuration`]!.median,
          300
        );
        assert.equal(summary.metrics[`${prefix}.handoffDuration`]!.median, 10);
        assert.equal(
          summary.metricDefinitions[`${prefix}.tapToMotion`].clock,
          'rn-worklets-steady-clock-ms'
        );
        for (const metric of [
          'tapToMotion',
          'transitionDuration',
          'handoffDuration',
        ]) {
          const previous = summary.metricDefinitions[`${prefix}.${metric}`];
          const current = synchronous.metricDefinitions[`${prefix}.${metric}`];
          assert.match(previous.instrumentation, /\+ui-motion-v1$/);
          assert.match(current.instrumentation, /\+ui-motion-v2$/);
          assert.equal(
            sameDefinition(previous, current),
            false,
            'synchronous observations must not compare against mapper sampling'
          );
        }
      }
    assert.doesNotMatch(body, /preparation\.[a-z-]+Ms|requestToOverlayReadyMs/);
    input[0].data.native.platform = platform === 'ios' ? 'android' : 'ios';
    assert.equal(
      summarize(input, { ...options, platform }).valid,
      false,
      'native evidence must match the lane'
    );
  });
}

test('missing or inconsistent motion evidence fails the whole fixture without partial new metrics', () => {
  for (const mutate of [
    (data: InputRecord) => {
      delete data.motionTracing;
    },
    (data: InputRecord) => {
      data.motionTracing.clock = 'ios-uptime-ms';
    },
    (data: InputRecord) => {
      data.motionTracing.version = 3;
    },
    (data: InputRecord) => {
      delete data.journeys[0].motion;
    },
    (data: InputRecord) => {
      data.journeys[0].motion.requestId = 2;
    },
    (data: InputRecord) => {
      data.journeys[0].motion.firstMotionMs = 139;
    },
    (data: InputRecord) => {
      data.journeys[0].motion.motionEndMs = 170;
    },
    (data: InputRecord) => {
      data.journeys[0].motion.handoffMs = 469;
    },
    (data: InputRecord) => {
      data.journeys[0].motion.handoffMs = 601;
    },
    (data: InputRecord) => {
      data.journeys[0].motion.motionEndMs = NaN;
    },
  ]) {
    const data = withMotion(fixture('gallery'));
    mutate(data);
    const summary = summarize(documents([data]), options);
    assert.equal(summary.valid, false);
    assert.equal(summary.metrics['gallery.forward.tapToMotion'], undefined);
  }
});
