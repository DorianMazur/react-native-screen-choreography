import type { InputRecord, MeasurementDocument } from './types.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, summarize, markdown } from './report.mts';
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
  metadata: { timingCycles: 1 },
};

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
    /Timing journey count must match expected cycles/
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
      /integer between 1 and 100/
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
