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
import {
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  ChoreographyProvider,
  ChoreographyScreen,
  SharedElement,
  StandInElement,
  makeLiveTransition,
  useChoreographyNavigation,
  useInteractiveTransition,
  type SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';
import { GalleryImage } from '../../../shared/gallery/GalleryImage';
import { PHOTOS } from '../../../shared/gallery/data';
import { AppIcon } from '../../../shared/AppChrome';
import {
  galleryFrameTransition,
  galleryPhotoTransition,
  galleryTitleTransition,
  galleryLocationTransition,
  galleryGlyphTransition,
} from './galleryTransitions';
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

type StackParams = { BenchmarkList: undefined; BenchmarkDetail: undefined };
const Stack = createNativeStackNavigator<StackParams>();
const GROUP = 'benchmark.fixed';
const TRANSITION_MS = 350;
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

/** Match the gallery photo recipe for the retained live owner. */
function GalleryLiveMotion({
  progress,
  direction,
  source,
  target,
  children,
  zIndex,
}: SharedElementTransitionRendererProps & { children: React.ReactNode }) {
  const backward = direction === 'backward';
  return (
    <StandInElement
      progress={progress}
      direction={direction}
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      sourceBorderRadius={backward ? 0 : theme.radius.lg}
      targetBorderRadius={backward ? theme.radius.lg : 0}
      zIndex={zIndex}
    >
      {children}
    </StandInElement>
  );
}
const ordinaryTransition = galleryPhotoTransition;
const liveTransition = makeLiveTransition({
  renderer: GalleryLiveMotion,
  zIndex: 2,
});

function Payload({
  collector,
  onLoad,
}: {
  collector: BenchmarkCollector;
  onLoad: () => void;
}) {
  const instanceId = useRef<number | null>(null);
  if (instanceId.current === null) {
    instanceId.current = collector.allocatePayloadInstance();
  }
  useEffect(() => {
    collector.payloadLifecycle(instanceId.current!, true);
    return () => collector.payloadLifecycle(instanceId.current!, false);
  }, [collector]);

  const fixture = useFixture();
  return (
    <GalleryImage
      photo={PHOTOS[0]!}
      onLoad={onLoad}
      onError={() => fixture.fail('gallery-image-load-failed')}
    />
  );
}

function useOpenPhoto() {
  const fixture = useFixture();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const choreography = useChoreographyNavigation(navigation);
  return () => {
    if (!fixture.request('forward')) return;
    choreography
      .navigate('BenchmarkDetail', undefined, {
        transitionConfig: { group: GROUP },
        duration: TRANSITION_MS,
      })
      .catch((error: unknown) => {
        fixture.fail(`forward-transition-error:${String(error)}`);
      });
  };
}

function SharedPayload({
  detail,
  onLoad = () => {},
}: {
  detail: boolean;
  onLoad?: () => void;
}) {
  const { collector, scenario } = useFixture();
  if (scenario === 'live') {
    return detail ? (
      <SharedElement.LiveTarget
        id="panel"
        groupId={GROUP}
        style={StyleSheet.absoluteFill}
        transition={liveTransition}
      />
    ) : (
      <SharedElement.Live
        id="panel"
        groupId={GROUP}
        style={StyleSheet.absoluteFill}
        transition={liveTransition}
      >
        <Payload collector={collector} onLoad={onLoad} />
      </SharedElement.Live>
    );
  }
  return (
    <SharedElement
      id="panel"
      groupId={GROUP}
      transition={ordinaryTransition}
      style={StyleSheet.absoluteFill}
    >
      <Payload collector={collector} onLoad={onLoad} />
    </SharedElement>
  );
}

function GalleryCard({
  detail,
  onLoad,
}: {
  detail: boolean;
  onLoad?: () => void;
}) {
  const photo = PHOTOS[0]!;
  return (
    <SharedElement
      id="frame"
      groupId={GROUP}
      transition={galleryFrameTransition}
      style={[
        StyleSheet.absoluteFill,
        styles.cardBackground,
        detail && styles.heroFrame,
      ]}
    >
      <View style={styles.cardInner}>
        <SharedPayload detail={detail} onLoad={onLoad} />
        <View pointerEvents="none" style={styles.scrim} />
        <View style={styles.glyphPosition}>
          <SharedElement
            id="glyph"
            groupId={GROUP}
            transition={galleryGlyphTransition}
            style={detail ? styles.heroGlyph : styles.tileGlyph}
          >
            <View style={styles.glyphCenter}>
              <AppIcon name="camera" size={detail ? 21 : 14} />
            </View>
          </SharedElement>
        </View>
        <View style={styles.photoMeta}>
          <SharedElement
            id="title"
            groupId={GROUP}
            transition={galleryTitleTransition}
          >
            <Text style={[styles.photoTitle, detail && styles.heroTitle]}>
              {photo.title}
            </Text>
          </SharedElement>
          <SharedElement
            id="location"
            groupId={GROUP}
            transition={galleryLocationTransition}
          >
            <Text style={styles.caption}>{photo.location}</Text>
          </SharedElement>
        </View>
      </View>
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

function ListScreen() {
  const fixture = useFixture();
  const open = useOpenPhoto();
  const { width } = useWindowDimensions();
  const tileWidth = (width - 44) / 2;
  const readySent = useRef(false);
  const imageLoaded = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const layout = useCallback(() => {
    if (readySent.current || !imageLoaded.current) return;
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
        <Text style={styles.heading}>Field notes</Text>
        <Text style={styles.caption}>
          THE FIELD JOURNAL · {TRANSITION_MS} ms
        </Text>
        <ScrollView contentContainerStyle={styles.grid}>
          <Pressable
            testID="benchmark-start"
            accessibilityLabel="benchmark-start"
            accessibilityRole="button"
            onPress={open}
            style={{ width: tileWidth, height: tileWidth / 0.72 }}
          >
            <GalleryCard
              detail={false}
              onLoad={() => {
                imageLoaded.current = true;
                layout();
              }}
            />
          </Pressable>
          {PHOTOS.slice(1).map((photo) => (
            <View
              key={photo.id}
              style={[
                styles.staticCard,
                { width: tileWidth, height: tileWidth / 0.72 },
              ]}
            >
              <GalleryImage photo={photo} />
              <View style={styles.scrim} />
              <View style={styles.photoMeta}>
                <Text style={styles.photoTitle}>{photo.title}</Text>
                <Text style={styles.caption}>{photo.location}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.controls}>
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
        <Text style={styles.heading}>Field notes</Text>
        <ScrollView>
          <View style={styles.heroBounds}>
            <GalleryCard detail />
          </View>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.caption}>{PHOTOS[0]!.description}</Text>
          <Text style={styles.sectionTitle}>Exposure</Text>
          <Text style={styles.caption}>
            {PHOTOS[0]!.iso} · {PHOTOS[0]!.shutter} · {PHOTOS[0]!.aperture}
          </Text>
        </ScrollView>
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
      scenario: props.performanceScenario,
      ready: () => {
        collector.note('fixture-ready', {
          meaning: 'list-layout-plus-two-JS-animation-frames',
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
          contentStyle: { backgroundColor: theme.bg },
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
    backgroundColor: theme.bg,
    paddingTop: 44,
    paddingBottom: 24,
  },
  navigation: { flex: 1 },
  toolbar: { paddingHorizontal: 16, paddingBottom: 12 },
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
  heroFrame: { borderRadius: 0 },
  heroBounds: { width: '100%', aspectRatio: 1 },
  heroGlyph: { width: 42, height: 42 },
  tileGlyph: { width: 28, height: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 12 },
  staticCard: { borderRadius: theme.radius.lg, overflow: 'hidden' },
  cardBackground: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  cardInner: { flex: 1 },
  photoMeta: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  photoTitle: {
    color: theme.text,
    fontFamily: theme.font,
    fontSize: 16,
    fontWeight: '600',
  },
  heroTitle: { fontSize: 28 },
  sectionTitle: {
    color: theme.text,
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  glyphPosition: { position: 'absolute', right: 10, top: 10 },
  glyphCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)',
  },
});
