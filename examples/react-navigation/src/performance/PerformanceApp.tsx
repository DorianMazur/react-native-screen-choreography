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
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  ChoreographyProvider,
  ChoreographyScreen,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';
import {
  GalleryListScreen,
  type GalleryObservation,
} from '../../../shared/gallery/GalleryListScreen';
import { GalleryDetailScreen } from '../../../shared/gallery/GalleryDetailScreen';
import { ExampleBindings } from '../../../shared/runtime';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PHOTOS } from '../../../shared/gallery/data';

import { theme } from '../../../shared/theme';
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

type StackParams = {
  GalleryList: undefined;
  GalleryDetail: { photoId: string };
};
const Stack = createNativeStackNavigator<StackParams>();
const REQUEST_TIMEOUT_MS = 10000;

interface BenchmarkNativeModule {
  finishRun?: (json: string) => Promise<string>;
  recordSample?: (json: string) => void;
  acknowledgeInput?: (screen: ProbeScreen) => void;
  reportFullyDrawn?: () => Promise<void>;
}

function nativeBenchmark(): BenchmarkNativeModule | undefined {
  return NativeModules.ChoreographyBenchmark as
    | BenchmarkNativeModule
    | undefined;
}

interface FixtureActions {
  collector: BenchmarkCollector;
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

function GalleryBindings({ children }: { children: React.ReactNode }) {
  const fixture = useFixture();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const choreography = useChoreographyNavigation(navigation);
  return (
    <ExampleBindings
      navigation={{
        open: () => {
          throw new Error('Only Gallery is available in the benchmark');
        },
        navigate: async (destination, options) => {
          if (destination.screen !== 'GalleryDetail')
            throw new Error('Unexpected benchmark destination');
          if (!fixture.request('forward')) return;
          try {
            await choreography.navigate(
              'GalleryDetail',
              destination.params,
              options
            );
          } catch (error) {
            fixture.fail(`forward-transition-error:${String(error)}`);
          }
        },
        goBack: async (options) => {
          if (!fixture.request('backward')) return;
          try {
            await choreography.goBack(options);
          } catch (error) {
            fixture.fail(`back-transition-error:${String(error)}`);
          }
        },
      }}
    >
      {children}
    </ExampleBindings>
  );
}

function ListScreen() {
  const fixture = useFixture();
  const observation = useMemo<GalleryObservation>(() => {
    let ready = false;
    return {
      mounted: (photoId) => {
        if (photoId !== PHOTOS[0]!.id) return () => {};
        const id = fixture.collector.allocatePayloadInstance();
        fixture.collector.payloadLifecycle(id, true);
        return () => fixture.collector.payloadLifecycle(id, false);
      },
      loaded: (photoId) => {
        if (photoId !== PHOTOS[0]!.id || ready) return;
        ready = true;
        fixture.ready();
      },
      failed: (photoId) => fixture.fail(`gallery-image-load-failed:${photoId}`),
    };
  }, [fixture]);
  return (
    <ChoreographyScreen screenId="GalleryList">
      <GalleryBindings>
        <GalleryListScreen observation={observation} />
      </GalleryBindings>
    </ChoreographyScreen>
  );
}

function DetailScreen({ route }: { route: { params: { photoId: string } } }) {
  return (
    <ChoreographyScreen screenId="GalleryDetail">
      <GalleryBindings>
        <GalleryDetailScreen photoId={route.params.photoId} />
      </GalleryBindings>
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
    () => performance.now(),
    { preparationTracing: true }
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
      ready: () => {
        collector.note('fixture-ready', {
          meaning: 'selected-gallery-image-loaded',
        });
        // Keep startup tracing open until Android has reported fully drawn.
        // Publishing the marker first can race the native module/UI queues.
        const fullyDrawn = nativeBenchmark()?.reportFullyDrawn?.();
        if (fullyDrawn) {
          fullyDrawn.then(
            () => setStatus('ready'),
            () => {
              collector.fail('native-fully-drawn-report-failed');
              setStatus('failed');
            }
          );
        } else {
          setStatus('ready');
        }
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
    [collector, clearRequestTimer]
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
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="GalleryList" component={ListScreen} />
        <Stack.Screen
          name="GalleryDetail"
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
        onPreparationTrace={(trace) => collector.preparationTrace(trace)}
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
            <Control
              id="benchmark-list-probe"
              label="Probe list"
              onPress={() => fixture.probe('list')}
              disabled={status !== 'list-settled'}
            />
            <Control
              id="benchmark-detail-probe"
              label="Probe detail"
              onPress={() => fixture.probe('detail')}
              disabled={status !== 'detail-settled'}
            />
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
  return (
    <SafeAreaProvider>
      {props.performanceReactProfile === true ? (
        <Profiler id="benchmark-root" onRender={onRender}>
          {content}
        </Profiler>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  navigation: { flex: 1 },
  toolbar: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    zIndex: 100,
    padding: 8,
    backgroundColor: theme.bg,
  },
  controls: { flexDirection: 'row', gap: 12 },
  screen: { flex: 1, padding: 16, backgroundColor: theme.bg },
  heading: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  caption: { color: theme.textSecondary, fontSize: 12, marginBottom: 8 },
  marker: { color: theme.textMuted, fontSize: 10, lineHeight: 12, height: 12 },
  button: {
    backgroundColor: theme.surfaceElevated,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: 6,
    minHeight: 44,
  },
  buttonText: { color: theme.text, fontSize: 14 },
  disabled: { opacity: 0.4 },
});
