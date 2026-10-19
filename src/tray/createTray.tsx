import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ColorValue, ViewStyle } from 'react-native';
import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyOverlay } from '../components/ChoreographyOverlay';
import { ChoreographyActionsContext } from '../core/ChoreographyContext';
import { ScreenIdContext } from '../core/screenIdContext';
import { ChoreographyProgressProvider } from '../core/ChoreographyProgressContext';
import {
  TrayChoreography,
  useTrayGeometry,
  useTraySharedTransition,
} from './TrayChoreography';
import { readTrayDeclaration } from './declarations';
import { useTrayKeyboard } from './useTrayKeyboard';
import { TrayHeaderLayer } from './TrayHeaderLayer';
import { animateTrayValue } from './animation';
import type { ResolvedTrayAnimation } from './animation';
import type { TrayScreenMap } from './declarations';
import type { TrayAction, TrayEntry, TrayStackState } from './stack';
import { createTrayStateStore } from './state';
import type {
  TrayHeaderProps,
  TrayNavigation,
  TrayNavigationOptions,
  TrayParamList,
  TrayProviderProps,
  TrayRoute,
  TrayScreenDeclarationProps,
  TrayScreenProps,
  TrayStackProps,
  TrayState,
} from './types';

const DETENTS = [0, 'content'] as const;
const DEFAULT_HEADER_HEIGHT = 56;
const HANDLE_HEIGHT = 14;
const CONTENT_FADE_END = 0.75;

