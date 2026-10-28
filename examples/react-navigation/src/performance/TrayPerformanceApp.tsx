import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NativeModules, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyProvider } from 'react-native-screen-choreography';
import {
  GalleryPlusTrayProvider,
  GalleryPlusTrayLauncher,
  TrayDemoProvider,
  TrayDemoLauncher,
  TrayExampleObservation,
} from '@screen-choreography/example-shared/tray';
import {
  TrayDiagnosticsContext,
  type TrayDiagnostics,
} from '../../../../src/tray/diagnostics';
import type { TrayStackState } from '../../../../src/tray/stack';
import { BenchmarkCollector } from './collector';
import { TrayBenchmarkCollector, type TrayMotion } from './tray-collector';
import { TRAY_SCENARIOS, type TrayPerformanceScenario } from './scenarios';
import { MotionObserver } from './MotionObserver';
import type { MotionRequest } from './motion';

declare const performance: { now: () => number };
const native = () =>
  NativeModules.ChoreographyBenchmark as {
    finishRun: (json: string) => Promise<string>;
    acknowledgeInput: (probe: string) => void;
    reportFullyDrawn?: () => Promise<void>;
  };

const FixtureContext = createContext<{
  trace: TrayBenchmarkCollector;
  request: SharedValue<MotionRequest | null>;
  probe: (state: TrayStackState | null) => void;
  finish: () => void;
  ack: number | null;
  exported: boolean;
  failed: boolean;
} | null>(null);

function Marker({ id }: { id: string }) {
  return (
    <Text testID={id} accessibilityLabel={id} style={styles.marker}>
      {id}
    </Text>
  );
}

