import type { InputRecord } from './types.ts';
import {
  SCENARIOS,
  type PerformanceScenario,
} from '../../examples/react-navigation/src/performance/scenarios.ts';

export const presentationStages = {
  'overlay-commit': ['overlay published', 'overlay hosts React commit'],
  'content-commit': ['overlay published', 'active content React commit'],
  'native-attachment': ['native prepare', 'hosts attached'],
  'native-content': ['hosts attached', 'content first observed ready'],
  'native-presentation': [
    'content first observed ready',
    'native presentation acknowledgement',
  ],
  'animation-dispatch': ['JS animation dispatch', 'UI animation queued'],
  'ui-start': ['UI presentation event received', 'UI animation start'],
  'first-motion': ['UI animation start', 'first UI progress change'],
  'js-ack': ['UI presentation event received', 'JS acknowledgement callback'],
} as const;

// Version the observed workload and each measurement's meaning, not the library
// implementation or fixture serialization. Change these when that meaning changes.
export function metricDefinition(key: string, instrumentation: string) {
  const stage = key.match(/\.preparation\.([a-z][a-z0-9-]*)Ms$/)?.[1];
  const presentation = key.match(
    /\.presentation\.([a-z][a-z0-9-]*)Ms$/
  )?.[1] as keyof typeof presentationStages | undefined;
  const render = key.match(/\.renders\.(list|detail|hero)\.(mount|update)$/);
  const scenario = SCENARIOS[key.split('.')[0] as PerformanceScenario];
  if (!scenario) throw new Error('Unknown metric workload');
  const metric = key.split('.').at(-1)!;
  if (presentation) {
    const [start, end] = presentationStages[presentation];
    return {
      version: 1,
      workload: scenario.workload,
      unit: 'ms',
      clock: presentation.startsWith('native-')
        ? 'native-monotonic-ms'
        : 'rn-worklets-steady-clock-ms',
      start,
      end,
      aggregation: 'one-sample-per-journey',
      instrumentation,
    };
  }
  const motion = [
    'tapToMotion',
    'transitionDuration',
    'handoffDuration',
  ].includes(metric);
  if (motion)
    return {
      version: 1,
      workload: scenario.workload,
      unit: 'ms',
      clock: 'rn-worklets-steady-clock-ms',
      start:
        metric === 'transitionDuration'
          ? 'first-ui-progress-change'
          : metric === 'handoffDuration'
            ? 'ui-progress-endpoint'
            : 'js-tap-handler',
      end:
        metric === 'transitionDuration'
          ? 'ui-progress-endpoint'
          : metric === 'handoffDuration'
            ? 'ui-visibility-input-handoff'
            : 'first-ui-progress-change',
      aggregation: 'one-sample-per-journey',
      instrumentation,
    };
  return {
    version: 1,
    workload: scenario.workload,
    unit: render ? 'count' : 'ms',
    clock: render ? 'react-layout-effect' : 'js-performance-now',
    start: stage ? `preparation-stage:${stage}:start` : 'navigation-request',
    end: render
      ? 'destination-probe-handler'
      : stage
        ? `preparation-stage:${stage}:end`
        : key.endsWith('.requestToOverlayReadyMs')
          ? 'javascript-observed-overlay-acknowledgments'
          : 'session-active',
    aggregation: render
      ? `committed-${render[1]}-${render[2]}-per-journey`
      : stage
        ? 'sum-per-journey'
        : 'one-sample-per-journey',
    instrumentation,
  };
}

export function sameDefinition(a: InputRecord, b: InputRecord) {
  return (
    Number.isSafeInteger(a.version) &&
    a.version > 0 &&
    a.version === b.version &&
    [
      'workload',
      'unit',
      'clock',
      'start',
      'end',
      'aggregation',
      'instrumentation',
    ].every(
      (key) =>
        typeof a[key] === 'string' && a[key].length > 0 && a[key] === b[key]
    )
  );
}
