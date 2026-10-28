import type { TrayAction, TrayStackState } from '../../../../src/tray/stack';
import type { BenchmarkCollector } from './collector';
import type { TrayPerformanceScenario, TRAY_SCENARIOS } from './scenarios';

export interface TrayMotion {
  session: number;
  transitionId: number;
  firstMotionMs: number;
  motionEndMs: number;
}

export interface TrayStep {
  id: number;
  session: number;
  command: string;
  route: string;
  routeKey: string | null;
  requestMs: number;
  transitionId: number | null;
  sharedRequestId: number | null;
  direction: 'forward' | 'backward';
  activatedMs: number | null;
  settledMs: number | null;
  committedMs: number | null;
  probeMs: number | null;
  motion: TrayMotion | null;
}

export function traySnapshot(state: TrayStackState) {
  return {
    session: state.session,
    phase: state.phase,
    nativeSettled: state.nativeSettled,
    entries: state.entries.map(({ key, name }) => ({ key, name })),
    preparation: state.preparation
      ? {
          id: state.preparation.id,
          from: state.preparation.from,
          groupId: state.preparation.groupId,
        }
      : null,
    transition: state.transition
      ? {
          ...state.transition,
          retained: state.transition.retained.map(({ key, name }) => ({
            key,
            name,
          })),
        }
      : null,
    queue: state.queue.map(({ type }) => type),
  };
}

/** Records production reducer decisions; never drives or settles a transition. */
export class TrayBenchmarkCollector {
  readonly steps: TrayStep[] = [];
  private state: TrayStackState | null = null;
  private instance = 0;
  private live = new Set<number>();

  constructor(
    readonly shared: BenchmarkCollector<TrayPerformanceScenario>,
    readonly config: (typeof TRAY_SCENARIOS)[TrayPerformanceScenario],
    private readonly onRequest: () => void,
    private readonly onFailure: () => void
  ) {}

  fail(reason: string) {
    this.shared.fail(reason);
    this.onFailure();
  }

  current() {
    return this.steps.at(-1);
  }
  currentState() {
    return this.state;
  }

  dispatch(action: TrayAction, previous: TrayStackState, next: TrayStackState) {
    this.state = next;
    const command = Object.fromEntries(
      Object.entries(action).filter(([key]) => key !== 'params')
    );
    const at = this.shared.note('tray-dispatch', {
      action: command,
      accepted: previous !== next,
      before: traySnapshot(previous),
      after: traySnapshot(next),
    });
    const navigation = [
      'present',
      'push',
      'back',
      'replace',
      'popToRoot',
      'dismiss',
    ].includes(action.type);
    if (navigation) {
      if (previous === next) return this.fail('tray-navigation-rejected');
      if (this.current() && this.current()!.probeMs === null)
        return this.fail('tray-navigation-before-destination-probe');
      const route =
        next.phase === 'closing'
          ? 'closed'
          : 'name' in action
            ? action.name
            : action.type === 'back'
              ? previous.entries.at(-2)!.name
              : action.type === 'popToRoot'
                ? previous.entries[0]!.name
                : next.entries.at(-1)!.name;
      const expected =
        this.config.routes[this.steps.length % this.config.routes.length];
      if (route !== expected)
        return this.fail(`tray-unexpected-route:${route}:${expected}`);
      const shared = Boolean(
        next.preparation?.groupId || next.transition?.groupId
      );
      const direction =
        action.type === 'back' || action.type === 'popToRoot'
          ? 'backward'
          : 'forward';
      if (shared && !this.shared.request(direction))
        return this.fail('tray-shared-request-rejected');
      this.steps.push({
        id: this.steps.length + 1,
        session: next.session,
        command: action.type,
        route,
        routeKey:
          route === 'closed' || next.preparation
            ? null
            : next.entries.at(-1)!.key,
        requestMs: at,
        transitionId: null,
        sharedRequestId: shared
          ? this.shared.currentRequest()!.requestId
          : null,
        direction,
        activatedMs: null,
        settledMs: null,
        committedMs: null,
        probeMs: null,
        motion: null,
      });
      this.onRequest();
    }
    const step = this.current();
    if (!step || previous === next) return;
    if (next.transition && next.transition.id !== previous.transition?.id) {
      step.transitionId = next.transition.id;
      step.routeKey = next.transition.to;
      step.activatedMs = at;
    }
    if (
      (action.type === 'transitionEnd' && !next.transition) ||
      (action.type === 'settled' &&
        (next.phase === 'closed' || next.nativeSettled))
    ) {
      if (step.settledMs !== null)
        return this.fail('tray-duplicate-settlement');
      step.settledMs = at;
    }
  }

