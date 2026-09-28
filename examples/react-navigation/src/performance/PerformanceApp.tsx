import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Image,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  ChoreographyProvider,
  ChoreographyScreen,
  useChoreographyNavigation,
  useInteractiveTransition,
} from 'react-native-screen-choreography';
import { GalleryListScreen } from '../../../shared/gallery/GalleryListScreen';
import { GalleryDetailScreen } from '../../../shared/gallery/GalleryDetailScreen';
import {
  TripsListScreen,
  TripsDetailScreen,
} from '../../../shared/trips/TripsScreens';
import { TokenListScreen } from '../../../shared/wallet/TokenListScreen';
import { TokenDetailScreen } from '../../../shared/wallet/TokenDetailScreen';
import { TOKENS } from '../../../shared/wallet/data';
import { tokenLogoUri } from '../../../shared/wallet/TokenLogo';
import type { ExampleObservation } from '../../../shared/ExampleObservation';
import type { ExampleStackParams } from '../ExampleScreen';
import { ExampleBindings } from '../../../shared/runtime';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SCENARIOS } from './scenarios';

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
}

const Stack = createNativeStackNavigator<ExampleStackParams>();
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

function BenchmarkBindings({ children }: { children: React.ReactNode }) {
  const fixture = useFixture();
  const navigation =
    useNavigation<NativeStackNavigationProp<ExampleStackParams>>();
  const choreography = useChoreographyNavigation(navigation);
  const interactive = useInteractiveTransition();
  return (
    <ExampleBindings
      interactive={interactive}
      navigation={{
        open: () => {
          throw new Error('The benchmark stays inside its selected example');
        },
        navigate: async (destination, options) => {
          if (
            destination.screen !==
            SCENARIOS[fixture.collector.scenario].detailScreen
          )
            throw new Error('Unexpected benchmark destination');
          if (!fixture.request('forward')) return;
          try {
            await choreography.navigate(
              destination.screen,
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
  const scenario = SCENARIOS[fixture.collector.scenario];
  const [imageReady, setImageReady] = useState(false);
  const [assetsReady, setAssetsReady] = useState(
    fixture.collector.scenario !== 'wallet'
  );
  useEffect(() => {
    if (fixture.collector.scenario !== 'wallet') return;
    let cancelled = false;
    // Warm remote logos independently of FlatList's clipped/off-screen rows.
    Promise.all(
      TOKENS.map((token) => Image.prefetch(tokenLogoUri(token)))
    ).then(
      (loaded) => {
        if (cancelled) return;
        if (loaded.every(Boolean)) setAssetsReady(true);
        else fixture.fail('wallet-logo-prefetch-failed');
      },
      () => {
        if (!cancelled) fixture.fail('wallet-logo-prefetch-failed');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fixture]);
  useEffect(() => {
    if (imageReady && assetsReady) fixture.ready();
  }, [imageReady, assetsReady, fixture]);
  const observation = useMemo<ExampleObservation>(() => {
    return {
      rendered: (component, phase, itemId) => {
        if (component === 'hero' && itemId !== scenario.itemId) return;
        fixture.collector.renderCommitted(component, phase);
      },
      mounted: (itemId) => {
        if (itemId !== scenario.itemId) return () => {};
        const id = fixture.collector.allocatePayloadInstance();
        fixture.collector.payloadLifecycle(id, true);
        return () => fixture.collector.payloadLifecycle(id, false);
      },
      loaded: (itemId) => {
        if (itemId === scenario.itemId) setImageReady(true);
      },
      failed: (itemId) =>
        fixture.fail(
          `${fixture.collector.scenario}-image-load-failed:${itemId}`
        ),
    };
  }, [fixture, scenario]);
  const Screen = {
    gallery: GalleryListScreen,
    trips: TripsListScreen,
    wallet: TokenListScreen,
  }[fixture.collector.scenario];
  return (
    <ChoreographyScreen screenId={scenario.listScreen}>
      <BenchmarkBindings>
        <Screen observation={observation} />
      </BenchmarkBindings>
    </ChoreographyScreen>
  );
}

function DetailScreen({
  route,
}: {
  route: { params: { photoId?: string; tripId?: string; tokenId?: string } };
}) {
  const fixture = useFixture();
  const scenario = SCENARIOS[fixture.collector.scenario];
  const Screen = {
    gallery: GalleryDetailScreen,
    trips: TripsDetailScreen,
    wallet: TokenDetailScreen,
  }[fixture.collector.scenario];
  return (
    <ChoreographyScreen screenId={scenario.detailScreen}>
      <BenchmarkBindings>
        <Screen
          {...route.params}
          onRender={(phase) =>
            fixture.collector.renderCommitted('detail', phase)
          }
        />
      </BenchmarkBindings>
    </ChoreographyScreen>
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
    () => performance.now(),
    { preparationTracing: true, renderCounting: true }
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
          meaning: 'example-assets-loaded',
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
        initialRouteName={SCENARIOS[props.performanceScenario].listScreen}
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
        <Stack.Screen name="TripsList" component={ListScreen} />
        <Stack.Screen
          name="TripsDetail"
          component={DetailScreen}
          options={{
            presentation: 'containedTransparentModal',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="TokenList" component={ListScreen} />
        <Stack.Screen
          name="TokenDetail"
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
          <SafeAreaView edges={['bottom', 'right']} style={styles.toolbar}>
            <Text style={styles.caption}>
              {props.performanceScenario} · native timing
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
            <View style={styles.markers}>
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
            </View>
          </SafeAreaView>
          <View style={styles.navigation}>{navigator}</View>
        </View>
      </ChoreographyProvider>
    </FixtureContext.Provider>
  );
  return <SafeAreaProvider>{content}</SafeAreaProvider>;
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
  markers: { height: 48 },
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
