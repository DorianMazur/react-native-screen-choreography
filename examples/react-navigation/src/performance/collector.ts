export type PerformanceScenario = 'ordinary' | 'live';
export type JourneyDirection = 'forward' | 'backward';
export type ProbeScreen = 'detail' | 'list';

export interface BenchmarkSample {
  sequence: number;
  kind: string;
  jsTimestampMs: number;
  clock: 'js-performance-now';
  [key: string]: unknown;
}

export interface JourneyObservation {
  requestId: number;
  direction: JourneyDirection;
  requestJsMs: number;
  sessionId: string | null;
  sessionActiveJsMs: number | null;
  sessionEndJsMs: number | null;
  requestToSessionActiveMs: number | null;
  sessionActiveToEndMs: number | null;
  requestToSessionEndMs: number | null;
  probe: {
    screen: ProbeScreen;
    handlerJsMs: number;
    requestToProbeHandlerMs: number;
    sessionEndToProbeHandlerMs: number;
    meaning: 'observed-successful-probe-upper-bound-including-test-wait';
  } | null;
  failure: string | null;
}

interface ReactObservation {
  id: string;
  phase: string;
  actualDurationMs: number;
  baseDurationMs: number;
  reactStartTimeMs: number;
  reactCommitTimeMs: number;
}

export interface BenchmarkReport {
  schemaVersion: 1;
  fixtureVersion: 2;
  runId: string;
  scenario: PerformanceScenario;
  clock: 'js-performance-now';
  valid: boolean;
  errors: string[];
  samples: BenchmarkSample[];
  droppedSamples: number;
  journeys: JourneyObservation[];
  payloadMounts: number;
  payloadUnmounts: number;
  reactProfiling: {
    requested: boolean;
    supported: boolean;
    status: 'not-requested' | 'requested-but-no-callbacks' | 'observed';
    meaning: 'React-render-work-for-committed-updates-not-native-commit-time';
    observations: ReactObservation[];
  };
  limitations: string[];
}

const MAX_SAMPLES = 4096;
const MAX_REACT_OBSERVATIONS = 8192;
// The native memory runner accepts 100 round trips, each containing two journeys.
const MAX_JOURNEYS = 200;

/** No bridge calls or React state updates occur while collecting observations. */
export class BenchmarkCollector {
  private samples: BenchmarkSample[] = [];
  private journeys: JourneyObservation[] = [];
  private reactObservations: ReactObservation[] = [];
  private errors: string[] = [];
  private sequence = 0;
  private droppedSamples = 0;
  private instanceCounter = 0;
  private payloadMounts = 0;
  private payloadUnmounts = 0;
  private current: JourneyObservation | null = null;

  constructor(
    readonly runId: string,
    readonly scenario: PerformanceScenario,
    readonly profilingRequested: boolean,
    private readonly now: () => number
  ) {}

