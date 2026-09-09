import React, {
  createContext,
  Profiler,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
} from 'react';
import { NativeModules, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  ChoreographyProvider,
  ChoreographyScreen,
  SharedElement,
  makeLiveTransition,
  useChoreographyNavigation,
  useInteractiveTransition,
  type SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  BenchmarkCollector,
  type JourneyDirection,
  type PerformanceScenario,
  type ProbeScreen,
} from './collector';

// React Native supplies this clock; the example intentionally does not add DOM types.
declare const performance: { now: () => number };

export interface PerformanceLaunchProps {
  performanceScenario: PerformanceScenario;
  performanceReactProfile?: boolean;
}

type StackParams = { BenchmarkList: undefined; BenchmarkDetail: undefined };
const Stack = createNativeStackNavigator<StackParams>();
const GROUP = 'benchmark.fixed';
const TRANSITION_MS = 350;
const REQUEST_TIMEOUT_MS = 10000;

interface BenchmarkNativeModule {
  finishRun?: (json: string) => Promise<string>;
  recordSample?: (json: string) => void;
  acknowledgeInput?: (screen: ProbeScreen) => void;
  reportFullyDrawn?: () => void;
}

function nativeBenchmark(): BenchmarkNativeModule | undefined {
  return NativeModules.ChoreographyBenchmark as
    | BenchmarkNativeModule
    | undefined;
}

interface FixtureActions {
  collector: BenchmarkCollector;
  scenario: PerformanceScenario;
  ready: () => void;
  request: (direction: JourneyDirection) => boolean;
  probe: (screen: ProbeScreen) => void;
  fail: (reason: string) => void;
}
const FixtureContext = createContext<FixtureActions | null>(null);
function useFixture() {
  const fixture = useContext(FixtureContext);
  if (!fixture) throw new Error('Benchmark fixture context is missing');
  return fixture;
}

/** Both modes animate the same bounds; ordinary mode mounts renderer content. */
function BoundsMotion({
  progress,
  direction,
  source,
  target,
  children,
}: SharedElementTransitionRendererProps & { children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const t = direction === 'backward' ? 1 - progress.value : progress.value;
    return {
      left: interpolate(
        t,
        [0, 1],
        [source.metrics.pageX, target.metrics.pageX]
      ),
      top: interpolate(t, [0, 1], [source.metrics.pageY, target.metrics.pageY]),
      width: interpolate(
        t,
        [0, 1],
        [source.metrics.width, target.metrics.width]
      ),
      height: interpolate(
        t,
        [0, 1],
        [source.metrics.height, target.metrics.height]
      ),
    };
  });
  return (
    <Animated.View style={[styles.movingPayload, style]}>
      {children}
    </Animated.View>
  );
}
function OrdinaryMotion(props: SharedElementTransitionRendererProps) {
  return <BoundsMotion {...props}>{props.source.content}</BoundsMotion>;
}
const ordinaryTransition = { renderer: OrdinaryMotion, zIndex: 100 };
const liveTransition = makeLiveTransition({ renderer: BoundsMotion });

function Payload({ collector }: { collector: BenchmarkCollector }) {
  const instanceId = useRef<number | null>(null);
  if (instanceId.current === null) {
    instanceId.current = collector.allocatePayloadInstance();
  }
  useEffect(() => {
    collector.payloadLifecycle(instanceId.current!, true);
    return () => collector.payloadLifecycle(instanceId.current!, false);
  }, [collector]);

  return (
    <View style={styles.payload}>
      <View style={styles.artwork}>
        {Array.from({ length: 24 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.tile,
              index % 3 === 0 ? styles.tileLight : styles.tileDark,
            ]}
          />
        ))}
      </View>
      <Text style={styles.payloadTitle}>Deterministic shared panel</Text>
      <View style={styles.bars}>
        {Array.from({ length: 32 }, (_, index) => (
          <View
            key={index}
            style={[styles.bar, { height: 8 + ((index * 17) % 29) }]}
          />
        ))}
      </View>
    </View>
  );
}

function SharedPayload({ detail }: { detail: boolean }) {
  const { collector, scenario } = useFixture();
  const style = detail ? styles.detailBounds : styles.listBounds;
  if (scenario === 'live') {
    return detail ? (
      <SharedElement.LiveTarget
        id="panel"
        groupId={GROUP}
        style={style}
        transition={liveTransition}
      />
    ) : (
      <SharedElement.Live
        id="panel"
        groupId={GROUP}
        style={style}
        transition={liveTransition}
      >
        <Payload collector={collector} />
      </SharedElement.Live>
    );
  }
  return (
    <SharedElement
      id="panel"
      groupId={GROUP}
      transition={ordinaryTransition}
      style={style}
    >
      <Payload collector={collector} />
    </SharedElement>
  );
}

