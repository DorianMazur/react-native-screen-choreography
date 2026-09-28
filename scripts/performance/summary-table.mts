import type { InputRecord } from './types.ts';
import { sameDefinition } from './metric-definitions.mts';
import {
  SCENARIOS,
  SCENARIO_IDS,
} from '../../examples/react-navigation/src/performance/scenarios.ts';

const comparableMetadata = [
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
    : comparableMetadata;
  return Boolean(
    base &&
    current.valid === true &&
    base.valid === true &&
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
    fields.every(
      (field) =>
        current.metadata?.[field] != null &&
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
    ['forward', 'backward'].map((direction) => ({
      key: `${scenario}.${direction}.requestToSessionActiveMs`,
      label: `${SCENARIOS[scenario].label} · ${direction === 'forward' ? 'open' : 'return'} preparation (ms)`,
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

export function summaryTable(report: InputRecord, base?: InputRecord) {
  return [
    '| Metric | Base | PR / current | Change |',
    '| --- | ---: | ---: | ---: |',
    ...headlineMetrics().map(({ key, label, scale, unit }) => {
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

/** Render bounded, validated diagnostic values from untrusted PR artifacts. */
export function startupDiagnostics(
  report: InputRecord,
  base?: InputRecord
): string {
  const preparation = Object.entries(report.metrics ?? {})
    .filter(
      ([name, metric]) =>
        /^(gallery|trips|wallet)\.(forward|backward)\.(preparation\.[a-zA-Z-]{1,64}Ms|requestToOverlayReadyMs)$/.test(
          name
        ) &&
        metric != null &&
        typeof metric === 'object' &&
        Number.isInteger((metric as InputRecord).count) &&
        (metric as InputRecord).count > 0 &&
        typeof (metric as InputRecord).median === 'number' &&
        Number.isFinite((metric as InputRecord).median) &&
        (metric as InputRecord).median >= 0
    )
    .slice(0, SCENARIO_IDS.length * 40) as [string, InputRecord][];
  if (!preparation.length) return '';
  const number = (n: unknown, integer = false) =>
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= 0 &&
    (!integer || Number.isInteger(n))
      ? integer
        ? String(n)
        : n.toFixed(2)
      : '—';
  const journeys = SCENARIO_IDS.flatMap((scenario) =>
    ['forward', 'backward'].map((direction) => `${scenario}.${direction}`)
  ).filter((journey) => report.preparationDiagnostics?.[journey]);
  return [
    'Overlay readiness is a JavaScript proxy, not first presented motion. Stages can nest; do not add parent and child durations. Repeated stages are summed within each journey before aggregation.',
    '',
    ...(journeys.length
      ? [
          '| Journey | Traced | Overlay acknowledged | Overlay timeout |',
          '| --- | ---: | ---: | ---: |',
          ...journeys.map((journey) => {
            const counts = report.preparationDiagnostics[journey];
            return `| ${journey} | ${number(counts.tracedJourneys, true)} | ${number(counts.overlayAcknowledgedJourneys, true)} | ${number(counts.overlayTimeoutJourneys, true)} |`;
          }),
          '',
        ]
      : []),
    '| Metric | Samples | Base median (ms) | PR / current median (ms) | Change | P95 (ms) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...preparation.map(([name, metric]) => {
      const previous =
        metricCompatible(report, base, name) &&
        metric.count === base?.metrics?.[name]?.count
          ? value(base, name, 1)
          : null;
      const baseline = previous !== null && previous >= 0 ? previous : null;
      const delta = baseline === null ? null : metric.median - baseline;
      return `| ${name} | ${number(metric.count, true)} | ${number(baseline)} | ${number(metric.median)} | ${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ms`} | ${number(metric.p95)} |`;
    }),
  ].join('\n');
}
