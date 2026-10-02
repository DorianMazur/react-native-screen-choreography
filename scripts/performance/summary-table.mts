import type { InputRecord } from './types.ts';
import { sameDefinition } from './metric-definitions.mts';
import {
  SCENARIOS,
  SCENARIO_IDS,
} from '../../examples/react-navigation/src/performance/scenarios.ts';

const comparableMetadata = [
  'runnerImage',
  'hostCpu',
  'deviceModel',
  'osVersion',
  'apiLevel',
  'emulator',
  'abi',
  'timingCycles',
  'reactNativeVersion',
  'reanimatedVersion',
  'nodeVersion',
];

export function metricCompatible(
  current: InputRecord,
  base: InputRecord | undefined,
  key: string
): boolean {
  const definition = current.metricDefinitions?.[key];
  const previous = base?.metricDefinitions?.[key];
  const explicit = definition != null && previous != null;
  const fields = explicit
    ? comparableMetadata.filter(
        (name) =>
          !['reactNativeVersion', 'reanimatedVersion', 'nodeVersion'].includes(
            name
          )
      )
    : [...comparableMetadata];
  if (current.platform === 'android') {
    fields.push('systemImage', 'graphicsRenderer');
    if (current.metadata?.emulator === true) fields.push('emulatorVersion');
  }
  return Boolean(
    base &&
    current.valid === true &&
    base.valid === true &&
    current.metadata?.warmupCycles === base.metadata?.warmupCycles &&
    current.schemaVersion === 1 &&
    base.schemaVersion === 1 &&
    ['platform', 'mode'].every(
      (name) => current[name] != null && current[name] === base[name]
    ) &&
    (explicit
      ? sameDefinition(definition, previous)
      : !current.metricDefinitions &&
        !base.metricDefinitions &&
        ['fixtureVersion', 'measurementDefinitionVersion'].every(
          (name) => current[name] != null && current[name] === base[name]
        )) &&
    (current.platform !== 'ios' ||
      (typeof current.metadata?.xcodeVersion === 'string' &&
        current.metadata.xcodeVersion === base.metadata?.xcodeVersion)) &&
    fields.every(
      (field) =>
        current.metadata?.[field] != null &&
        current.metadata[field] !== '' &&
        current.metadata[field] === base.metadata?.[field]
    )
  );
}

export function compatible(current: InputRecord, base?: InputRecord): boolean {
  return Object.keys(current.metrics ?? {}).some(
    (key) =>
      metricCompatible(current, base, key) &&
      value(current, key, 1) !== null &&
      value(base, key, 1) !== null &&
      current.metrics[key].count === base?.metrics?.[key]?.count
  );
}

export function environmentChanges(current: InputRecord, base?: InputRecord) {
  if (!base) return '';
  const changes = [
    'reactNativeVersion',
    'reanimatedVersion',
    'nodeVersion',
  ].filter((key) => current.metadata?.[key] !== base?.metadata?.[key]);
  return changes.length
    ? `Environment versions differ (${changes.join(', ')}); deltas include those environment changes.`
    : '';
}

export function headlineMetrics() {
  return SCENARIO_IDS.flatMap((scenario) =>
    [
      ['forward.requestToSessionActiveMs', 'open preparation'],
      ['forward.tapToMotion', 'tap to motion'],
      ['forward.transitionDuration', 'open transition duration'],
      ['forward.handoffDuration', 'open handoff duration'],
      ['backward.requestToSessionActiveMs', 'return preparation'],
      ['backward.tapToMotion', 'back tap to motion'],
      ['backward.transitionDuration', 'return transition duration'],
      ['backward.handoffDuration', 'return handoff duration'],
    ].map(([key, label]) => ({
      key: `${scenario}.${key}`,
      label: `${SCENARIOS[scenario].label} · ${label} (ms)`,
      scale: 1,
      unit: 'ms',
    }))
  );
}