/** Call outside render to preserve the provider and screen identities. */
export function createTray<P extends TrayParamList>() {
  const Context = createContext<TrayNavigation<P> | null>(null);
  const StateContext = createContext<ReturnType<
    typeof createTrayStateStore<P>
  > | null>(null);
  const ScreenContext = createContext<string | undefined>(undefined);

  function useTray(): TrayNavigation<P> {
    const tray = useContext(Context);
    if (!tray)
      throw new Error('useTray must be used inside its Tray.Provider.');
    return tray;
  }

  function useTrayState<T>(selector: (state: TrayState<P>) => T): T {
    const store = useContext(StateContext);
    if (!store)
      throw new Error('useTrayState must be used inside its Tray.Provider.');
    const getSnapshot = useMemo(() => {
      let snapshot: TrayState<P> | undefined;
      let selected: T;
      return () => {
        const next = store.getSnapshot();
        if (next !== snapshot) {
          selected = selector(next);
          snapshot = next;
        }
        return selected;
      };
    }, [store, selector]);
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  }

  /** Run an effect while this tray screen is current. Memoize it with useCallback. */
  function useFocusEffect(effect: React.EffectCallback): void {
    const key = useContext(ScreenContext);
    if (key === undefined)
      throw new Error(
        'useFocusEffect must be used inside a screen or custom header of its Tray.Provider.'
      );
    const isFocused = useTrayState((state) => state.route?.key === key);
    useEffect(() => {
      if (isFocused) return effect();
    }, [effect, isFocused]);
  }

  function Stack(_props: TrayStackProps<P>): React.ReactElement | null {
    throw new Error('Tray.Stack must be a direct child of its Tray.Provider.');
  }

  function Screen<N extends keyof P & string>(
    _props: TrayScreenDeclarationProps<P, N>
  ): React.ReactElement | null {
    throw new Error('Tray.Screen must be declared inside its Tray.Stack.');
  }

  function Provider({ children }: TrayProviderProps) {
    const declaration = readTrayDeclaration<P>(children, Stack, Screen);
    const [store] = useState(() => createTrayStateStore<P>());
    const state = useSyncExternalStore(
      store.subscribe,
      store.getStackSnapshot,
      store.getStackSnapshot
    );
    const { dispatch } = store;
    const screens = useRef(declaration.screens);
    const onDismiss = useRef(declaration.options.onDismiss);
    for (const entry of [
      ...state.entries,
      ...(state.transition?.retained ?? []),
      ...state.queue,
      ...(state.preparation ? [state.preparation.command] : []),
    ]) {
      if (!('name' in entry)) continue;
      const next = declaration.screens[entry.name];
      if (!next)
        throw new Error(
          `Cannot remove tray screen "${entry.name}" while it is in use. Dismiss the tray first.`
        );
      if (next.component !== screens.current[entry.name]?.component)
        throw new Error(
          `Cannot change the component for tray screen "${entry.name}" while it is in use. Define components outside render.`
        );
    }
    useLayoutEffect(() => {
      screens.current = declaration.screens;
      onDismiss.current = declaration.options.onDismiss;
    });
    const tray = useMemo<TrayNavigation<P>>(() => {
      const destination =
        (type: 'present' | 'push' | 'replace') =>
        (name: string, params?: unknown, options?: TrayNavigationOptions) => {
          if (!Object.prototype.hasOwnProperty.call(screens.current, name))
            throw new Error(`Unknown tray screen: ${name}`);
          Keyboard.dismiss();
          if (options && (!options.groupId || !options.groupId.trim()))
            throw new Error(
              'Tray shared transitions require a non-empty groupId.'
            );
          dispatch({
            type,
            name,
            params,
            ...(type === 'push' && options ? { groupId: options.groupId } : {}),
          });
        };
      return {
        present: destination('present'),
        push: destination('push'),
        replace: destination('replace'),
        back: () => {
          Keyboard.dismiss();
          dispatch({ type: 'back' });
        },
        popToRoot: () => {
          Keyboard.dismiss();
          dispatch({ type: 'popToRoot' });
        },
        dismiss: () => {
          Keyboard.dismiss();
          dispatch({ type: 'dismiss' });
        },
      };
    }, [dispatch]);
    const isPresented = state.phase !== 'closed';

    const notified = useRef(0);
    useEffect(() => {
      if (state.dismissals > notified.current) {
        notified.current = state.dismissals;
        onDismiss.current?.();
      }
    }, [state.dismissals]);

    useEffect(() => {
      if (!isPresented) return;
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        if (Keyboard.isVisible()) Keyboard.dismiss();
        else tray.back();
        return true;
      });
      return () => listener.remove();
    }, [tray, isPresented]);

    return (
      <Context.Provider value={tray}>
        <StateContext.Provider value={store}>
          <ScreenContext.Provider value={undefined}>
            <View
              style={styles.app}
              collapsable={false}
              accessibilityElementsHidden={isPresented}
              importantForAccessibility={
                isPresented ? 'no-hide-descendants' : 'auto'
              }
            >
              {declaration.content}
            </View>
            {isPresented && (
              <ChoreographyOverlay>
                <TrayChoreography key={state.session}>
                  <TrayHost
                    key={state.session}
                    {...declaration.options}
                    screens={declaration.screens}
                    state={state}
                    dispatch={dispatch}
                    tray={tray}
                    screenContext={ScreenContext}
                  />
                </TrayChoreography>
              </ChoreographyOverlay>
            )}
          </ScreenContext.Provider>
        </StateContext.Provider>
      </Context.Provider>
    );
  }

  return { Provider, Stack, Screen, useTray, useTrayState, useFocusEffect };
}

