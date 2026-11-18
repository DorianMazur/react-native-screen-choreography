import { BenchmarkCollector } from '../../examples/react-navigation/src/performance/collector.ts';
import { TrayBenchmarkCollector } from '../../examples/react-navigation/src/performance/tray-collector.ts';
import {
  TRAY_SCENARIOS,
  type TrayPerformanceScenario,
} from '../../examples/react-navigation/src/performance/scenarios.ts';
import {
  initialTrayState,
  trayReducer,
  type TrayAction,
  type TrayStackState,
} from '../../src/tray/stack.ts';
import type { InputRecord } from './types.ts';

/** Synthetic platform observations around the real reducer/collector, for validator tests. */
export function trayFixture(
  scenario: TrayPerformanceScenario,
  cycles = 1
): InputRecord {
  let now = 100;
  const config = TRAY_SCENARIOS[scenario];
  const shared = new BenchmarkCollector(
    `test-${scenario}`,
    scenario,
    () => now++,
    {
      preparationTracing: true,
      renderCounting: true,
      motionTracing: true,
      presentationTracing: true,
    }
  );
  const trace = new TrayBenchmarkCollector(
    shared,
    config,
    () => {},
    () => {}
  );
  let state: TrayStackState = initialTrayState;
  const mounted = new Map<string, () => void>();
  const payload =
    scenario === 'tray-wallet' ? 'avatar:Alex Morgan' : 'gallery-hero';
  const synchronize = () => {
    const entries = [...state.entries, ...(state.transition?.retained ?? [])];
    const desired = new Map(entries.map((entry) => [entry.key, entry.name]));
    if (entries.some((entry) => entry.name === config.source))
      desired.set('payload', payload);
    for (const [key, cleanup] of mounted)
      if (!desired.has(key)) {
        cleanup();
        mounted.delete(key);
      }
    for (const [key, name] of desired)
      if (!mounted.has(key)) {
        trace.render(name, 'mount');
        mounted.set(key, trace.mount(name));
      }
  };
  const dispatch = (action: TrayAction) => {
    const previous = state;
    state = trayReducer(state, action);
    trace.dispatch(action, previous, state);
    synchronize();
  };
  const probes: string[] = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const [index, route] of config.routes.entries()) {
      const sourceRouteKey = state.entries.at(-1)?.key;
      dispatch(
        index === 0
          ? { type: 'present', name: route, params: undefined }
          : route === 'closed'
            ? { type: 'dismiss' }
            : state.entries.some((entry) => entry.name === route)
              ? { type: 'back' }
              : {
                  type: 'push',
                  name: route,
                  params: undefined,
                  sourceRouteKey,
                  ...(route === config.target ? { groupId: 'shared' } : {}),
                }
      );
      const preparationStart = now++;
      if (state.preparation)
        dispatch({
          type: 'prepared',
          session: state.session,
          id: state.preparation.id,
        });
      if (state.transition) {
        const transition = state.transition;
        const direction = transition.direction === 1 ? 'forward' : 'backward';
        const sessionId = `${state.session}:${transition.id}`;
        const active = now;
        if (transition.groupId) {
          shared.sessionActive(
            sessionId,
            direction,
            scenario === 'tray-gallery' ? 2 : 1,
            {
              publishedAtMs: active + 1,
              hostsCommitAtMs: active + 3,
              contentCommitAtMs: active + 4,
              acknowledgedAtMs: active + 10,
            }
          );
          now = active + 12;
          shared.preparationTrace({
            traceId: `trace:${sessionId}`,
            sessionId,
            groupId: 'shared',
            sourceScreenId: transition.from,
            targetScreenId: transition.to,
            direction,
            clock: 'js-performance-now',
            startedAtMs: preparationStart,
            completedAtMs: now,
            outcome: 'overlay-ready',
            droppedStages: 0,
            stages: [
              {
                name: 'overlay-ready',
                startedAtMs: preparationStart,
                durationMs: now - preparationStart,
                completed: true,
              },
            ],
          });
        }
        const firstMotionMs = now + 2;
        const motionEndMs = firstMotionMs + 240;
        now = motionEndMs + 3;
        trace.motion({
          session: state.session,
          transitionId: transition.id,
          firstMotionMs,
          motionEndMs,
        });
        if (transition.groupId) {
          shared.motion({
            requestId: shared.currentRequest()!.requestId,
            firstMotionMs,
            motionEndMs,
            handoffMs: motionEndMs + 1,
            presentationTiming: {
              animationDispatchedAtMs: active + 2,
              animationQueuedAtMs: active + 5,
              presentedAtMs: active + 8,
              animationStartedAtMs: active + 9,
              native: {
                preparedAtMs: 10000,
                attachedAtMs: 10004,
                contentReadyAtMs: 10005,
                presentedAtMs: 10010,
              },
            },
          });
          shared.sessionEnd(sessionId);
        }
        dispatch({
          type: 'transitionEnd',
          session: state.session,
          id: transition.id,
        });
      } else {
        now += 300;
        dispatch({
          type: 'settled',
          session: state.session,
          index: route === 'closed' ? 0 : 1,
        });
      }
      trace.committed(state);
      const probe = trace.probe(state);
      if (probe) probes.push(probe);
    }
  }
  return {
    ...trace.report(),
    native: {
      platform: 'android',
      clock: 'android-uptime-ms',
      droppedSamples: 0,
      exportedAtUptimeMs: (probes.length + 1) * 1000,
      touches: probes.map((_, index) => ({
        kind: 'activity-action-up',
        eventUptimeMs: (index + 1) * 1000,
        dispatchUptimeMs: (index + 1) * 1000 + 1,
      })),
      inputAcknowledgements: probes.map((probe, index) => ({
        probe,
        eventUptimeMs: (index + 1) * 1000,
        nativeAckUptimeMs: (index + 1) * 1000 + 8,
        touchToNativeAckMs: 8,
      })),
    },
  };
}