  private timestamp() {
    const value = this.now();
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Benchmark requires a finite monotonic JS timestamp');
    }
    return value;
  }

  note(kind: string, fields: Record<string, unknown> = {}) {
    this.record(kind, this.timestamp(), fields);
  }

  private record(
    kind: string,
    timestamp: number,
    fields: Record<string, unknown> = {}
  ) {
    if (this.samples.length >= MAX_SAMPLES) {
      this.droppedSamples += 1;
      return;
    }
    this.samples.push({
      ...fields,
      sequence: ++this.sequence,
      kind,
      jsTimestampMs: timestamp,
      clock: 'js-performance-now',
    });
  }

  request(direction: JourneyDirection): boolean {
    if (this.current && !this.current.probe && !this.current.failure)
      return false;
    if (this.journeys.length >= MAX_JOURNEYS) {
      this.fail('journey-limit-exceeded');
      return false;
    }
    const at = this.timestamp();
    this.current = {
      requestId: this.journeys.length + 1,
      direction,
      requestJsMs: at,
      sessionId: null,
      sessionActiveJsMs: null,
      sessionEndJsMs: null,
      requestToSessionActiveMs: null,
      sessionActiveToEndMs: null,
      requestToSessionEndMs: null,
      probe: null,
      failure: null,
    };
    this.journeys.push(this.current);
    this.record('navigation-request', at, {
      requestId: this.current.requestId,
      direction,
    });
    return true;
  }

  sessionActive(
    sessionId: string,
    direction: JourneyDirection,
    pairCount: number
  ) {
    const request = this.current;
    if (!request || request.failure || request.direction !== direction) {
      this.fail('session-active-without-matching-request');
      return;
    }
    if (request.sessionId !== null) {
      this.fail('duplicate-session-active');
      return;
    }
    const at = this.timestamp();
    request.sessionId = sessionId;
    request.sessionActiveJsMs = at;
    request.requestToSessionActiveMs = this.duration(at, request.requestJsMs);
    this.record('session-active', at, {
      requestId: request.requestId,
      sessionId,
      direction,
      pairCount,
      meaning: 'pairs-resolved-and-JS-active-callback-not-native-presentation',
    });
  }

  sessionEnd(sessionId: string): ProbeScreen | null {
    const request = this.current;
    if (
      !request ||
      request.failure ||
      request.sessionId !== sessionId ||
      request.sessionActiveJsMs === null ||
      request.sessionEndJsMs !== null
    ) {
      this.fail('unmatched-or-duplicate-session-end');
      return null;
    }
    const at = this.timestamp();
    request.sessionEndJsMs = at;
    request.sessionActiveToEndMs = this.duration(at, request.sessionActiveJsMs);
    request.requestToSessionEndMs = this.duration(at, request.requestJsMs);
    this.record('session-end-proxy', at, {
      requestId: request.requestId,
      sessionId,
      meaning: 'JS-session-cleared-not-animation-finish-or-presented-frame',
    });
    return request.direction === 'forward' ? 'detail' : 'list';
  }

  probe(screen: ProbeScreen): boolean {
    const at = this.timestamp();
    const request = this.current;
    const expected = request?.direction === 'forward' ? 'detail' : 'list';
    if (
      !request ||
      request.failure ||
      request.probe ||
      request.sessionEndJsMs === null ||
      screen !== expected
    ) {
      this.record('probe-rejected', at, { screen });
      return false;
    }
    request.probe = {
      screen,
      handlerJsMs: at,
      requestToProbeHandlerMs: this.duration(at, request.requestJsMs),
      sessionEndToProbeHandlerMs: this.duration(at, request.sessionEndJsMs),
      meaning: 'observed-successful-probe-upper-bound-including-test-wait',
    };
    this.record('probe-acknowledged', at, {
      requestId: request.requestId,
      screen,
      injectedBy: 'external-native-test-must-tap-the-real-screen-control',
    });
    return true;
  }

  fail(reason: string) {
    if (!this.errors.includes(reason)) this.errors.push(reason);
    if (this.current && !this.current.probe) this.current.failure = reason;
    this.note('failure', { reason });
  }

  private duration(end: number, start: number) {
    const value = end - start;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Benchmark timestamps must share one monotonic JS clock');
    }
    return value;
  }

  allocatePayloadInstance() {
    return ++this.instanceCounter;
  }

  hasRequests() {
    return this.journeys.length > 0;
  }

  abortUnfinished(reason: string) {
    if (this.current && !this.current.probe && !this.current.failure) {
      this.fail(reason);
    }
  }

  payloadLifecycle(instanceId: number, mounted: boolean) {
    if (mounted) this.payloadMounts += 1;
    else this.payloadUnmounts += 1;
    this.note(mounted ? 'payload-mounted' : 'payload-unmounted', {
      instanceId,
    });
  }

  reactCommit(observation: ReactObservation) {
    if (!this.profilingRequested) return;
    if (
      ![
        observation.actualDurationMs,
        observation.baseDurationMs,
        observation.reactStartTimeMs,
        observation.reactCommitTimeMs,
      ].every((value) => Number.isFinite(value) && value >= 0)
    ) {
      this.fail('invalid-react-profiler-observation');
      return;
    }
    if (this.reactObservations.length >= MAX_REACT_OBSERVATIONS) {
      this.fail('react-profiler-observation-limit-exceeded');
      return;
    }
    this.reactObservations.push({ ...observation });
  }

  report(): BenchmarkReport {
    const errors = [...this.errors];
    const completeRoundTrip =
      this.journeys.length >= 2 &&
      this.journeys.length % 2 === 0 &&
      this.journeys.every(
        (journey, index) =>
          journey.direction === (index % 2 === 0 ? 'forward' : 'backward') &&
          journey.probe !== null &&
          journey.failure === null
      );
    if (!completeRoundTrip) errors.push('incomplete-verified-round-trip');
    const profilingSupported =
      this.profilingRequested && this.reactObservations.length > 0;
    if (this.profilingRequested && !profilingSupported) {
      errors.push('profiling-requested-but-no-profiler-callbacks');
    }
    if (this.droppedSamples > 0) errors.push('sample-buffer-overflow');
    if (
      this.scenario === 'live' &&
      (this.payloadMounts !== 1 || this.payloadUnmounts !== 0)
    ) {
      errors.push('live-payload-owner-not-retained');
    }
    return {
      schemaVersion: 1,
      fixtureVersion: 2,
      runId: this.runId,
      scenario: this.scenario,
      clock: 'js-performance-now',
      valid: errors.length === 0,
      errors,
      samples: this.samples.map((sample) => ({ ...sample })),
      droppedSamples: this.droppedSamples,
      journeys: this.journeys.map((journey) => ({
        ...journey,
        probe: journey.probe ? { ...journey.probe } : null,
      })),
      payloadMounts: this.payloadMounts,
      payloadUnmounts: this.payloadUnmounts,
      reactProfiling: {
        requested: this.profilingRequested,
        supported: profilingSupported,
        status: profilingSupported
          ? 'observed'
          : this.profilingRequested
            ? 'requested-but-no-callbacks'
            : 'not-requested',
        meaning:
          'React-render-work-for-committed-updates-not-native-commit-time',
        observations: this.reactObservations.map((observation) => ({
          ...observation,
        })),
      },
      limitations: [
        'JS callback timestamps are not native animation completion or frame presentation.',
        'Probe latency includes automation wait/polling; it is an observed successful-input upper bound.',
        'React durations are render work, not native commit time; native timing runs disable React profiling.',
        'Payload effects count React lifecycle observations, not physical native view identity.',
      ],
    };
  }
}