function TrayHost<P extends TrayParamList>({
  state,
  dispatch,
  tray,
  screenContext: ScreenContext,
  screens,
  appearance = 'floating',
  topInset = 0,
  bottomInset = 0,
  horizontalInset = 16,
  backgroundColor = '#ffffff',
  textColor = '#18181b',
  renderHeader: stackRenderHeader,
  handleVisible: stackHandleVisible = true,
  animation,
}: Omit<TrayStackProps<P>, 'children' | 'animation'> & {
  animation: ResolvedTrayAnimation;
  screens: TrayScreenMap<P>;
  state: TrayStackState;
  dispatch: React.Dispatch<TrayAction>;
  tray: TrayNavigation<P>;
  screenContext: React.Context<string | undefined>;
}) {
  const { height, width } = useWindowDimensions();
  const keyboard = useTrayKeyboard();
  const keyboardHeight = keyboard.height;
  const keyboardProgress = keyboard.progress;
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReducedMotion(enabled);
    });
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion
    );
    return () => {
      alive = false;
      motion.remove();
    };
  }, []);
  const active = state.entries[state.entries.length - 1]!;
  const entries = [...state.entries, ...(state.transition?.retained ?? [])];
  const renderHeader = screens[active.name]?.renderHeader ?? stackRenderHeader;
  const headerHeights = useRef(new Map<string, number>());
  const [headerLayout, setHeaderLayout] = useState<{
    key: string;
    custom: boolean;
    height?: number;
  }>({ key: active.key, custom: !!renderHeader });
  // A returning header needs a fresh layout, including after a built-in header.
  if (headerLayout.key !== active.key || headerLayout.custom !== !!renderHeader)
    setHeaderLayout({ key: active.key, custom: !!renderHeader });
  const headerHeightFor = (entry: TrayEntry) => {
    const options = screens[entry.name];
    const custom = options?.renderHeader ?? stackRenderHeader;
    const handle = options?.handleVisible ?? stackHandleVisible;
    return (
      (handle ? HANDLE_HEIGHT : 0) +
      (custom
        ? (headerHeights.current.get(entry.key) ?? DEFAULT_HEADER_HEIGHT)
        : DEFAULT_HEADER_HEIGHT)
    );
  };
  const headerHeight = headerHeightFor(active);
  const title = screens[active.name]?.title ?? active.name;
  const previous = entries.find(
    (entry) => entry.key === state.transition?.from
  );
  const previousTitle = previous
    ? (screens[previous.name]?.title ?? previous.name)
    : title;
  const previousRenderHeader = previous
    ? (screens[previous.name]?.renderHeader ?? stackRenderHeader)
    : undefined;
  const crossfadeHeaders =
    !!previous && !!(renderHeader || previousRenderHeader);
  const headerEntries = crossfadeHeaders ? [previous, active] : [active];
  const canGoBack = state.entries.length > 1;
  const previousDepth = state.transition
    ? entries.length - (state.transition.direction === 1 ? 1 : 0)
    : state.entries.length;
  const previousCanGoBack = previousDepth > 1;
  const fullScreen = screens[active.name]?.presentation === 'fullScreen';
  const availableHeight = Math.max(0, height - keyboard.layoutHeight);
  const safeBottomInset = keyboard.layoutHeight > 0 ? 0 : bottomInset;
  const margin = appearance === 'floating' ? horizontalInset : 0;
  const gap = appearance === 'floating' ? safeBottomInset + 12 : 0;
  const paddingBottom = fullScreen || appearance === 'sheet' ? bottomInset : 0;
  const maxHeightFor = (expanded: boolean, chromeHeight: number) =>
    expanded
      ? Math.max(0, availableHeight - topInset - safeBottomInset - chromeHeight)
      : Math.max(
          80,
          availableHeight -
            topInset -
            gap -
            (appearance === 'sheet' ? safeBottomInset : 0) -
            chromeHeight -
            6
        );
  const maxHeight = maxHeightFor(fullScreen, headerHeight);
  const { screenId, origins } = useTrayGeometry();
  const pageHeights = useRef(new Map<string, number>());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const sharedFromHeight = useSharedValue(0);
  const sharedToHeight = useSharedValue(0);
  const sharedFromExpansion = useSharedValue(0);
  const progress = useSharedValue(state.transition ? 0 : 1);
  const progressTransitionId = useSharedValue<number | undefined>(undefined);
  const expansion = useSharedValue(fullScreen ? 1 : 0);
  const contentHeight = useSharedValue(-1);
  const [hasMeasured, setHasMeasured] = useState(false);
  const measuredHeight = useRef(-1);
  const measuredKeyboardHeight = useRef(keyboard.layoutHeight);
  const destinationHeight = fullScreen
    ? height
    : (pageHeights.current.get(active.key) ?? -headerHeight - paddingBottom) +
      headerHeight +
      paddingBottom;
  const shared = useTraySharedTransition({
    state,
    dispatch,
    animation,
    targetReady:
      pageHeights.current.has(active.key) &&
      (!renderHeader ||
        (headerLayout.key === active.key && headerLayout.height !== undefined)),
    onPrepare: () => {
      sharedFromHeight.value = measuredHeight.current;
      sharedFromExpansion.value = fullScreen ? 1 : 0;
    },
    onFinish: () => {
      measuredHeight.current = destinationHeight;
      contentHeight.value = destinationHeight;
      expansion.value = fullScreen ? 1 : 0;
    },
  });
  const sharedEnabled = shared.enabled;
  const sharedStarted = shared.started;
  const sharedMotionId = shared.motionId;
  const sharedProgress = shared.progress;
  const direction = state.transition?.direction;
  const transitionId = state.transition?.id;
  const timeline = useDerivedValue(() =>
    transitionId === undefined
      ? 1
      : sharedEnabled
        ? sharedMotionId.value === transitionId
          ? Math.max(
              0,
              Math.min(
                1,
                direction === -1
                  ? 1 - sharedProgress.value
                  : sharedProgress.value
              )
            )
          : 0
        : progressTransitionId.value === transitionId
          ? Math.max(0, Math.min(1, progress.value))
          : 0
  );
  const visualExpansion = useDerivedValue(() =>
    sharedEnabled
      ? sharedFromExpansion.value +
        ((fullScreen ? 1 : 0) - sharedFromExpansion.value) * timeline.value
      : expansion.value
  );
  const visualHeight = useDerivedValue(() =>
    sharedEnabled
      ? sharedFromHeight.value +
        (sharedToHeight.value - sharedFromHeight.value) * timeline.value
      : contentHeight.value
  );
  useLayoutEffect(() => {
    if (destinationHeight > 0) sharedToHeight.value = destinationHeight;
  }, [destinationHeight, sharedToHeight, layoutVersion]);
  const wasFullScreen = useRef(fullScreen);
  useLayoutEffect(() => {
    if (sharedEnabled || wasFullScreen.current === fullScreen) return;
    wasFullScreen.current = fullScreen;
    expansion.value = animateTrayValue(fullScreen ? 1 : 0, animation);
  }, [animation, expansion, fullScreen, sharedEnabled]);
  useEffect(() => {
    if (!sharedEnabled && state.transition?.groupId && destinationHeight > 0) {
      contentHeight.value = animateTrayValue(destinationHeight, animation);
    }
  }, [
    sharedEnabled,
    state.transition?.id,
    state.transition?.groupId,
    destinationHeight,
    contentHeight,
    animation,
  ]);
  const sheetPosition = useAnimatedStyle(() => ({
    bottom: keyboardHeight.value,
  }));
  const cardGeometry = useAnimatedStyle(() => {
    const expanded = Math.max(0, Math.min(1, visualExpansion.value));
    const liveBottomInset = bottomInset * (1 - keyboardProgress.value);
    const liveGap = appearance === 'floating' ? liveBottomInset + 12 : 0;
    const liveAvailableHeight = Math.max(0, height - keyboardHeight.value);
    const keyboardCorrection =
      -keyboardHeight.value * expanded -
      (appearance === 'sheet' ? bottomInset * keyboardProgress.value : 0) *
        (1 - expanded);
    return {
      ...(!hasMeasured
        ? {}
        : {
            height: Math.min(
              Math.max(
                headerHeight,
                liveAvailableHeight - (topInset + liveGap + 6) * (1 - expanded)
              ),
              Math.max(headerHeight, visualHeight.value + keyboardCorrection)
            ),
          }),
      marginHorizontal: margin * (1 - expanded),
      marginBottom: liveGap * (1 - expanded),
      borderRadius: 30 * (1 - expanded),
      borderBottomLeftRadius: appearance === 'sheet' ? 0 : 30 * (1 - expanded),
      borderBottomRightRadius: appearance === 'sheet' ? 0 : 30 * (1 - expanded),
    };
  });
  // Move the header without triggering a new content measurement each frame.
  const contentPosition = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.max(0, Math.min(1, visualExpansion.value)) * topInset,
      },
    ],
  }));
  const headerGeometry = useAnimatedStyle(() => ({
    width:
      width -
      2 * margin * (1 - Math.max(0, Math.min(1, visualExpansion.value))),
  }));
  const backVisibility = useAnimatedStyle(() => ({
    opacity:
      Number(previousCanGoBack) +
      (Number(canGoBack) - Number(previousCanGoBack)) * timeline.value,
  }));
  const complete = useCallback(
    (session: number, id: number) => {
      dispatch({ type: 'transitionEnd', session, id });
    },
    [dispatch]
  );
  useEffect(() => {
    if (state.phase === 'open' && !state.transition)
      AccessibilityInfo.announceForAccessibility(title);
  }, [state.phase, state.transition, title]);
  useEffect(() => {
    const retained = new Set(
      [...state.entries, ...(state.transition?.retained ?? [])].map(
        (entry) => entry.key
      )
    );
    for (const key of pageHeights.current.keys()) {
      if (!retained.has(key)) {
        pageHeights.current.delete(key);
        origins.delete(screenId(key));
      }
    }
    for (const key of headerHeights.current.keys()) {
      if (!retained.has(key)) headerHeights.current.delete(key);
    }
  }, [state.entries, state.transition, origins, screenId]);

  return (
    <View
      style={styles.fill}
      pointerEvents="box-none"
      accessibilityViewIsModal
      onAccessibilityEscape={tray.back}
    >
      <Pressable
        style={styles.fill}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tray"
        onPress={tray.dismiss}
      />
      <BottomSheetProvider>
        <ModalBottomSheet
          detents={[...DETENTS]}
          index={state.phase === 'closing' ? 0 : 1}
          style={sheetPosition as ViewStyle}
          wrapNativeView={Animated.createAnimatedComponent}
          extendUnderStatusBar
          animateIn={!reducedMotion}
          animateContentHeight={false}
          scrimColor="#000000"
          scrimOpacities={[0, 0.35]}
          onIndexChange={(index) => {
            Keyboard.dismiss();
            dispatch({ type: 'snapped', session: state.session, index });
          }}
          onSettle={(index) =>
            dispatch({ type: 'settled', session: state.session, index })
          }
        >
          <Animated.View
            style={[styles.card, { backgroundColor }, cardGeometry]}
          >
            {/* A fixed viewport prevents ScrollView from feeding animated heights back into layout. */}
            <Animated.View
              style={[
                styles.centered,
                {
                  width: width - (fullScreen ? 0 : 2 * margin),
                  height: hasMeasured
                    ? maxHeight + headerHeight + paddingBottom
                    : undefined,
                },
                contentPosition,
              ]}
            >
              <View
                style={{ paddingBottom }}
                onLayout={(event) => {
                  const next = fullScreen
                    ? height
                    : event.nativeEvent.layout.height;
                  if (!Number.isFinite(next) || next <= 0) return;
                  const resized =
                    measuredKeyboardHeight.current !== keyboard.layoutHeight &&
                    !state.transition;
                  measuredKeyboardHeight.current = keyboard.layoutHeight;
                  if (Math.abs(next - measuredHeight.current) < 0.5) return;
                  const first = measuredHeight.current < 0;
                  measuredHeight.current = next;
                  if (first) setHasMeasured(true);
                  if (!sharedEnabled)
                    contentHeight.value =
                      first || resized
                        ? next
                        : animateTrayValue(next, animation);
                }}
              >
                <View style={styles.headers}>
                  {headerEntries.map((entry) => {
                    const isActive = entry.key === active.key;
                    const entryRenderHeader =
                      screens[entry.name]?.renderHeader ?? stackRenderHeader;
                    const handleVisible =
                      screens[entry.name]?.handleVisible ?? stackHandleVisible;
                    const entryTitle = screens[entry.name]?.title ?? entry.name;
                    const entryCanGoBack = isActive
                      ? state.entries.length > 1
                      : previousCanGoBack;
                    const changingTitle =
                      !crossfadeHeaders && previousTitle !== entryTitle;
                    const expanded =
                      screens[entry.name]?.presentation === 'fullScreen';
                    return (
                      <TrayHeaderLayer
                        key={entryRenderHeader ? entry.key : 'default'}
                        active={isActive}
                        width={width - (expanded ? 0 : 2 * margin)}
                        progress={timeline}
                        session={state.session}
                        transitionId={
                          crossfadeHeaders ? transitionId : undefined
                        }
                      >
                        {handleVisible && <View style={styles.handle} />}
                        {entryRenderHeader ? (
                          <TrayCustomHeader
                            active={isActive}
                            key={entry.key}
                            onHeight={(next) => {
                              headerHeights.current.set(entry.key, next);
                              setHeaderLayout((current) =>
                                current.key === entry.key &&
                                current.height === next
                                  ? current
                                  : {
                                      key: entry.key,
                                      custom: true,
                                      height: next,
                                    }
                              );
                            }}
                          >
                            <MemoTrayHeaderContent
                              screenContext={ScreenContext}
                              renderHeader={entryRenderHeader}
                              route={entry as TrayRoute<P, keyof P & string>}
                              tray={tray}
                              title={entryTitle}
                              canGoBack={entryCanGoBack}
                              color={textColor}
                            />
                          </TrayCustomHeader>
                        ) : (
                          <Animated.View
                            style={[styles.header, headerGeometry]}
                          >
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Back in tray"
                              disabled={!entryCanGoBack}
                              accessibilityElementsHidden={!entryCanGoBack}
                              importantForAccessibility={
                                entryCanGoBack ? 'auto' : 'no-hide-descendants'
                              }
                              onPress={tray.back}
                              style={styles.headerButton}
                            >
                              <Animated.View
                                pointerEvents="none"
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                                style={
                                  crossfadeHeaders
                                    ? { opacity: Number(entryCanGoBack) }
                                    : backVisibility
                                }
                              >
                                <Text
                                  style={[styles.back, { color: textColor }]}
                                >
                                  ‹
                                </Text>
                              </Animated.View>
                            </Pressable>
                            <View style={styles.titles}>
                              {changingTitle && previous && (
                                <TrayTitle
                                  key={previous.key}
                                  active={false}
                                  color={textColor}
                                  progress={timeline}
                                  transitionId={transitionId}
                                  motionId={
                                    sharedEnabled
                                      ? sharedMotionId
                                      : progressTransitionId
                                  }
                                >
                                  {previousTitle}
                                </TrayTitle>
                              )}
                              <TrayTitle
                                key={entry.key}
                                active
                                color={textColor}
                                progress={timeline}
                                transitionId={
                                  changingTitle ? transitionId : undefined
                                }
                                motionId={
                                  sharedEnabled
                                    ? sharedMotionId
                                    : progressTransitionId
                                }
                              >
                                {entryTitle}
                              </TrayTitle>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Close tray"
                              onPress={tray.dismiss}
                              style={styles.headerButton}
                            >
                              <View
                                pointerEvents="none"
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                              >
                                <Text
                                  style={[styles.close, { color: textColor }]}
                                >
                                  ×
                                </Text>
                              </View>
                            </Pressable>
                          </Animated.View>
                        )}
                      </TrayHeaderLayer>
                    );
                  })}
                </View>
                <View
                  style={{
                    maxHeight,
                    height: fullScreen ? maxHeight : undefined,
                  }}
                >
                  {entries.map((entry) => {
                    const entryFullScreen =
                      screens[entry.name]?.presentation === 'fullScreen';
                    const entryHeaderHeight = headerHeightFor(entry);
                    const Component = screens[entry.name]?.component as
                      | React.ComponentType<TrayScreenProps<P>>
                      | undefined;
                    if (!Component) return null;
                    return (
                      <TrayPage
                        key={entry.key}
                        screenId={screenId(entry.key)}
                        shared={sharedEnabled}
                        sharedStarted={sharedStarted}
                        sharedMotionId={sharedMotionId}
                        direction={state.transition?.direction ?? 1}
                        onPageLayout={(pageHeight) => {
                          const entryPadding =
                            entryFullScreen || appearance === 'sheet'
                              ? safeBottomInset
                              : 0;
                          const cardHeight = entryFullScreen
                            ? availableHeight
                            : pageHeight + entryHeaderHeight + entryPadding;
                          origins.set(screenId(entry.key), {
                            x: entryFullScreen ? 0 : margin,
                            y:
                              availableHeight -
                              cardHeight -
                              (entryFullScreen ? 0 : gap) +
                              (entryFullScreen ? topInset : 0) +
                              entryHeaderHeight,
                          });
                          if (
                            pageHeights.current.get(entry.key) !== pageHeight
                          ) {
                            pageHeights.current.set(entry.key, pageHeight);
                            setLayoutVersion((version) => version + 1);
                          }
                        }}
                        active={entry.key === active.key}
                        from={state.transition?.from === entry.key}
                        transitioning={!!state.transition}
                        progress={sharedEnabled ? sharedProgress : progress}
                        progressTransitionId={progressTransitionId}
                        animation={animation}
                        session={state.session}
                        transitionId={state.transition?.id}
                        onComplete={complete}
                        maxHeight={maxHeightFor(
                          entryFullScreen,
                          entryHeaderHeight
                        )}
                        fullScreen={entryFullScreen}
                        width={width - (entryFullScreen ? 0 : 2 * margin)}
                      >
                        <MemoTrayContent
                          screenContext={ScreenContext}
                          component={Component}
                          route={entry as TrayRoute<P>}
                          tray={tray}
                        />
                      </TrayPage>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        </ModalBottomSheet>
      </BottomSheetProvider>
    </View>
  );
}

function TrayCustomHeader({
  children,
  active,
  onHeight,
}: {
  children: React.ReactNode;
  active: boolean;
  onHeight: (height: number) => void;
}) {
  const current = useRef({ active, onHeight });
  const lastHeight = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    current.current = { active, onHeight };
    // A queued Back can reactivate this same header before it ever unmounts.
    if (active && lastHeight.current !== undefined)
      onHeight(lastHeight.current);
  });
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.height;
        if (!mounted.current || !Number.isFinite(next) || next < 0) return;
        if (current.current.active) {
          lastHeight.current = next;
          current.current.onHeight(next);
        }
      }}
    >
      {children}
    </View>
  );
}

