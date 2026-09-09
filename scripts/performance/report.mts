import type {
  InputRecord,
  MetricSamples,
  MeasurementDocument,
} from './types.ts';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseXCTestMetrics } from './xctest-metrics.mts';
import { execFileSync } from 'node:child_process';

const SCENARIOS = ['ordinary', 'live'];
const MODES = ['native-release', 'react-profile'];

function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite nonnegative number`);
  }
  return value;
}

export function distribution(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => {
    const index = (sorted.length - 1) * fraction;
    const lower = Math.floor(index);
    return (
      sorted[lower] +
      (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower)
    );
  };
  return {
    count: sorted.length,
    min: sorted[0],
    median: at(0.5),
    // Small samples do not support a meaningful tail estimate.
    p95: sorted.length >= 20 ? at(0.95) : null,
    max: sorted.at(-1),
  };
}

function add(metrics: MetricSamples, name: string, value: number) {
  (metrics[name] ??= []).push(value);
}

function readFixture(
  report: InputRecord,
  mode: string,
  metrics: MetricSamples,
  platform: string
) {
  if (report.schemaVersion !== 1 || report.fixtureVersion !== 1) {
    throw new Error('Unsupported fixture schema/version');
  }
  if (!SCENARIOS.includes(report.scenario))
    throw new Error('Unknown fixture scenario');
  if (report.clock !== 'js-performance-now')
    throw new Error('Unknown JS clock domain');
  if (
    report.valid !== true ||
    !Array.isArray(report.errors) ||
    report.errors.length
  ) {
    throw new Error(
      `Fixture did not complete: ${JSON.stringify(report.errors)}`
    );
  }
  if (report.droppedSamples !== 0)
    throw new Error('Fixture lost telemetry samples');
  if (!Array.isArray(report.journeys) || report.journeys.length < 2) {
    throw new Error('Fixture must contain a complete forward/back round trip');
  }
  const directions = new Set<string>();
  for (const journey of report.journeys) {
    if (!['forward', 'backward'].includes(journey.direction))
      throw new Error('Unknown direction');
    if (journey.failure || !journey.probe || !journey.sessionId) {
      throw new Error('Incomplete journey or unacknowledged destination input');
    }
    const expectedScreen = journey.direction === 'forward' ? 'detail' : 'list';
    if (journey.probe.screen !== expectedScreen)
      throw new Error('Probe acknowledged on wrong screen');
    if (
      journey.probe.meaning !==
      'observed-successful-probe-upper-bound-including-test-wait'
    ) {
      throw new Error('Unknown probe timing definition');
    }
    const prefix = `${report.scenario}.${journey.direction}`;
    directions.add(journey.direction);
    for (const key of [
      'requestToSessionActiveMs',
      'sessionActiveToEndMs',
      'requestToSessionEndMs',
    ]) {
      add(metrics, `${prefix}.${key}`, finite(journey[key], key));
    }
    for (const key of [
      'requestToProbeHandlerMs',
      'sessionEndToProbeHandlerMs',
    ]) {
      add(metrics, `${prefix}.${key}`, finite(journey.probe[key], key));
    }
  }
  if (directions.size !== 2)
    throw new Error('Missing forward or backward journey');
  const react = report.reactProfiling;
  if (!react || react.requested !== (mode === 'react-profile')) {
    throw new Error('Fixture profiling mode does not match this artifact');
  }
  if (!Array.isArray(react.observations))
    throw new Error('Missing React observations array');
  if (mode === 'react-profile') {
    if (
      react.supported !== true ||
      react.status !== 'observed' ||
      !react.observations.length
    ) {
      throw new Error(
        'Profiling was requested but React emitted no timing observations'
      );
    }
    let total = 0;
    for (const observation of react.observations) {
      total += finite(observation.actualDurationMs, 'actualDurationMs');
      finite(observation.reactCommitTimeMs, 'React commit timestamp');
      add(
        metrics,
        `${report.scenario}.react.renderWorkPerUpdateMs`,
        observation.actualDurationMs
      );
    }
    add(metrics, `${report.scenario}.react.renderWorkPerRunMs`, total);
    add(
      metrics,
      `${report.scenario}.react.committedUpdatesPerRun`,
      react.observations.length
    );
  } else if (react.supported || react.observations.length) {
    throw new Error(
      'Native release artifact unexpectedly contains React profiling data'
    );
  }
  add(
    metrics,
    `${report.scenario}.payloadMountsPerRun`,
    finite(report.payloadMounts, 'payloadMounts')
  );
  add(
    metrics,
    `${report.scenario}.payloadUnmountsPerRun`,
    finite(report.payloadUnmounts, 'payloadUnmounts')
  );
  if (platform === 'android') readAndroidInput(report, metrics);
}

function readAndroidInput(report: InputRecord, metrics: MetricSamples) {
  const native = report.native;
  if (
    !native ||
    native.platform !== 'android' ||
    native.clock !== 'android-uptime-ms'
  ) {
    throw new Error(
      'Missing Android input measurements or unknown native clock domain'
    );
  }
  if (native.droppedSamples !== 0)
    throw new Error('Native recorder lost telemetry samples');
  if (
    !Array.isArray(native.inputAcknowledgements) ||
    native.inputAcknowledgements.length !== report.journeys.length
  ) {
    throw new Error(
      'Native input acknowledgement count must match journey count'
    );
  }
  if (!Array.isArray(native.touches))
    throw new Error('Missing recorded native touch events');
  const exportedAt = finite(
    native.exportedAtUptimeMs,
    'Native export timestamp'
  );
  const usedTouches = new Set<number>();
  let previousAck = -1;
  for (const [index, ack] of native.inputAcknowledgements.entries()) {
    if (ack.probe !== report.journeys[index].probe.screen) {
      throw new Error(
        'Native input probe order must match journey destinations'
      );
    }
    const eventTime = finite(ack.eventUptimeMs, 'Native touch timestamp');
    const ackTime = finite(
      ack.nativeAckUptimeMs,
      'Native acknowledgement timestamp'
    );
    const latency = finite(ack.touchToNativeAckMs, 'touchToNativeAckMs');
    if (
      ackTime < eventTime ||
      ackTime < previousAck ||
      ackTime > exportedAt ||
      Math.abs(ackTime - eventTime - latency) > 0.000001
    ) {
      throw new Error('Native input timestamps and latency are inconsistent');
    }
    const touchIndex = native.touches.findIndex(
      (touch: InputRecord, candidate: number) =>
        !usedTouches.has(candidate) &&
        touch.kind === 'activity-action-up' &&
        touch.eventUptimeMs === eventTime
    );
    if (touchIndex === -1)
      throw new Error(
        'Native input acknowledgement has no distinct recorded touch'
      );
    const dispatchTime = finite(
      native.touches[touchIndex].dispatchUptimeMs,
      'Native touch dispatch timestamp'
    );
    if (dispatchTime < eventTime || dispatchTime > ackTime) {
      throw new Error(
        'Native touch dispatch timestamp is outside its event/acknowledgement interval'
      );
    }
    usedTouches.add(touchIndex);
    previousAck = ackTime;
    add(metrics, `${report.scenario}.native.touchToAcknowledgementMs`, latency);
  }
}

function expectedCount(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new Error(`${label} must be an integer between 1 and 100`);
  }
  return value;
}

function readMemory(
  report: InputRecord,
  mode: string,
  metrics: MetricSamples,
  expectedCycles: number | undefined
) {
  if (report.schemaVersion !== 1 || !SCENARIOS.includes(report.scenario)) {
    throw new Error('Unsupported memory report');
  }
  if (report.reactProfile !== (mode === 'react-profile'))
    throw new Error('Memory build mode mismatch');
  if (!Array.isArray(report.samples) || !report.samples.length)
    throw new Error('Empty memory report');
  const iterations = new Map();
  let peak = 0;
  for (const sample of report.samples) {
    if (!['baseline', 'detail', 'after-back'].includes(sample.phase))
      throw new Error('Unknown memory checkpoint');
    if (!Number.isInteger(sample.iteration) || sample.iteration < 0)
      throw new Error('Invalid memory iteration');
    const phases = iterations.get(sample.iteration) ?? new Map();
    if (phases.has(sample.phase))
      throw new Error('Duplicate memory checkpoint within an iteration');
    phases.set(sample.phase, sample);
    iterations.set(sample.iteration, phases);
    const pss = finite(sample.totalPssKb, 'totalPssKb');
    if (pss === 0)
      throw new Error(
        'Zero process footprint indicates missing memory collection'
      );
    peak = Math.max(peak, pss);
    add(metrics, `${report.scenario}.memory.${sample.phase}.pssKb`, pss);
    // RSS availability differs by Android API. Missing is not zero.
    if (sample.totalRssKb !== null && sample.totalRssKb !== undefined) {
      add(
        metrics,
        `${report.scenario}.memory.${sample.phase}.rssKb`,
        finite(sample.totalRssKb, 'totalRssKb')
      );
    }
  }
  const count = expectedCycles ?? iterations.size;
  if (iterations.size !== count)
    throw new Error(
      `Memory iteration count must match expected cycles (${count})`
    );
  for (let iteration = 0; iteration < count; iteration += 1) {
    if (iterations.get(iteration)?.size !== 3) {
      throw new Error(
        `Missing baseline/detail/after-back memory checkpoint for iteration ${iteration}`
      );
    }
  }
  const baseline = iterations.get(0).get('baseline').totalPssKb;
  const afterBack = iterations.get(count - 1).get('after-back').totalPssKb;
  add(metrics, `${report.scenario}.memory.sampledPeakPssKb`, peak);
  add(
    metrics,
    `${report.scenario}.memory.retainedPssDeltaKb`,
    afterBack - baseline
  );
}

function readMacrobenchmark(
  report: InputRecord,
  metrics: MetricSamples,
  expectedIterations: number | undefined,
  existingNames: Set<string>
) {
  const coverage = new Set<string>();
  for (const benchmark of report.benchmarks) {
    const name = String(benchmark.name ?? '');
    const match =
      /^(coldStartup|warmStartup|transitionFrames)\[(ordinary|live)\]$/.exec(
        name
      );
    if (!match) throw new Error(`Unexpected Android benchmark name: ${name}`);
    if (existingNames.has(name) || coverage.has(name))
      throw new Error(`Duplicate Android benchmark: ${name}`);
    const [, kind] = match;
    for (const [key, value] of Object.entries(
      (benchmark.metrics as Record<string, InputRecord>) ?? {}
    )) {
      if (!Array.isArray(value.runs) || !value.runs.length)
        throw new Error(`Missing ${name}.${key} runs`);
      if (
        expectedIterations !== undefined &&
        value.runs.length !== expectedIterations
      ) {
        throw new Error(
          `${name}.${key} run count must match expected iterations (${expectedIterations})`
        );
      }
      const samples = value.runs;
      for (const sample of samples) {
        add(
          metrics,
          `android.${name}.${key}`,
          finite(sample, `${name}.${key}`)
        );
      }
    }
    for (const [key, value] of Object.entries(
      (benchmark.sampledMetrics as Record<string, InputRecord>) ?? {}
    )) {
      if (
        !Array.isArray(value.runs) ||
        !value.runs.length ||
        value.runs.some((run) => !Array.isArray(run) || !run.length)
      ) {
        throw new Error(`Missing per-iteration ${name}.${key} samples`);
      }
      if (
        expectedIterations !== undefined &&
        value.runs.length !== expectedIterations
      ) {
        throw new Error(
          `${name}.${key} run count must match expected iterations (${expectedIterations})`
        );
      }
      const samples = value.runs.flat();
      for (const sample of samples) {
        // Negative overrun means the frame finished before its deadline.
        if (
          typeof sample !== 'number' ||
          !Number.isFinite(sample) ||
          (key !== 'frameOverrunMs' && sample < 0)
        )
          throw new Error(`Invalid ${key} sample`);
        add(metrics, `android.${name}.${key}`, sample);
      }
      if (key === 'frameOverrunMs' && samples.length) {
        add(
          metrics,
          `android.${name}.deadlineOverrunPercent`,
          (100 * samples.filter((sample) => sample > 0).length) / samples.length
        );
      }
    }
    if (kind === 'transitionFrames') {
      if (!benchmark.sampledMetrics?.frameOverrunMs?.runs?.length) {
        throw new Error(
          `Missing ${name} native frame-overrun measurements (requires API 31+)`
        );
      }
    } else {
      for (const metric of ['timeToInitialDisplayMs', 'timeToFullDisplayMs']) {
        if (!benchmark.metrics?.[metric]?.runs?.length) {
          throw new Error(
            `Missing ${name} native startup measurement: ${metric}`
          );
        }
      }
    }
    coverage.add(name);
  }
  return coverage;
}

export function summarize(
  documents: MeasurementDocument[],
  {
    platform,
    mode,
    metadata = {},
  }: { platform: string; mode: string; metadata?: Record<string, unknown> }
) {
  if (!['android', 'ios'].includes(platform))
    throw new Error('platform must be android or ios');
  if (!MODES.includes(mode)) throw new Error('Unknown build mode');
  const metrics: MetricSamples = {};
  const errors = [];
  const fixtures = new Set<string>();
  const memories = new Set<string>();
  const sources = [];
  const runIds = new Set<string>();
  const nativeBenchmarks = new Set<string>();
  let xctest;
  let expectedIterations;
  let expectedCycles;
  try {
    expectedIterations = expectedCount(
      metadata.iterations,
      'Expected iterations'
    );
    expectedCycles = expectedCount(
      metadata.memoryCycles,
      'Expected memory cycles'
    );
  } catch (error) {
    errors.push(
      `metadata: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  for (const { file, data } of documents) {
    try {
      // Keep invalid producers from partially contributing plausible metrics.
      const documentMetrics: MetricSamples = {};
      if (Array.isArray(data)) {
        if (platform !== 'ios') continue;
        if (xctest)
          throw new Error(
            'Duplicate XCTest export would double-count measurements'
          );
        // The profiling cases intentionally emit no XCTest performance metrics.
        if (mode === 'react-profile' && data.length === 0) continue;
        const parsed = parseXCTestMetrics(data);
        if (mode === 'react-profile')
          throw new Error(
            'Native XCTest timings found in React profiling artifact'
          );
        Object.assign(documentMetrics, parsed.metrics);
        xctest = parsed;
        sources.push(file);
      } else if (data.fixtureVersion !== undefined) {
        if (typeof data.runId !== 'string' || !data.runId)
          throw new Error('Missing run ID');
        if (runIds.has(data.runId))
          throw new Error('Duplicate run ID would double-count timings');
        readFixture(data, mode, documentMetrics, platform);
        runIds.add(data.runId);
        fixtures.add(data.scenario);
        sources.push(file);
      } else if (data.kind === 'memory') {
        if (memories.has(data.scenario))
          throw new Error(
            'Duplicate memory report would double-count checkpoints'
          );
        readMemory(data, mode, documentMetrics, expectedCycles);
        memories.add(data.scenario);
        sources.push(file);
      } else if (Array.isArray(data.benchmarks)) {
        const coverage = readMacrobenchmark(
          data,
          documentMetrics,
          expectedIterations,
          nativeBenchmarks
        );
        for (const name of coverage) nativeBenchmarks.add(name);
        sources.push(file);
      }
      for (const [name, values] of Object.entries(documentMetrics)) {
        (metrics[name] ??= []).push(...values);
      }
    } catch (error) {
      errors.push(
        `${file}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  for (const scenario of SCENARIOS) {
    if (!fixtures.has(scenario))
      errors.push(`Missing valid ${scenario} fixture run`);
    if (platform === 'android' && !memories.has(scenario))
      errors.push(`Missing ${scenario} memory measurements`);
    if (platform === 'android') {
      for (const kind of ['coldStartup', 'warmStartup', 'transitionFrames']) {
        if (!nativeBenchmarks.has(`${kind}[${scenario}]`)) {
          const label =
            kind === 'transitionFrames'
              ? 'frame-overrun'
              : kind === 'coldStartup'
                ? 'cold startup'
                : 'warm startup';
          errors.push(
            `Missing ${scenario} native ${label} measurements${kind === 'transitionFrames' ? ' (requires API 31+)' : ''}`
          );
        }
      }
    }
  }
  if (platform === 'ios' && mode === 'native-release') {
    for (const scenario of SCENARIOS) {
      for (const kind of ['Launch', 'Clock', 'Memory']) {
        if (!xctest?.coverage[`${scenario}${kind}`]) {
          errors.push(
            `Missing ${scenario} native XCTest ${kind.toLowerCase()} measurements`
          );
        }
      }
    }
  }
  return {
    schemaVersion: 1,
    measurementDefinitionVersion: 1,
    platform,
    mode,
    fixtureVersion: 1,
    policy: 'informational-performance-fail-invalid-collection',
    metadata,
    valid: errors.length === 0,
    errors,
    sources,
    ...(xctest
      ? {
          nativeProvenance: {
            deviceId: xctest.deviceId,
            configurationId: xctest.configurationId,
          },
          metricDefinitions: xctest.definitions,
        }
      : {}),
    metrics: Object.fromEntries(
      Object.entries(metrics)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => [key, distribution(values)])
    ),
    notes: [
      'Hosted emulator/simulator timings are diagnostics, not physical-device performance guarantees.',
      'requestToSessionActiveMs ends at the JS active callback; it does not measure first presented motion.',
      'Probe times include native test waiting; they are observed upper bounds, not earliest possible input readiness.',
      'React actualDuration measures render work, not native Fabric commit time. Profiling-build timings are separate.',
      'deadlineOverrunPercent is the fraction of captured frames past their platform deadline, not a display refresh/drop count.',
      'Android memory peaks are sampled checkpoints; iOS memory peaks come from XCTest. Memory deltas include caches and do not prove a leak.',
      'P95 is omitted for fewer than 20 samples. Correlated frame samples do not replace repeated independent trials.',
      ...(platform === 'ios'
        ? [
            'Native iOS timings use seconds; JS timings use milliseconds. The xcresult retains the original XCTest measurements. No iOS dropped-frame count is inferred.',
          ]
        : []),
    ],
  };
}

export function markdown(summary: ReturnType<typeof summarize>) {
  const format = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : Number(value.toFixed(3)).toString();
  return [
    `# Choreography performance: ${summary.platform} / ${summary.mode}`,
    '',
    summary.valid
      ? 'Collection passed. Performance results are informational.'
      : '**Collection failed. Do not interpret missing data as an improvement.**',
    '',
    ...summary.errors.map((error) => `- ${error.replaceAll('\n', ' ')}`),
    '',
    '| Metric (units in name) | Samples | Median | P95 | Min | Max |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(summary.metrics).map(
      ([name, metric]) =>
        `| ${name} | ${metric?.count ?? 0} | ${format(metric?.median)} | ${format(metric?.p95)} | ${format(metric?.min)} | ${format(metric?.max)} |`
    ),
    '',
    ...summary.notes.map((note) => `- ${note}`),
    '',
  ].join('\n');
}

