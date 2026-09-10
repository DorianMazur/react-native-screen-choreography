import type { InputRecord } from './types.ts';

const comparableMetadata = [
  'deviceModel',
  'osVersion',
  'apiLevel',
  'emulator',
  'abi',
  'iterations',
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

export function headlineMetrics(mode: string) {
  return ['gallery'].flatMap((scenario) =>
    mode === 'react-profile'
      ? [
          {
            key: `${scenario}.react.renderWorkPerRunMs`,
            label: `Gallery · React render work (ms/run)`,
            scale: 1,
            unit: 'ms',
          },
        ]
      : [
          {
            key: `android.transitionFrames[${scenario}].deadlineOverrunPercent`,
            label: `Gallery · frames over deadline (%)`,
            scale: 1,
            unit: 'pp',
          },
          {
            key: `${scenario}.forward.requestToSessionActiveMs`,
            label: `Gallery · open preparation (ms)`,
            scale: 1,
            unit: 'ms',
          },
          {
            key: `${scenario}.backward.requestToSessionActiveMs`,
            label: `Gallery · return preparation (ms)`,
            scale: 1,
            unit: 'ms',
          },
        ]
  );
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
    ...headlineMetrics(report.mode).map(({ key, label, scale, unit }) => {
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