function TrayTitle({
  children,
  active,
  color,
  progress,
  transitionId,
  motionId,
}: {
  children: string;
  active: boolean;
  color: ColorValue;
  progress: SharedValue<number>;
  transitionId: number | undefined;
  motionId: SharedValue<number | undefined>;
}) {
  const style = useAnimatedStyle(() => {
    const p =
      transitionId === undefined
        ? 1
        : motionId.value === transitionId
          ? progress.value
          : 0;
    return { opacity: active ? p : 1 - p };
  });
  return (
    <Animated.Text
      accessible={active}
      accessibilityRole={active ? 'header' : undefined}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      numberOfLines={1}
      style={[styles.title, !active && styles.previousTitle, { color }, style]}
    >
      {children}
    </Animated.Text>
  );
}

function TrayHeaderContent<P extends TrayParamList>({
  screenContext: ScreenContext,
  renderHeader,
  ...props
}: TrayHeaderProps<P> & {
  screenContext: React.Context<string | undefined>;
  renderHeader: (props: TrayHeaderProps<P>) => React.ReactNode;
}) {
  return (
    <ScreenContext.Provider value={props.route.key}>
      {renderHeader(props)}
    </ScreenContext.Provider>
  );
}

const MemoTrayHeaderContent = memo(
  TrayHeaderContent
) as typeof TrayHeaderContent;

