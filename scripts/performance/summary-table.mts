import type { InputRecord } from './types.ts';
import { sameDefinition } from './metric-definitions.mts';
import {
  SCENARIOS,
  PERFORMANCE_SCENARIO_IDS,
  TRAY_SCENARIOS,
} from '../../examples/react-navigation/src/performance/scenarios.ts';

const comparableMetadata = [
  'deviceModel',
  'osVersion',
  'apiLevel',
  'emulator',
  'abi',
  'reactNativeVersion',
  'reanimatedVersion',
  'nodeVersion',
];

export function metricCompatible(
  current: InputRecord,
  base: InputRecord | undefined,
  key: string
): boolean {
  const trayMetric = key.split('.')[0]! in TRAY_SCENARIOS;
  const cycles = (report: InputRecord | undefined) => {
    const metadata = report?.metadata;
    const screenCycles = metadata?.screenTimingCycles ?? metadata?.timingCycles;
    return trayMetric
      ? (metadata?.trayTimingCycles ?? screenCycles)
      : screenCycles;
  };
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
    fields.push('systemImage');
    if (current.metadata?.emulator === true) fields.push('emulatorVersion');
  }
  return Boolean(
    base &&
    current.valid === true &&
    base.valid === true &&
    current.schemaVersion === 1 &&
    base.schemaVersion === 1 &&
    cycles(current) != null &&
    cycles(current) !== '' &&
    cycles(current) === cycles(base) &&
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

/**
 * The base sources measured in the same session as `report`, when usable.
 * Report fields are untrusted in the comment workflow; the note is built only
 * from validated values.
 */
export function sameRunnerBase(report: InputRecord | undefined) {
  const info = report?.sameRunner;
  const base = info?.base;
  if (!base || typeof base !== 'object' || !compatible(report!, base))
    return undefined;
  const revision = /^[0-9a-f]{7,40}$/.test(info.baseRevision)
    ? info.baseRevision.slice(0, 7)
    : 'unknown revision';
  const count = (field: unknown) =>
    Number.isInteger(field) && (field as number) > 0 ? (field as number) : null;
  const rounds = count(info.rounds);
  const compared = count(info.comparedRounds);
  const measured =
    rounds === null
      ? 'alternating rounds; samples are pooled per side'
      : compared !== null && compared < rounds
        ? `${compared} of ${rounds} alternating rounds, the only ones the base passed; both sides pool those rounds' samples`
        : `${rounds} alternating rounds; samples are pooled per side`;
  const retried = (Array.isArray(info.retried) ? info.retried : []).flatMap(
    (run: unknown) => {
      const match = /^(head|base)-([1-9])$/.exec(String(run));
      return match
        ? [`${match[1] === 'head' ? 'current' : 'base'} round ${match[2]}`]
        : [];
    }
  );
  return {
    base: base as InputRecord,
    note: `Base library sources (${revision}) measured on this runner in ${measured}.${retried.length ? ` Repeated after a failed run: ${retried.join(', ')}.` : ''} "99% range" is where the change in medians falls when both sides are resampled; a range that includes zero is within run-to-run noise.`,
  };
}

/** Why a valid report has no same-job base, from validated fields only. */
export function missingBaseNote(report: InputRecord | undefined) {
  return `No same-runner comparison: ${
    report?.sameRunner
      ? 'the base sources did not pass collection with the current fixture'
      : 'the library sources match the base, so they were measured once'
  }. Current readings remain available.`;
}

/** The resampled range of a change, when the report carries a valid one. */
function changeRange(intervals: unknown, key: string, scale: number) {
  const range = (intervals as InputRecord | undefined)?.[key];
  return Array.isArray(range) &&
    range.length === 2 &&
    range.every((bound) => typeof bound === 'number' && Number.isFinite(bound))
    ? ([range[0] * scale, range[1] * scale] as [number, number])
    : null;
}

export function headlineMetrics() {
  return [
    ...PERFORMANCE_SCENARIO_IDS.flatMap((scenario) =>
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
    ),
    ...Object.entries(TRAY_SCENARIOS).flatMap(([scenario, config]) =>
      config.routes.map((route, index) => ({
        key: `${scenario}.step-${index + 1}.requestToSettledMs`,
        label: `${config.label} · ${index + 1}. ${route} settlement (ms)`,
        scale: 1,
        unit: 'ms',
      }))
    ),
  ];
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

function belowChangeThreshold(
  current: number | null,
  previous: number | null,
  minChangePercent: number
) {
  if (minChangePercent <= 0 || previous === null || current === null)
    return false;
  if (current === previous) return true;
  if (previous === 0) return false;
  // Compare before display rounding; retain exact boundary changes despite
  // floating-point subtraction (for example, 40 -> 40.4 is exactly 1%).
  const roundoff = Number.EPSILON * Math.max(current, previous);
  return (
    Math.abs(current - previous) + roundoff <
    (previous * minChangePercent) / 100
  );
}

export function summaryTable(
  report: InputRecord,
  base?: InputRecord,
  minChangePercent = 0
) {
  // Resampled ranges describe only the base they were measured against.
  const intervals =
    base && base === report.sameRunner?.base
      ? report.sameRunner.changeIntervals
      : undefined;
  let withinNoise = 0;
  const rows = headlineMetrics().flatMap(({ key, label, scale, unit }) => {
    const current = value(report, key, scale);
    const previous =
      metricCompatible(report, base, key) &&
      report.metrics?.[key]?.count === base?.metrics?.[key]?.count
        ? value(base, key, scale)
        : null;
    if (
      (key.startsWith('tray-') && current === null && previous === null) ||
      (minChangePercent > 0 && current === null) ||
      belowChangeThreshold(current, previous, minChangePercent)
    )
      return [];
    const delta =
      current !== null && previous !== null ? current - previous : null;
    const signed = (n: number) => `${n > 0 ? '+' : ''}${format(n)}`;
    const range = delta === null ? null : changeRange(intervals, key, scale);
    // A filtered table lists only changes that stand out from the noise.
    if (minChangePercent > 0 && range && range[0] <= 0 && range[1] >= 0) {
      withinNoise++;
      return [];
    }
    return [
      `| ${label} | ${format(previous)} | ${format(current)} | ${delta === null ? '—' : `${signed(delta)} ${unit}`} |${intervals ? ` ${range ? `${signed(range[0])} to ${signed(range[1])} ${unit}` : '—'} |` : ''}`,
    ];
  });
  const hidden = withinNoise
    ? `Within run-to-run noise and not listed: ${withinNoise}.`
    : '';
  if (!rows.length)
    return (
      hidden ||
      `No measurements to show at the ${minChangePercent}% change threshold.`
    );
  return [
    `| Metric | Base | PR / current | Change |${intervals ? ' 99% range |' : ''}`,
    `| --- | ---: | ---: | ---: |${intervals ? ' ---: |' : ''}`,
    ...rows,
    ...(hidden ? ['', hidden] : []),
  ].join('\n');
}

export function renderCountsTable(
  report: InputRecord,
  base?: InputRecord,
  minChangePercent = 0
) {
  const rows: string[] = [];
  for (const scenario of PERFORMANCE_SCENARIO_IDS) {
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
          if (belowChangeThreshold(current, previous, minChangePercent))
            continue;
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
