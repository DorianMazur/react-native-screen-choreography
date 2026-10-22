import type { InputRecord } from './types.ts';

const phases = [
  'navigation-request',
  'session-active',
  'session-end-proxy',
  'probe-acknowledged',
];

/** Validate existing observations; no extra work runs in the measured animation. */
export function validateLifecycle(report: InputRecord) {
  if (
    report.fixtureVersion !== 6 ||
    report.preparationTracing?.requested !== true ||
    report.renderCounting?.version !== 1 ||
    report.motionTracing?.version !== 2 ||
    !report.presentationTracing
  )
    throw new Error(
      'Required lifecycle telemetry missing: preparation, renders, motion and native presentation must all be enabled'
    );
  if (!Array.isArray(report.samples) || !Array.isArray(report.journeys))
    throw new Error('Missing lifecycle samples or journeys');
  const events = report.samples.filter((sample: InputRecord) =>
    phases.includes(sample.kind)
  );
  if (events.length !== report.journeys.length * phases.length)
    throw new Error('Missing or duplicate lifecycle events');
  const sessions = new Set<string>();
  let previousProbe = -Infinity;
  for (const [index, journey] of report.journeys.entries()) {
    const label = `${report.scenario} round trip ${Math.floor(index / 2) + 1} ${journey.direction}`;
    const fail = (reason: string): never => {
      throw new Error(`${label}: ${reason}`);
    };
    if (
      journey.requestId !== index + 1 ||
      typeof journey.sessionId !== 'string' ||
      !journey.sessionId ||
      sessions.has(journey.sessionId)
    )
      fail('missing, duplicate or mismatched request/session identity');
    sessions.add(journey.sessionId);
    const timestamps = [
      journey.requestJsMs,
      journey.sessionActiveJsMs,
      journey.sessionEndJsMs,
      journey.probe?.handlerJsMs,
    ];
    let previous = previousProbe;
    for (const [phase, timestamp] of timestamps.entries()) {
      if (
        typeof timestamp !== 'number' ||
        !Number.isFinite(timestamp) ||
        timestamp < 0 ||
        timestamp < previous
      )
        fail('lifecycle timestamps are missing, reversed or overlap a journey');
      previous = timestamp;
      const event = events[index * phases.length + phase];
      if (
        event.kind !== phases[phase] ||
        event.requestId !== journey.requestId ||
        event.clock !== 'js-performance-now' ||
        event.jsTimestampMs !== timestamp ||
        (phase === 0 && event.direction !== journey.direction) ||
        (phase === 1 &&
          (event.sessionId !== journey.sessionId ||
            event.direction !== journey.direction ||
            !Number.isSafeInteger(event.pairCount) ||
            event.pairCount <= 0)) ||
        (phase === 2 && event.sessionId !== journey.sessionId) ||
        (phase === 3 && event.screen !== journey.probe.screen)
      )
        fail(`missing or mismatched ${phases[phase]} event`);
    }
    previousProbe = previous;
    const durations = [
      [journey.requestToSessionActiveMs, timestamps[1] - timestamps[0]],
      [journey.sessionActiveToEndMs, timestamps[2] - timestamps[1]],
      [journey.requestToSessionEndMs, timestamps[2] - timestamps[0]],
      [journey.probe.requestToProbeHandlerMs, timestamps[3] - timestamps[0]],
      [journey.probe.sessionEndToProbeHandlerMs, timestamps[3] - timestamps[2]],
    ];
    if (
      durations.some(
        ([actual, expected]) =>
          typeof actual !== 'number' ||
          !Number.isFinite(actual) ||
          Math.abs(actual - expected) > 0.001
      )
    )
      fail('lifecycle durations disagree with the recorded timestamps');
  }
}
