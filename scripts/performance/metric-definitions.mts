import type { InputRecord } from './types.ts';
import {
  SCENARIOS,
  type PerformanceScenario,
} from '../../examples/react-navigation/src/performance/scenarios.ts';

// Version the observed workload and each measurement's meaning, not the library
// implementation or fixture serialization. Change these when that meaning changes.
export function metricDefinition(key: string, instrumentation: string) {
  const stage = key.match(/\.preparation\.([a-z][a-z0-9-]*)Ms$/)?.[1];
  const render = key.match(/\.renders\.(list|detail|hero)\.(mount|update)$/);
  const scenario = SCENARIOS[key.split('.')[0] as PerformanceScenario];
  if (!scenario) throw new Error('Unknown metric workload');
  const metric = key.split('.').at(-1)!;
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
