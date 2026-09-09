import type { InputRecord } from './types.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseXCTestMetrics } from './xctest-metrics.mts';

function metric(
  kind: 'launch' | 'clock' | 'peak' | 'change',
  measurements: unknown[] = [1, 2]
): InputRecord {
  const fields = {
    launch: [
      'Application Launch',
      'com.apple.dt.XCTMetric_ApplicationLaunch.duration',
      's',
    ],
    clock: [
      'Clock Monotonic Time',
      'com.apple.dt.XCTMetric_Clock.time.monotonic',
      's',
    ],
    peak: [
      'Memory Peak Physical',
      'com.apple.dt.XCTMetric_Memory.physical_peak',
      'kB',
    ],
    change: ['Memory Physical', 'com.apple.dt.XCTMetric_Memory.physical', 'kB'],
  };
  const [displayName, identifier, unitOfMeasurement] = fields[kind];
  return { displayName, identifier, unitOfMeasurement, measurements };
}

function run(metrics: InputRecord[]): InputRecord {
  return {
    device: { deviceId: 'sim-1', deviceName: 'iPhone Simulator' },
    testPlanConfiguration: {
      configurationId: '1',
      configurationName: 'Test Scheme Action',
    },
    metrics,
  };
}

function nativeCase(name: string, metrics: InputRecord[]) {
  return {
    testIdentifier: `PerformanceTests/${name}()`,
    testRuns: [run(metrics)],
  };
}

function complete() {
  return ['Ordinary', 'Live'].flatMap((scenario) => [
    nativeCase(`test${scenario}Launch`, [metric('launch', [0.3, 0.4])]),
    nativeCase(`test${scenario}RoundTrip`, [
      metric('clock', [1.2, 1.4]),
      metric('peak', [24822.48, 25000]),
      metric('change', [-16.384, 32.768]),
    ]),
  ]);
}

test('collects all required cases, preserving native seconds and signed memory deltas', () => {
  const result = parseXCTestMetrics(complete());
  assert.ok(Object.values(result.coverage).every(Boolean));
  assert.deepEqual(
    result.metrics['ios.ordinary.xctest.applicationLaunchSeconds'],
    [0.3, 0.4]
  );
  assert.deepEqual(
    result.metrics['ios.live.xctest.roundTripSeconds'],
    [1.2, 1.4]
  );
  assert.deepEqual(
    result.metrics['ios.live.xctest.memoryPeakPhysical_kB'],
    [24822.48, 25000]
  );
  assert.deepEqual(
    result.metrics['ios.live.xctest.memoryPhysicalChange_kB'],
    [-16.384, 32.768]
  );
  assert.equal(
    result.definitions['ios.live.xctest.roundTripSeconds'].unitOfMeasurement,
    's'
  );
  assert.equal(result.deviceId, 'sim-1');
  assert.deepEqual(result.errors, []);
});

test('normalizes declared time units without assuming memory bytes', () => {
  const input = complete();
  const launch = input[0].testRuns[0].metrics[0];
  launch.unitOfMeasurement = 'ms';
  launch.measurements = [300, 400];
  const result = parseXCTestMetrics(input);
  assert.deepEqual(
    result.metrics['ios.ordinary.xctest.applicationLaunchSeconds'],
    [0.3, 0.4]
  );
  assert.ok(result.metrics['ios.ordinary.xctest.memoryPeakPhysical_kB']);
});

test('uses documented display names when optional identifiers are absent', () => {
  const input = complete();
  for (const item of input)
    for (const value of item.testRuns[0].metrics) delete value.identifier;
  assert.ok(Object.values(parseXCTestMetrics(input).coverage).every(Boolean));
});

test('accepts target-prefixed exact test IDs and merges repeated runs from one device', () => {
  const input = complete();
  input[0].testIdentifier = `PerformanceTests/${input[0].testIdentifier}`;
  input[0].testRuns.push(run([metric('launch', [0.5])]));
  assert.deepEqual(
    parseXCTestMetrics(input).metrics[
      'ios.ordinary.xctest.applicationLaunchSeconds'
    ],
    [0.3, 0.4, 0.5]
  );
});

