import type { InputRecord, MetricSamples, MetricDefinition } from './types.ts';
// xcresulttool get test-results metrics (schema 0.1.0).
// The array/run/metric shape and Clock/Memory identifiers were checked against
// a real Xcode 26.6 XCTest export. Native values keep explicit units.
const IDENTIFIERS = new Map([
  ['com.apple.dt.XCTMetric_Clock.time.monotonic', 'clock'],
  ['com.apple.dt.XCTMetric_Memory.physical_peak', 'memoryPeak'],
  ['com.apple.dt.XCTMetric_Memory.physical', 'memoryChange'],
]);
const DISPLAY_NAMES = new Map([
  ['Clock Monotonic Time', 'clock'],
  ['Memory Peak Physical', 'memoryPeak'],
  ['Memory Physical', 'memoryChange'],
]);
const SECONDS_PER_UNIT = new Map([
  ['s', 1],
  ['sec', 1],
  ['seconds', 1],
  ['ms', 0.001],
  ['milliseconds', 0.001],
  ['us', 0.000001],
  ['µs', 0.000001],
  ['μs', 0.000001],
  ['ns', 0.000000001],
]);
const MEMORY_UNITS = new Set([
  'B',
  'bytes',
  'kB',
  'KB',
  'KiB',
  'MB',
  'MiB',
  'GB',
  'GiB',
]);

function object(value: unknown, label: string): InputRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as InputRecord;
}

function nonemptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be a nonempty string`);
  return value;
}

function metricKind(metric: InputRecord) {
  const byId =
    IDENTIFIERS.get(metric.identifier) ??
    (/^com\.apple\.dt\.XCTMetric_ApplicationLaunch(?:[_.].+)?$/.test(
      metric.identifier ?? ''
    )
      ? 'launch'
      : null);
  const byName =
    DISPLAY_NAMES.get(metric.displayName) ??
    (/^Application Launch(?: Time| Duration)?(?: \(.+\))?$/.test(
      metric.displayName
    )
      ? 'launch'
      : null);
  if (byId && byName && byId !== byName)
    throw new Error('XCTest metric identifier conflicts with its display name');
  return byId ?? byName;
}

function measurementDefinition(kind: string, unit: string) {
  if (kind === 'launch' || kind === 'clock') {
    if (!SECONDS_PER_UNIT.has(unit))
      throw new Error(`Unsupported XCTest time unit: ${unit}`);
    return {
      suffix:
        kind === 'launch' ? 'applicationLaunchSeconds' : 'roundTripSeconds',
      unit: 's',
      multiplier: SECONDS_PER_UNIT.get(unit)!,
      meaning:
        kind === 'launch'
          ? 'System-defined application launch to first displayed frame and responsive main thread; not React-ready time or OS-cold-cache latency.'
          : 'Automation-driven warm round trip including XCTest taps, waits, and real input acknowledgments; not animation duration.',
    };
  }
  if (!MEMORY_UNITS.has(unit))
    throw new Error(`Unsupported XCTest memory unit: ${unit}`);
  return {
    suffix: `${kind === 'memoryPeak' ? 'memoryPeakPhysical' : 'memoryPhysicalChange'}_${unit}`,
    // Keep Apple's exact memory unit rather than guessing whether kB means KiB.
    unit,
    multiplier: 1,
    meaning:
      kind === 'memoryPeak'
        ? 'XCTest peak physical memory of the application during the measured warm round trip.'
        : 'XCTest physical-memory change across the measured interval; may be negative and is not an idle retention or leak measurement.',
  };
}

/**
 * Parse only the four native PerformanceTests cases. Missing individual cases
 * are represented by false coverage flags so the caller can impose lane policy.
 * Malformed exports or exports with no usable native data throw; absent is never
 * treated as zero. Profile-only test cases do not satisfy native coverage.
 */
export function parseXCTestMetrics(data: unknown) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('XCTest metrics must be a nonempty TestWithMetrics array');
  }
  const metrics: MetricSamples = {};
  const definitions: Record<string, MetricDefinition> = {};
  const coverage: Record<string, boolean> = {
    ordinaryLaunch: false,
    liveLaunch: false,
    ordinaryMemory: false,
    liveMemory: false,
    ordinaryClock: false,
    liveClock: false,
  };
  const deviceIds = new Set<string>();
  const configurationIds = new Set<string>();
  const unitsByKind = new Map<string, string>();
  let acceptedMetrics = 0;

  for (const [testIndex, testValue] of data.entries()) {
    const test = object(testValue, `XCTest test[${testIndex}]`);
    nonemptyString(test.testIdentifier, 'testIdentifier');
    if (!Array.isArray(test.testRuns))
      throw new Error('XCTest testRuns must be an array');
    // xcresulttool normally emits Class/method(). Allow an explicit target
    // prefix too, but never match another class or a similarly named method.
    const match =
      /^(?:PerformanceTests\/)?PerformanceTests\/test(Ordinary|Live)(Launch|RoundTrip)(?:\(\))?$/.exec(
        test.testIdentifier
      );
    if (!match) continue;
    if (!test.testRuns.length)
      throw new Error(`${test.testIdentifier} has no test runs`);
    const scenario = match[1].toLowerCase();
    const phase = match[2];

    for (const [runIndex, runValue] of test.testRuns.entries()) {
      const run = object(runValue, `${test.testIdentifier} run[${runIndex}]`);
      object(run.device, 'XCTest device');
      nonemptyString(run.device.deviceName, 'XCTest deviceName');
      deviceIds.add(nonemptyString(run.device.deviceId, 'XCTest deviceId'));
      object(run.testPlanConfiguration, 'XCTest testPlanConfiguration');
      nonemptyString(
        run.testPlanConfiguration.configurationName,
        'XCTest configurationName'
      );
      configurationIds.add(
        nonemptyString(
          run.testPlanConfiguration.configurationId,
          'XCTest configurationId'
        )
      );
      if (deviceIds.size > 1 || configurationIds.size > 1) {
        throw new Error(
          'Do not combine different XCTest devices or test-plan configurations in one report'
        );
      }
      if (!Array.isArray(run.metrics) || !run.metrics.length) {
        throw new Error(`${test.testIdentifier} has no metric records`);
      }
      const seenKinds = new Set<string>();
      for (const metricValue of run.metrics) {
        const metric = object(metricValue, 'XCTest metric');
        nonemptyString(metric.displayName, 'XCTest metric displayName');
        const sourceUnit = nonemptyString(
          metric.unitOfMeasurement,
          'XCTest unitOfMeasurement'
        );
        if (metric.identifier !== undefined)
          nonemptyString(metric.identifier, 'XCTest metric identifier');
        if (
          !Array.isArray(metric.measurements) ||
          !metric.measurements.length
        ) {
          throw new Error(`${metric.displayName} has no measurements`);
        }
        if (
          metric.measurements.some(
            (value) => typeof value !== 'number' || !Number.isFinite(value)
          )
        ) {
          throw new Error(
            `${metric.displayName} has a nonfinite or nonnumeric measurement`
          );
        }
        const kind = metricKind(metric);
        if (!kind || (phase === 'Launch') !== (kind === 'launch')) continue;
        if (seenKinds.has(kind))
          throw new Error(`Duplicate ${kind} metric in ${test.testIdentifier}`);
        seenKinds.add(kind);
        if (
          kind !== 'memoryChange' &&
          metric.measurements.some((value) => value < 0)
        ) {
          throw new Error(
            `${metric.displayName} cannot have negative measurements`
          );
        }
        if (
          kind === 'memoryPeak' &&
          metric.measurements.some((value) => value === 0)
        ) {
          throw new Error(
            'Zero XCTest memory footprint indicates missing application measurement'
          );
        }
        const definition = measurementDefinition(kind, sourceUnit);
        // Time units have a defined conversion; memory keeps its source unit.
        const kindKey = `${scenario}.${kind}`;
        if (kind.startsWith('memory')) {
          const previousUnit = unitsByKind.get(kindKey);
          if (previousUnit && previousUnit !== sourceUnit)
            throw new Error('Mixed XCTest memory units across runs');
          unitsByKind.set(kindKey, sourceUnit);
        }
        const key = `ios.${scenario}.xctest.${definition.suffix}`;
        const samples = (metric.measurements as number[]).map(
          (value) => value * definition.multiplier
        );
        if (samples.some((value) => !Number.isFinite(value)))
          throw new Error('XCTest unit conversion overflow');
        (metrics[key] ??= []).push(...samples);
        definitions[key] ??= {
          source: 'xcresulttool-test-results-metrics-0.1.0',
          displayName: metric.displayName,
          identifier: metric.identifier ?? null,
          unitOfMeasurement: definition.unit,
          meaning: definition.meaning,
        };
        acceptedMetrics++;
        if (kind === 'launch') coverage[`${scenario}Launch`] = true;
        if (kind === 'clock') coverage[`${scenario}Clock`] = true;
        if (kind === 'memoryPeak') coverage[`${scenario}Memory`] = true;
      }
    }
  }

  if (!acceptedMetrics)
    throw new Error('No usable native PerformanceTests metrics found');
  return {
    metrics,
    coverage,
    definitions,
    errors: [],
    deviceId: [...deviceIds][0],
    configurationId: [...configurationIds][0],
  };
}