async function readDocuments(
  directory: string
): Promise<MeasurementDocument[]> {
  const documents = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) documents.push(...(await readDocuments(file)));
    else if (entry.isFile() && entry.name.endsWith('.json')) {
      documents.push({ file, data: JSON.parse(await readFile(file, 'utf8')) });
    }
  }
  return documents;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const split = arg.indexOf('=');
      if (!arg.startsWith('--') || split === -1)
        throw new Error('Use --name=value arguments');
      return [arg.slice(2, split), arg.slice(split + 1)];
    })
  );
  if (!args.input || !args.output)
    throw new Error('--input and --output are required');
  const documents = await readDocuments(args.input);
  let source: { revision: string | null; workingTreeDirty: boolean | null } = {
    revision: process.env.GITHUB_SHA ?? null,
    workingTreeDirty: null,
  };
  try {
    source = {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      workingTreeDirty:
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim().length > 0,
    };
  } catch {
    // Source archives can still run locally; unavailable provenance is not zero.
  }
  const summary = summarize(documents, {
    platform: args.platform,
    mode: args.mode,
    metadata: {
      ...source,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runner: process.env.RUNNER_OS ?? null,
      ...(args.metadata
        ? JSON.parse(await readFile(args.metadata, 'utf8'))
        : {}),
    },
  });
  await mkdir(args.output, { recursive: true });
  await writeFile(
    path.join(args.output, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );
  await writeFile(path.join(args.output, 'summary.md'), markdown(summary));
  if (!summary.valid) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