test('leaves absent coverage false; profile cases and unrelated tests cannot satisfy it', () => {
  const input = complete().filter(
    (item) => !item.testIdentifier.includes('testLiveRoundTrip')
  );
  input.push(
    nativeCase('testLiveReactProfile', [metric('clock'), metric('peak')])
  );
  input.push(
    nativeCase('testLiveRoundTripAgain', [metric('clock'), metric('peak')])
  );
  input.push({
    ...nativeCase('testLiveRoundTrip', [metric('clock'), metric('peak')]),
    testIdentifier: 'OtherTests/testLiveRoundTrip()',
  });
  const result = parseXCTestMetrics(input);
  assert.equal(result.coverage.liveClock, false);
  assert.equal(result.coverage.liveMemory, false);
  assert.equal(result.coverage.liveLaunch, true);
});

test('memory delta without measured footprint does not satisfy memory coverage', () => {
  const input = [
    nativeCase('testOrdinaryRoundTrip', [
      metric('clock'),
      metric('change', [0]),
    ]),
  ];
  assert.equal(parseXCTestMetrics(input).coverage.ordinaryMemory, false);
});

test('rejects empty, wrapped, profile-only, and malformed exports', () => {
  for (const input of [
    null,
    [],
    {},
    { metrics: complete() },
    [{ testIdentifier: 'x' }],
  ]) {
    assert.throws(() => parseXCTestMetrics(input));
  }
  assert.throws(
    () =>
      parseXCTestMetrics([
        nativeCase('testLiveReactProfile', [metric('clock')]),
      ]),
    /No usable/
  );
  const input = complete();
  input[0].testRuns = [];
  assert.throws(() => parseXCTestMetrics(input), /no test runs/);
});

test('rejects missing samples, invalid numbers, negative time, and zero memory footprint', () => {
  for (const measurements of [[], [NaN], [Infinity], ['1'], [null], [-0.1]]) {
    const input = [
      nativeCase('testOrdinaryLaunch', [metric('launch', measurements)]),
    ];
    assert.throws(() => parseXCTestMetrics(input));
  }
  assert.throws(
    () =>
      parseXCTestMetrics([
        nativeCase('testOrdinaryRoundTrip', [metric('peak', [0])]),
      ]),
    /Zero XCTest memory/
  );
  assert.throws(
    () =>
      parseXCTestMetrics([
        nativeCase('testOrdinaryRoundTrip', [metric('peak', [-1])]),
      ]),
    /negative/
  );
});

test('rejects unsupported or conflicting units and duplicate metric kinds', () => {
  const input = complete();
  input[0].testRuns[0].metrics[0].unitOfMeasurement = 'ticks';
  assert.throws(
    () => parseXCTestMetrics(input),
    /Unsupported XCTest time unit/
  );
  const duplicate = [
    nativeCase('testOrdinaryRoundTrip', [metric('clock'), metric('clock')]),
  ];
  assert.throws(() => parseXCTestMetrics(duplicate), /Duplicate clock/);
  const mixed = [nativeCase('testOrdinaryRoundTrip', [metric('peak')])];
  mixed[0].testRuns.push(run([{ ...metric('peak'), unitOfMeasurement: 'MB' }]));
  assert.throws(() => parseXCTestMetrics(mixed), /Mixed XCTest memory units/);
  const conflict = metric('clock');
  conflict.displayName = 'Memory Physical';
  assert.throws(
    () => parseXCTestMetrics([nativeCase('testOrdinaryRoundTrip', [conflict])]),
    /conflicts/
  );
});

test('rejects mixing devices or configurations and missing schema-required provenance', () => {
  for (const field of ['device', 'testPlanConfiguration']) {
    const input = complete();
    delete input[0].testRuns[0][field];
    assert.throws(() => parseXCTestMetrics(input));
  }
  const devices = complete();
  devices[1].testRuns[0].device.deviceId = 'another-device';
  assert.throws(() => parseXCTestMetrics(devices), /different XCTest devices/);
  const configurations = complete();
  configurations[1].testRuns[0].testPlanConfiguration.configurationId =
    'another-configuration';
  assert.throws(
    () => parseXCTestMetrics(configurations),
    /different XCTest devices/
  );
});