  ready(state: TrayStackState | null) {
    const step = this.current();
    if (
      !step ||
      !state ||
      step.settledMs === null ||
      state.session !== step.session ||
      state.transition ||
      state.preparation ||
      state.queue.length
    )
      return false;
    return step.route === 'closed'
      ? state.phase === 'closed' && state.entries.length === 0
      : state.phase === 'open' &&
          state.nativeSettled &&
          state.entries.at(-1)?.key === step.routeKey;
  }

  committed(state: TrayStackState | null) {
    const step = this.current();
    if (!step || !state || !this.ready(state) || step.committedMs !== null)
      return;
    step.committedMs = this.shared.note('tray-settled-commit', {
      stepId: step.id,
      state: traySnapshot(state),
    });
  }

  probe(state: TrayStackState | null): string | null {
    const step = this.current();
    if (
      !step ||
      !this.ready(state) ||
      step.committedMs === null ||
      step.probeMs !== null
    ) {
      this.fail('tray-probe-before-settlement-or-on-stale-route');
      return null;
    }
    if (step.transitionId !== null && !step.motion) {
      this.fail('tray-missing-ui-motion');
      return null;
    }
    if (
      step.sharedRequestId !== null &&
      !this.shared.probe(step.direction === 'forward' ? 'detail' : 'list')
    ) {
      this.fail('tray-shared-probe-rejected');
      return null;
    }
    const probe = `tray-${step.id}-${step.route}`;
    step.probeMs = this.shared.note('tray-probe', {
      stepId: step.id,
      probe,
      state: traySnapshot(state!),
    });
    return probe;
  }

  motion(sample: TrayMotion) {
    const step = this.steps.find(
      (item) =>
        item.session === sample.session &&
        item.transitionId === sample.transitionId
    );
    if (!step || step.motion)
      return this.fail('tray-stale-or-duplicate-ui-motion');
    step.motion = { ...sample };
    this.shared.note('tray-ui-motion', { stepId: step.id, ...sample });
  }

  render(name: string, phase: 'mount' | 'update') {
    const component =
      name === this.config.source
        ? 'list'
        : name === this.config.target
          ? 'detail'
          : this.isPayload(name)
            ? 'hero'
            : null;
    if (component) this.shared.renderCommitted(component, phase);
  }

  private isPayload(name: string) {
    return (
      name ===
      (this.shared.scenario === 'tray-wallet'
        ? 'avatar:Alex Morgan'
        : 'gallery-hero')
    );
  }

  mount(name: string) {
    // Only the selected avatar participates in the measured wallet journey.
    if (name.startsWith('avatar:') && !this.isPayload(name)) return () => {};
    const instanceId = ++this.instance;
    const session = this.state?.session;
    this.live.add(instanceId);
    this.shared.note('tray-content-mounted', { instanceId, name, session });
    if (this.isPayload(name)) this.shared.payloadLifecycle(instanceId, true);
    return () => {
      this.live.delete(instanceId);
      this.shared.note('tray-content-unmounted', { instanceId, name, session });
      if (this.isPayload(name)) this.shared.payloadLifecycle(instanceId, false);
    };
  }

  report() {
    if (
      !this.steps.length ||
      this.steps.length % this.config.routes.length ||
      this.steps.some((step) => step.probeMs === null) ||
      this.state?.phase !== 'closed' ||
      this.live.size
    )
      this.shared.fail('tray-incomplete-cycle-or-retained-content');
    return {
      ...this.shared.report(),
      trayTracing: {
        version: 1,
        steps: this.steps.map((step) => ({
          ...step,
          motion: step.motion ? { ...step.motion } : null,
        })),
      },
    };
  }
}
