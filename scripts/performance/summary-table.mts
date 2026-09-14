import type { InputRecord } from './types.ts';

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

export function compatible(current: InputRecord, base?: InputRecord): boolean {
  return Boolean(
    base &&
    current.valid === true &&
    base.valid === true &&
    [
      'schemaVersion',
      'fixtureVersion',
      'measurementDefinitionVersion',
      'platform',
      'mode',
    ].every((key) => current[key] != null && current[key] === base[key]) &&
    comparableMetadata.every(
      (key) =>
        current.metadata?.[key] != null &&
        current.metadata[key] === base.metadata?.[key]
    )
  );
}

export function headlineMetrics() {
  return ['forward', 'backward'].map((direction) => ({
    key: `gallery.${direction}.requestToSessionActiveMs`,
    label: `Gallery · ${direction === 'forward' ? 'open' : 'return'} preparation (ms)`,
    scale: 1,
    unit: 'ms',
  }));
}

function value(report: InputRecord | undefined, key: string, scale: number) {
  const metric = report?.metrics?.[key];
  return metric &&
    Number.isInteger(metric.count) &&
    metric.count > 0 &&
    typeof metric.median === 'number' &&
    Number.isFinite(metric.median)
    ? metric.median * scale
    : null;
}
const format = (n: number | null) =>
  n === null ? '—' : Number(n.toFixed(3)).toString();

export function summaryTable(report: InputRecord, base?: InputRecord) {
  const compare = compatible(report, base);
  return [
    '| Metric | Base | PR / current | Change |',
    '| --- | ---: | ---: | ---: |',
    ...headlineMetrics().map(({ key, label, scale, unit }) => {
      const current = value(report, key, scale);
      const previous =
        compare && report.metrics?.[key]?.count === base?.metrics?.[key]?.count
          ? value(base, key, scale)
          : null;
      const delta =
        current !== null && previous !== null ? current - previous : null;
      return `| ${label} | ${format(previous)} | ${format(current)} | ${delta === null ? '—' : `${delta > 0 ? '+' : ''}${format(delta)} ${unit}`} |`;
    }),
  ].join('\n');
}

/** Render bounded, validated diagnostic values from untrusted PR artifacts. */
export function startupDiagnostics(
  report: InputRecord,
  base?: InputRecord
): string {
  const compare = compatible(report, base);
  const preparation = Object.entries(report.metrics ?? {})
    .filter(
      ([name, metric]) =>
        /^gallery\.(forward|backward)\.(preparation\.[a-zA-Z-]{1,64}Ms|requestToOverlayReadyMs)$/.test(
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
    .slice(0, 40) as [string, InputRecord][];
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
  const journeys = ['forward', 'backward'].filter(
    (direction) => report.preparationDiagnostics?.[`gallery.${direction}`]
  );
  return [
    'Overlay readiness is a JavaScript proxy, not first presented motion. Stages can nest; do not add parent and child durations. Repeated stages are summed within each journey before aggregation.',
    '',
    ...(journeys.length
      ? [
          '| Journey | Traced | Overlay acknowledged | Overlay timeout |',
          '| --- | ---: | ---: | ---: |',
          ...journeys.map((direction) => {
            const counts =
              report.preparationDiagnostics[`gallery.${direction}`];
            return `| gallery.${direction} | ${number(counts.tracedJourneys, true)} | ${number(counts.overlayAcknowledgedJourneys, true)} | ${number(counts.overlayTimeoutJourneys, true)} |`;
          }),
          '',
        ]
      : []),
    '| Metric | Samples | Base median (ms) | PR / current median (ms) | Change | P95 (ms) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...preparation.map(([name, metric]) => {
      const previous =
        compare && metric.count === base?.metrics?.[name]?.count
          ? value(base, name, 1)
          : null;
      const baseline = previous !== null && previous >= 0 ? previous : null;
      const delta = baseline === null ? null : metric.median - baseline;
      return `| ${name} | ${number(metric.count, true)} | ${number(baseline)} | ${number(metric.median)} | ${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ms`} | ${number(metric.p95)} |`;
    }),
  ].join('\n');
}