function Control({
  id,
  label,
  onPress,
  disabled = false,
}: {
  id: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityLabel={id}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Marker({ id }: { id: string }) {
  return (
    <Text testID={id} accessibilityLabel={id} style={styles.marker}>
      {id}
    </Text>
  );
}

function ListScreen({
  navigation,
}: NativeStackScreenProps<StackParams, 'BenchmarkList'>) {
  const fixture = useFixture();
  const choreography = useChoreographyNavigation(navigation);
  const readySent = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const layout = useCallback(() => {
    if (readySent.current) return;
    readySent.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (mounted.current) fixture.ready();
      })
    );
  }, [fixture]);
  return (
    <ChoreographyScreen screenId="BenchmarkList">
      <View style={styles.screen} onLayout={layout}>
        <Text style={styles.heading}>Transition benchmark</Text>
        <Text style={styles.caption}>
          Fixed assets · one pair · {TRANSITION_MS} ms
        </Text>
        <SharedPayload detail={false} />
        <View style={styles.controls}>
          <Control
            id="benchmark-start"
            label="Start transition"
            onPress={() => {
              if (!fixture.request('forward')) return;
              choreography
                .navigate('BenchmarkDetail', undefined, {
                  transitionConfig: { group: GROUP },
                  duration: TRANSITION_MS,
                })
                .catch((error: unknown) => {
                  fixture.fail(`forward-transition-error:${String(error)}`);
                });
            }}
          />
          <Control
            id="benchmark-list-probe"
            label="Probe list input"
            onPress={() => fixture.probe('list')}
          />
        </View>
      </View>
    </ChoreographyScreen>
  );
}

function DetailScreen() {
  const fixture = useFixture();
  const interactive = useInteractiveTransition();
  return (
    <ChoreographyScreen screenId="BenchmarkDetail">
      <View style={styles.screen}>
        <Text style={styles.heading}>Shared panel detail</Text>
        <SharedPayload detail />
        <View style={styles.controls}>
          <Control
            id="benchmark-detail-probe"
            label="Probe detail input"
            onPress={() => fixture.probe('detail')}
          />
          <Control
            id="benchmark-back"
            label="Return to list"
            onPress={() => {
              if (!fixture.request('backward')) return;
              interactive
                .beginBack()
                .then((session) => {
                  if (!session) {
                    fixture.fail('back-transition-unavailable');
                    return;
                  }
                  interactive.finish({ duration: TRANSITION_MS });
                })
                .catch((error: unknown) => {
                  fixture.fail(`back-transition-error:${String(error)}`);
                });
            }}
          />
        </View>
      </View>
    </ChoreographyScreen>
  );
}

/** A controlled update confirms the profiling renderer is actually collecting. */
function ProfilingCalibration() {
  const [updated, setUpdated] = useState(false);
  useLayoutEffect(() => setUpdated(true), []);
  return (
    <Text style={styles.marker}>
      Profiling calibration {updated ? '1' : '0'}
    </Text>
  );
}

type UiStatus =
  | 'loading'
  | 'ready'
  | 'running'
  | 'detail-settled'
  | 'list-settled'
  | 'failed';
let runCounter = 0;
// Wall time/randomness distinguish exports across processes; durations never use them.
const launchNonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function createCollector(props: PerformanceLaunchProps) {
  return new BenchmarkCollector(
    `${props.performanceScenario}-${launchNonce}-${++runCounter}`,
    props.performanceScenario,
    props.performanceReactProfile === true,
    () => performance.now()
  );
}