function TrayContent<P extends TrayParamList>({
  component: Component,
  screenContext: ScreenContext,
  route,
  tray,
}: TrayScreenProps<P> & {
  component: React.ComponentType<TrayScreenProps<P>>;
  screenContext: React.Context<string | undefined>;
}) {
  return (
    <ScreenContext.Provider value={route.key}>
      <Component route={route} tray={tray} />
    </ScreenContext.Provider>
  );
}

const MemoTrayContent = memo(TrayContent) as typeof TrayContent;

function TrayPage({
  screenId,
  shared,
  sharedStarted,
  sharedMotionId,
  direction,
  onPageLayout,
  active,
  from,
  transitioning,
  progress,
  progressTransitionId,
  animation,
  session,
  transitionId,
  onComplete,
  maxHeight,
  fullScreen,
  width,
  children,
}: {
  screenId: string;
  shared: boolean;
  sharedStarted: boolean;
  sharedMotionId: SharedValue<number | undefined>;
  direction: 1 | -1;
  onPageLayout: (height: number) => void;
  active: boolean;
  from: boolean;
  transitioning: boolean;
  progress: SharedValue<number>;
  progressTransitionId: SharedValue<number | undefined>;
  animation: ResolvedTrayAnimation;
  session: number;
  transitionId: number | undefined;
  onComplete: (session: number, id: number) => void;
  maxHeight: number;
  fullScreen: boolean;
  width: number;
  children: React.ReactNode;
}) {
  const actions = useContext(ChoreographyActionsContext)!;
  const pageRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const lastHeight = useRef<number | undefined>(undefined);
  useEffect(
    () => actions.registerScreenPresentation(screenId, pageRef),
    [actions, screenId]
  );
  useEffect(
    () => () => {
      actions.unregisterScreen(screenId);
    },
    [actions, screenId]
  );
  useLayoutEffect(() => {
    if (lastHeight.current !== undefined) onPageLayout(lastHeight.current);
  }, [active, maxHeight, width, onPageLayout]);
  // Wait for the portal to commit the destination before starting its transition.
  const startedTransition = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (
      shared ||
      !active ||
      transitionId === undefined ||
      startedTransition.current === transitionId
    )
      return;
    startedTransition.current = transitionId;
    progress.value = 0;
    progress.value = animateTrayValue(1, animation, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(onComplete, session, transitionId);
    });
    progressTransitionId.value = transitionId;
  }, [
    shared,
    active,
    animation,
    onComplete,
    progress,
    progressTransitionId,
    session,
    transitionId,
  ]);
  const pageStyle = useAnimatedStyle(() => {
    const p = !transitioning
      ? 1
      : shared
        ? sharedMotionId.value === transitionId
          ? Math.max(
              0,
              Math.min(
                1,
                direction === -1 ? 1 - progress.value : progress.value
              )
            )
          : 0
        : progressTransitionId.value === transitionId
          ? Math.max(0, Math.min(1, progress.value))
          : 0;
    const opacity = Math.min(1, p / CONTENT_FADE_END);
    return {
      opacity: active ? opacity : from ? 1 - opacity : 0,
    };
  });
  const [visibleTransition, setVisibleTransition] = useState<number>();
  const visibilityRequest = useRef<{ session: number; id: number } | undefined>(
    undefined
  );
  visibilityRequest.current =
    shared && active && transitionId !== undefined
      ? { session, id: transitionId }
      : undefined;
  const acknowledgeVisibility = useCallback((owner: number, id: number) => {
    if (
      visibilityRequest.current?.session === owner &&
      visibilityRequest.current.id === id
    )
      setVisibleTransition(id);
  }, []);
  useEffect(
    () => () => {
      visibilityRequest.current = undefined;
    },
    []
  );
  useAnimatedReaction(
    () => (shared && active ? transitionId : undefined),
    (id, previous) => {
      if (id !== undefined && id !== previous)
        scheduleOnRN(acknowledgeVisibility, session, id);
    }
  );
  const preparing = shared && visibleTransition !== transitionId;
  const blocked = !active || preparing || (shared && !sharedStarted);
  const staticOpacity = active && preparing ? 0 : 1;
  return (
    <View
      ref={pageRef}
      collapsable={false}
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        lastHeight.current = height;
        onPageLayout(height);
        actions.setScreenReady(screenId, height > 0);
      }}
      style={[
        styles.centered,
        active ? styles.activePage : styles.inactivePage,
        {
          maxHeight,
          height: fullScreen ? maxHeight : undefined,
          width,
          opacity: staticOpacity,
        },
      ]}
      pointerEvents={blocked ? 'none' : 'auto'}
      accessibilityElementsHidden={blocked}
      importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}
    >
      <Animated.View
        style={[
          { maxHeight, height: fullScreen ? maxHeight : undefined },
          pageStyle,
        ]}
      >
        <ScreenIdContext.Provider value={screenId}>
          <ChoreographyProgressProvider>
            {children}
          </ChoreographyProgressProvider>
        </ScreenIdContext.Provider>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  fill: { ...StyleSheet.absoluteFillObject },
  card: { overflow: 'hidden' },
  centered: { alignSelf: 'center' },
  headers: { zIndex: 1 },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#a1a1aa',
    opacity: 0.5,
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: DEFAULT_HEADER_HEIGHT,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { fontSize: 36, lineHeight: 38 },
  close: { fontSize: 26 },
  titles: { flex: 1, justifyContent: 'center' },
  previousTitle: { position: 'absolute', left: 0, right: 0 },
  title: { textAlign: 'center', fontSize: 16, fontWeight: '600' },
  activePage: { position: 'relative' },
  inactivePage: { position: 'absolute', top: 0 },
});