function Probe({
  state,
  home = false,
}: {
  state: TrayStackState | null;
  home?: boolean;
}) {
  const fixture = useContext(FixtureContext)!;
  const { trace } = fixture;
  const step = trace.current();
  const ready = trace.ready(state);
  useLayoutEffect(() => {
    trace.committed(state);
  });
  return (
    <View style={[styles.probe, home && styles.homeProbe]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="benchmark-tray-probe"
        disabled={!ready || step?.probeMs !== null}
        onPress={() => fixture.probe(state)}
        style={styles.button}
      >
        <Text style={styles.text}>Probe</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="benchmark-end"
        onPress={fixture.finish}
        style={styles.button}
      >
        <Text style={styles.text}>Export</Text>
      </Pressable>
      {ready && <Marker id={`benchmark-tray-step-${step!.id}-settled`} />}
      {fixture.ack !== null && (
        <Marker id={`benchmark-tray-step-${fixture.ack}-probe-ack`} />
      )}
      {fixture.failed && <Marker id="benchmark-failed" />}
      {fixture.exported && <Marker id="benchmark-export-complete" />}
    </View>
  );
}

/** Mounted inside the real sheet, under its isolated choreography provider. */
function TrayObserver({
  state,
  progress,
}: {
  state: TrayStackState;
  progress: SharedValue<number>;
}) {
  const { trace, request } = useContext(FixtureContext)!;
  const observed = useSharedValue({ id: 0, first: -1, delivered: false });
  const session = state.session;
  const transitionId = state.transition?.id ?? 0;
  const deliver = useCallback(
    (sample: TrayMotion) => trace.motion(sample),
    [trace]
  );
  useAnimatedReaction(
    () => ({ id: transitionId, p: progress.value }),
    ({ id, p }) => {
      if (!id) return;
      if (observed.value.id !== id)
        observed.value = { id, first: -1, delivered: false };
      const sample = observed.value;
      if (sample.delivered) return;
      const now = performance.now();
      if (sample.first < 0 && p > 0 && p < 1)
        observed.value = { ...sample, first: now };
      if (sample.first >= 0 && p === 1) {
        observed.value = { ...sample, delivered: true };
        scheduleOnRN(deliver, {
          session,
          transitionId: id,
          firstMotionMs: sample.first,
          motionEndMs: now,
        });
      }
    },
    [session, transitionId, deliver]
  );
  return (
    <>
      <MotionObserver request={request} collector={trace.shared} />
      <Probe state={state} />
    </>
  );
}

export default function TrayPerformanceApp({
  performanceScenario,
}: {
  performanceScenario: TrayPerformanceScenario;
}) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [ack, setAck] = useState<number | null>(null);
  const [exported, setExported] = useState(false);
  const [presented, setPresented] = useState(false);
  const request = useSharedValue<MotionRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const [trace] = useState(() => {
    const collector = new BenchmarkCollector(
      `${performanceScenario}-${Date.now().toString(36)}`,
      performanceScenario,
      () => performance.now(),
      {
        preparationTracing: true,
        renderCounting: true,
        motionTracing: true,
        presentationTracing: true,
      }
    );
    return new TrayBenchmarkCollector(
      collector,
      TRAY_SCENARIOS[performanceScenario],
      () => {
        clearTimer();
        setAck(null);
        timer.current = setTimeout(() => {
          collector.fail('tray-step-timeout');
          setFailed(true);
        }, 10000);
      },
      () => setFailed(true)
    );
  });
  useEffect(() => clearTimer, [clearTimer]);
  useEffect(() => {
    (native().reportFullyDrawn?.() ?? Promise.resolve()).then(
      () => setReady(true),
      () => trace.fail('tray-fully-drawn-failed')
    );
  }, [trace]);

  const exporting = useRef(false);
  const finish = useCallback(async () => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      await native().finishRun(JSON.stringify(trace.report()));
      setExported(true);
    } catch (error) {
      trace.fail(`tray-export-failed:${String(error)}`);
    } finally {
      exporting.current = false;
    }
  }, [trace]);
  useEffect(() => {
    if (failed) {
      clearTimer();
      finish();
    }
  }, [failed, finish, clearTimer]);

  const diagnostics = useMemo<TrayDiagnostics>(
    () => ({
      dispatch: (action, previous, next) => {
        trace.dispatch(action, previous, next);
        if (previous.phase === 'closed' && next.phase !== 'closed') {
          setPresented(true);
        }
        if (next.phase === 'closed' && previous.phase !== 'closed') {
          request.value = null;
          setPresented(false);
        }
      },
      choreography: {
        onPreparationTrace: (sample) => trace.shared.preparationTrace(sample),
        onTransitionStart: (session) => {
          trace.shared.sessionActive(
            session.id,
            session.direction,
            session.pairs.length,
            session.presentationTiming
          );
          const current = trace.shared.currentRequest();
          request.value = current
            ? { ...current, presentationTiming: session.presentation?.timing }
            : null;
        },
        onTransitionEnd: (session) => {
          trace.shared.sessionEnd(session.id);
        },
      },
      Observer: TrayObserver,
    }),
    [trace, request]
  );
  const observation = useMemo(
    () => ({
      render: (name: string, phase: 'mount' | 'update') =>
        trace.render(name, phase),
      mount: (name: string) => trace.mount(name),
    }),
    [trace]
  );
  const fixture = useMemo(
    () => ({
      trace,
      request,
      ack,
      exported,
      failed,
      finish,
      probe: (state: TrayStackState | null) => {
        const id = trace.probe(state);
        if (id) {
          native().acknowledgeInput(id);
          clearTimer();
          setAck(trace.current()!.id);
        }
      },
    }),
    [trace, request, ack, exported, failed, finish, clearTimer]
  );
  const Provider =
    performanceScenario === 'tray-wallet'
      ? TrayDemoProvider
      : GalleryPlusTrayProvider;
  const Launcher =
    performanceScenario === 'tray-wallet'
      ? TrayDemoLauncher
      : GalleryPlusTrayLauncher;
  return (
    <KeyboardProvider>
      <SafeAreaProvider>
        <ChoreographyProvider debug={false}>
          <FixtureContext.Provider value={fixture}>
            <TrayDiagnosticsContext.Provider value={diagnostics}>
              <TrayExampleObservation.Provider value={observation}>
                <Provider>
                  <View style={styles.home}>
                    <Launcher />
                    {ready && <Marker id="benchmark-ready" />}
                    {!presented && <Probe state={trace.currentState()} home />}
                  </View>
                </Provider>
              </TrayExampleObservation.Provider>
            </TrayDiagnosticsContext.Provider>
          </FixtureContext.Provider>
        </ChoreographyProvider>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  homeProbe: { top: undefined, bottom: 48, right: 24 },
  home: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#18181b',
  },
  probe: {
    position: 'absolute',
    top: 72,
    right: 68,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#303037',
  },
  text: { color: 'white', fontSize: 10 },
  marker: { width: 1, height: 1, fontSize: 1, color: 'white' },
});