export default function PerformanceApp(props: PerformanceLaunchProps) {
  const [collector, setCollector] = useState(() => createCollector(props));
  const [status, setStatus] = useState<UiStatus>('loading');
  const [probeAck, setProbeAck] = useState<ProbeScreen | null>(null);
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRequestTimer = useCallback(() => {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    requestTimer.current = null;
  }, []);
  useEffect(() => clearRequestTimer, [clearRequestTimer]);

  const fixture = useMemo<FixtureActions>(
    () => ({
      collector,
      scenario: props.performanceScenario,
      ready: () => {
        collector.note('fixture-ready', {
          meaning: 'list-layout-plus-two-JS-animation-frames',
        });
        setStatus('ready');
        nativeBenchmark()?.reportFullyDrawn?.();
      },
      request: (direction) => {
        if (!collector.request(direction)) return false;
        setProbeAck(null);
        setExported(false);
        setStatus('running');
        clearRequestTimer();
        requestTimer.current = setTimeout(() => {
          collector.fail('request-timeout-before-session-end');
          setStatus('failed');
        }, REQUEST_TIMEOUT_MS);
        return true;
      },
      probe: (screen) => {
        nativeBenchmark()?.acknowledgeInput?.(screen);
        if (collector.probe(screen)) setProbeAck(screen);
      },
      fail: (reason) => {
        clearRequestTimer();
        collector.fail(reason);
        setStatus('failed');
      },
    }),
    [collector, props.performanceScenario, clearRequestTimer]
  );

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      collector.reactCommit({
        id,
        phase,
        actualDurationMs: actualDuration,
        baseDurationMs: baseDuration,
        reactStartTimeMs: startTime,
        reactCommitTimeMs: commitTime,
      });
    },
    [collector]
  );

  const exportRun = useCallback(async () => {
    const report = collector.report();
    const bridge = nativeBenchmark();
    if (bridge?.finishRun) {
      await bridge.finishRun(JSON.stringify(report));
    } else if (bridge?.recordSample) {
      bridge.recordSample(JSON.stringify({ kind: 'run', ...report }));
    } else {
      throw new Error(
        'ChoreographyBenchmark native export module is unavailable'
      );
    }
  }, [collector]);

  const finish = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportRun();
      setExported(true);
    } catch (error) {
      collector.fail(`export-failed:${String(error)}`);
      setStatus('failed');
    } finally {
      setExporting(false);
    }
  };

  const reset = async () => {
    if (exporting) return;
    setExporting(true);
    clearRequestTimer();
    try {
      if (collector.hasRequests() && !exported) {
        collector.abortUnfinished('reset-before-probe-completion');
        await exportRun();
      }
      setStatus('loading');
      setProbeAck(null);
      setExported(false);
      setCollector(createCollector(props));
    } catch (error) {
      collector.fail(`reset-export-failed:${String(error)}`);
      setStatus('failed');
    } finally {
      setExporting(false);
    }
  };

  const navigator = (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'none',
          gestureEnabled: false,
          freezeOnBlur: false,
          contentStyle: { backgroundColor: '#0F172A' },
        }}
      >
        <Stack.Screen name="BenchmarkList" component={ListScreen} />
        <Stack.Screen
          name="BenchmarkDetail"
          component={DetailScreen}
          options={{
            presentation: 'containedTransparentModal',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  const content = (
    <FixtureContext.Provider value={fixture}>
      <ChoreographyProvider
        key={collector.runId}
        debug={false}
        onTransitionStart={(session) => {
          collector.sessionActive(
            session.id,
            session.direction,
            session.pairs.length
          );
        }}
        onTransitionEnd={(session) => {
          clearRequestTimer();
          const screen = collector.sessionEnd(session.id);
          setStatus(screen ? `${screen}-settled` : 'failed');
        }}
      >
        <View style={styles.root}>
          <View style={styles.toolbar}>
            <Text style={styles.caption}>
              {props.performanceScenario} ·{' '}
              {props.performanceReactProfile
                ? 'React profile'
                : 'native timing'}
            </Text>
            <Text
              testID="benchmark-run-id"
              accessibilityLabel={`benchmark-run-id:${collector.runId}`}
              accessibilityValue={{ text: collector.runId }}
              style={styles.marker}
            >
              {collector.runId}
            </Text>
            <View style={styles.controls}>
              <Control
                id="benchmark-reset"
                label="Reset"
                onPress={reset}
                disabled={exporting}
              />
              <Control
                id="benchmark-end"
                label="Export run"
                onPress={finish}
                disabled={exporting || status === 'running'}
              />
            </View>
            {status === 'ready' && <Marker id="benchmark-ready" />}
            {status === 'detail-settled' && (
              <Marker id="benchmark-detail-settled" />
            )}
            {status === 'list-settled' && (
              <Marker id="benchmark-list-settled" />
            )}
            {status === 'failed' && <Marker id="benchmark-failed" />}
            {probeAck && <Marker id={`benchmark-${probeAck}-probe-ack`} />}
            {exported && (
              <>
                <Marker id="benchmark-export-complete" />
                <Marker id="benchmark-exported" />
              </>
            )}
            {props.performanceReactProfile === true && <ProfilingCalibration />}
          </View>
          <View style={styles.navigation}>{navigator}</View>
        </View>
      </ChoreographyProvider>
    </FixtureContext.Provider>
  );
  return props.performanceReactProfile === true ? (
    <Profiler id="benchmark-root" onRender={onRender}>
      {content}
    </Profiler>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 44,
    paddingBottom: 24,
  },
  navigation: { flex: 1 },
  toolbar: { paddingHorizontal: 16, height: 152 },
  controls: { flexDirection: 'row', gap: 12 },
  screen: { flex: 1, padding: 16, backgroundColor: '#0F172A' },
  heading: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  caption: { color: '#CBD5E1', fontSize: 12, marginBottom: 8 },
  marker: { color: '#93C5FD', fontSize: 10, lineHeight: 12, height: 12 },
  button: {
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: 6,
    minHeight: 44,
  },
  buttonText: { color: '#FFFFFF', fontSize: 14 },
  disabled: { opacity: 0.4 },
  listBounds: { width: 256, height: 156, marginBottom: 20 },
  detailBounds: { width: 296, height: 224, marginBottom: 20 },
  movingPayload: { position: 'absolute', overflow: 'hidden' },
  payload: {
    flex: 1,
    width: '100%',
    height: '100%',
    padding: 12,
    backgroundColor: '#172554',
    overflow: 'hidden',
  },
  artwork: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 60,
    gap: 2,
    overflow: 'hidden',
  },
  tile: { width: 24, height: 24 },
  tileLight: { backgroundColor: '#93C5FD' },
  tileDark: { backgroundColor: '#2563EB' },
  payloadTitle: { color: '#FFFFFF', fontSize: 14, marginTop: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 40 },
  bar: { width: 4, backgroundColor: '#60A5FA' },
});