function value(report: InputRecord | undefined, key: string, scale: number) {
  const metric = report?.metrics?.[key];
  return metric &&
    Number.isInteger(metric.count) &&
    metric.count > 0 &&
    typeof metric.median === 'number' &&
    Number.isFinite(metric.median) &&
    metric.median >= 0
    ? metric.median * scale
    : null;
}
const format = (n: number | null) =>
  n === null ? '—' : Number(n.toFixed(3)).toString();

export function summaryTable(
  report: InputRecord,
  base?: InputRecord,
  firstRun = false
) {
  return [
    '| Metric | Base | PR / current | Change |',
    '| --- | ---: | ---: | ---: |',
    ...headlineMetrics().map(({ key: originalKey, label, scale, unit }) => {
      const key = firstRun
        ? originalKey.replace('.', '.firstRun.')
        : originalKey;
      const current = value(report, key, scale);
      const previous =
        metricCompatible(report, base, key) &&
        report.metrics?.[key]?.count === base?.metrics?.[key]?.count
          ? value(base, key, scale)
          : null;
      const delta =
        current !== null && previous !== null ? current - previous : null;
      return `| ${label} | ${format(previous)} | ${format(current)} | ${delta === null ? '—' : `${delta > 0 ? '+' : ''}${format(delta)} ${unit}`} |`;
    }),
  ].join('\n');
}

export function warmupNote(report: InputRecord) {
  const { warmupCycles, timingCycles } = report.metadata ?? {};
  return Number.isSafeInteger(warmupCycles) &&
    warmupCycles >= 1 &&
    warmupCycles <= 20 &&
    Number.isSafeInteger(timingCycles) &&
    timingCycles >= 1 &&
    1 + warmupCycles + timingCycles <= 100
    ? `${timingCycles} measured round trips after the first run and ${warmupCycles} warm-up round trips per scenario. All runs are validated; warm-up samples remain in the artifacts.`
    : '';
}

export function firstRunTable(report: InputRecord, base?: InputRecord) {
  if (
    !Number.isSafeInteger(report.metadata?.warmupCycles) ||
    report.metadata.warmupCycles < 1
  )
    return '';
  return [
    '<details><summary>First run · one round trip per scenario</summary>',
    '',
    'First open and first return after app launch. Single observations, not a stable latency distribution or a cold-start measurement.',
    '',
    summaryTable(report, base, true),
    '',
    '</details>',
  ].join('\n');
}

export function renderCountsTable(report: InputRecord, base?: InputRecord) {
  const rows: string[] = [];
  for (const scenario of SCENARIO_IDS) {
    for (const direction of ['forward', 'backward']) {
      for (const component of ['list', 'detail', 'hero']) {
        for (const phase of ['mount', 'update']) {
          const key = `${scenario}.${direction}.renders.${component}.${phase}`;
          const current = value(report, key, 1);
          if (current === null) continue;
          const previous =
            metricCompatible(report, base, key) &&
            report.metrics[key].count === base?.metrics?.[key]?.count
              ? value(base, key, 1)
              : null;
          const delta = previous === null ? null : current - previous;
          rows.push(
            `| ${SCENARIOS[scenario].label} · ${direction} · ${component} · ${phase === 'mount' ? 'mounts' : 'rerenders'} | ${report.metrics[key].count} | ${format(previous)} | ${format(current)} | ${delta !== null && delta > 0 ? '+' : ''}${format(delta)} |`
          );
        }
      }
    }
  }
  return rows.length
    ? [
        "Committed renders per journey (median), from navigation request to destination input probe. Mounts are separate from rerenders. Counts cover each example's list, detail, and selected hero/card; they exclude library internals, abandoned renders, and UI-thread animation frames. These diagnostics are not a smoothness score or regression threshold.",
        '',
        '| Component / phase | Journeys | Base | PR / current | Change |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...rows,
      ].join('\n')
    : '';
}
