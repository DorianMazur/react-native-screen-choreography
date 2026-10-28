import {
  TRAY_SCENARIOS,
  type TrayPerformanceScenario,
} from '../../examples/react-navigation/src/performance/scenarios.ts';
import type { InputRecord, MetricSamples } from './types.ts';

const commands = ['present', 'push', 'back', 'replace', 'popToRoot', 'dismiss'];
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function requireValue(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`Tray lifecycle: ${reason}`);
}
function time(value: unknown): number {
  requireValue(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    'missing or invalid timestamp'
  );
  return value;
}

/** Independent checks over raw runtime breadcrumbs, committed routes and real probes. */
export function validateTrayLifecycle(report: InputRecord): MetricSamples {
  const config = TRAY_SCENARIOS[report.scenario as TrayPerformanceScenario];
  requireValue(
    config && report.trayTracing?.version === 1,
    'missing or unknown tray telemetry'
  );
  const steps = report.trayTracing.steps as InputRecord[];
  requireValue(
    Array.isArray(steps) &&
      steps.length > 0 &&
      steps.length % config.routes.length === 0,
    'incomplete tray cycles'
  );
  requireValue(Array.isArray(report.samples), 'missing raw breadcrumbs');
  const events = report.samples as InputRecord[];
  let previousTime = -1;
  events.forEach((event, index) => {
    requireValue(
      event.sequence === index + 1 &&
        event.clock === 'js-performance-now' &&
        time(event.jsTimestampMs) >= previousTime,
      'unordered or missing raw breadcrumb'
    );
    previousTime = event.jsTimestampMs;
  });
  const dispatches = events.filter((event) => event.kind === 'tray-dispatch');
  let previousState: InputRecord | undefined;
  for (const event of dispatches) {
    const { before, after, action, accepted } = event;
    requireValue(
      before && after && action && typeof accepted === 'boolean',
      'incomplete dispatch breadcrumb'
    );
    if (previousState)
      requireValue(equal(before, previousState), 'disconnected stack history');
    else
      requireValue(
        before.phase === 'closed' &&
          before.session === 0 &&
          !before.entries.length,
        'run did not start closed'
      );
    if (!accepted) {
      requireValue(equal(before, after), 'rejected action changed the stack');
      requireValue(
        !commands.includes(action.type) &&
          !['prepared', 'transitionEnd'].includes(action.type),
        'rejected navigation or stale completion'
      );
    }
    if (
      accepted &&
      ['prepared', 'transitionEnd', 'settled', 'snapped'].includes(action.type)
    )
      requireValue(
        action.session === before.session,
        'stale native/session callback was accepted'
      );
    if (accepted && action.type === 'prepared')
      requireValue(
        action.id === before.preparation?.id &&
          after.transition &&
          !after.preparation,
        'source capture acknowledgement mismatch'
      );
    if (accepted && action.type === 'transitionEnd')
      requireValue(
        action.id === before.transition?.id &&
          !after.transition &&
          !after.preparation,
        'animation completion mismatch or premature replay'
      );
    previousState = after;
  }
  const requests = dispatches.filter((event) =>
    commands.includes(event.action.type)
  );
  const probes = events.filter((event) => event.kind === 'tray-probe');
  const commits = events.filter(
    (event) => event.kind === 'tray-settled-commit'
  );
  const motions = events.filter((event) => event.kind === 'tray-ui-motion');
  requireValue(
    requests.length === steps.length &&
      probes.length === steps.length &&
      commits.length === steps.length,
    'missing or duplicate request, commit or probe'
  );
  const metrics: MetricSamples = {};
  const add = (key: string, value: number) => (metrics[key] ??= []).push(value);
  const transitionIds = new Set<number>();
  const sharedIds = new Set<number>();
  let previousProbe = -1;
  let expectedStack: string[] = [];
  for (const [index, step] of steps.entries()) {
    const offset = index % config.routes.length;
    const request = requests[index]!;
    const probe = probes[index]!;
    const commit = commits[index]!;
    const cycle = Math.floor(index / config.routes.length) + 1;
    const returningTo = expectedStack.indexOf(config.routes[offset]!);
    const expectedCommand =
      offset === 0
        ? 'present'
        : config.routes[offset] === 'closed'
          ? 'dismiss'
          : returningTo >= 0
            ? 'back'
            : 'push';
    expectedStack =
      expectedCommand === 'dismiss'
        ? []
        : returningTo >= 0
          ? expectedStack.slice(0, returningTo + 1)
          : [...expectedStack, config.routes[offset]!];
    requireValue(
      step.id === index + 1 &&
        step.session === cycle &&
        step.route === config.routes[offset],
      'wrong step, session or destination'
    );
    requireValue(
      step.command === expectedCommand &&
        step.command === request.action.type &&
        request.accepted &&
        request.after.session === step.session,
      'request identity mismatch'
    );
    requireValue(
      request.before.queue.length === 0 &&
        !request.before.transition &&
        !request.before.preparation,
      'overlapping navigation'
    );
    requireValue(
      step.requestMs === request.jsTimestampMs &&
        time(step.requestMs) >= previousProbe,
      'request timestamp mismatch'
    );
    const settled = time(step.settledMs);
    requireValue(
      settled >= step.requestMs &&
        time(step.committedMs) >= settled &&
        time(step.probeMs) >= step.committedMs,
      'settlement, commit and probe are out of order'
    );
    requireValue(
      commit.stepId === step.id &&
        commit.jsTimestampMs === step.committedMs &&
        probe.stepId === step.id &&
        probe.jsTimestampMs === step.probeMs &&
        probe.probe === `tray-${step.id}-${step.route}`,
      'commit/probe breadcrumb mismatch'
    );
    const settledEvents = dispatches.filter(
      (event) => event.jsTimestampMs === settled && event.accepted
    );
    requireValue(
      settledEvents.length === 1,
      'missing or duplicate runtime settlement'
    );
    const settlement = settledEvents[0]!;
    const state = settlement.after;
    requireValue(
      equal(
        state.entries.map((entry: InputRecord) => entry.name),
        expectedStack
      ),
      'retained stack does not match the expected route history'
    );
    requireValue(
      equal(state, commit.state) && equal(state, probe.state),
      'probe on stale or changed stack'
    );
    requireValue(
      !state.transition && !state.preparation && state.queue.length === 0,
      'probe before stack/handoff release'
    );
    if (step.route === 'closed') {
      requireValue(
        step.command === 'dismiss' &&
          settlement.action.type === 'settled' &&
          settlement.action.index === 0 &&
          state.phase === 'closed' &&
          !state.entries.length &&
          step.routeKey === null,
        'dismissal did not wait for native settlement'
      );
    } else {
      requireValue(
        state.phase === 'open' &&
          state.nativeSettled &&
          state.entries.at(-1)?.key === step.routeKey &&
          state.entries.at(-1)?.name === step.route,
        'wrong visible route or unsettled native sheet'
      );
      if (offset === 0)
        requireValue(
          step.command === 'present' &&
            request.before.phase === 'closed' &&
            request.after.phase === 'opening' &&
            settlement.action.type === 'settled' &&
            settlement.action.index === 1,
          'opening did not wait for native settlement'
        );
      else {
        requireValue(
          settlement.action.type === 'transitionEnd' &&
            settlement.action.id === step.transitionId &&
            !transitionIds.has(step.transitionId),
          'missing, duplicate or stale transition'
        );
        transitionIds.add(step.transitionId);
        const activation = dispatches.find(
          (event) =>
            event.accepted &&
            event.after.transition?.id === step.transitionId &&
            event.before.transition?.id !== step.transitionId
        );
        requireValue(
          activation &&
            activation.jsTimestampMs === step.activatedMs &&
            activation.after.transition.to === step.routeKey &&
            activation.after.transition.from ===
              request.before.entries.at(-1)?.key,
          'transition endpoints or activation mismatch'
        );
        const motion = motions.filter((event) => event.stepId === step.id);
        requireValue(
          motion.length === 1 &&
            step.motion &&
            motion[0]!.session === step.session &&
            motion[0]!.transitionId === step.transitionId &&
            motion[0]!.firstMotionMs === step.motion.firstMotionMs &&
            motion[0]!.motionEndMs === step.motion.motionEndMs,
          'missing or duplicate UI motion'
        );
        const first = time(step.motion.firstMotionMs);
        const end = time(step.motion.motionEndMs);
        requireValue(
          first >= time(step.activatedMs) && end > first && end <= settled,
          'motion is outside its transition'
        );
        add(
          `${report.scenario}.step-${offset + 1}.tapToMotion`,
          first - step.requestMs
        );
        add(
          `${report.scenario}.step-${offset + 1}.transitionDuration`,
          end - first
        );
        if (activation.after.transition.groupId) {
          const prepared = dispatches.filter(
            (event) =>
              event.accepted &&
              event.action.type === 'prepared' &&
              event.after.transition?.id === step.transitionId
          );
          requireValue(
            prepared.length === 1 &&
              request.after.preparation?.id === prepared[0]!.action.id,
            'shared destination mounted without source capture'
          );
          const journey = report.journeys.find(
            (item: InputRecord) => item.requestId === step.sharedRequestId
          );
          requireValue(
            journey &&
              !sharedIds.has(step.sharedRequestId) &&
              journey.direction === step.direction &&
              journey.requestJsMs >= step.requestMs &&
              journey.sessionActiveJsMs >= step.activatedMs &&
              journey.sessionEndJsMs <= settled &&
              journey.motion.handoffMs <= settled &&
              journey.probe.handlerJsMs <= step.probeMs &&
              journey.probe.handlerJsMs >= step.committedMs,
            'shared session/handoff does not belong to the tray step'
          );
          sharedIds.add(step.sharedRequestId);
        } else
          requireValue(
            step.sharedRequestId === null,
            'plain transition claimed shared presentation'
          );
      }
    }
    add(
      `${report.scenario}.step-${offset + 1}.requestToSettledMs`,
      settled - step.requestMs
    );
    previousProbe = step.probeMs;
  }
  requireValue(
    sharedIds.size === report.journeys.length &&
      motions.length === transitionIds.size,
    'unmatched shared session or UI motion'
  );

  // Exactly one instance per retained screen/payload per sheet session. Check
  // the live set at each native input probe, not just aggregate mount counts.
  const live = new Map<number, InputRecord>();
  const mounted = new Set<string>();
  const payload =
    report.scenario === 'tray-wallet' ? 'avatar:Alex Morgan' : 'gallery-hero';
  for (const event of events) {
    if (event.kind === 'tray-content-mounted') {
      const key = `${event.session}:${event.name}`;
      requireValue(
        Number.isSafeInteger(event.instanceId) &&
          !live.has(event.instanceId) &&
          !mounted.has(key),
        'retained content remounted or duplicated'
      );
      mounted.add(key);
      live.set(event.instanceId, event);
    } else if (event.kind === 'tray-content-unmounted') {
      const owner = live.get(event.instanceId);
      requireValue(
        owner && owner.name === event.name && owner.session === event.session,
        'unmatched content release'
      );
      const releasing = dispatches
        .filter((dispatch) => dispatch.jsTimestampMs <= event.jsTimestampMs)
        .at(-1)?.after;
      requireValue(
        releasing &&
          !releasing.entries.some(
            (entry: InputRecord) => entry.name === event.name
          ) &&
          !releasing.transition?.retained.some(
            (entry: InputRecord) => entry.name === event.name
          ),
        'content released before completion'
      );
      live.delete(event.instanceId);
    } else if (event.kind === 'tray-probe') {
      const names = event.state.entries.map((entry: InputRecord) => entry.name);
      if (names.includes(config.source)) names.push(payload);
      const actual = [...live.values()];
      requireValue(
        actual.every((entry) => entry.session === event.state.session) &&
          equal(actual.map((entry) => entry.name).sort(), names.sort()),
        'live content does not match retained stack at probe'
      );
    }
  }
  requireValue(
    live.size === 0 && previousState?.phase === 'closed',
    'content or sheet left alive after final close'
  );
  return metrics;
}
