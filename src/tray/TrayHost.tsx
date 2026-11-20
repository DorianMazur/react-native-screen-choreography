import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ColorValue, NativeSyntheticEvent, ViewStyle } from 'react-native';
import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import type { PositionChangeEventData } from '@swmansion/react-native-bottom-sheet';
import Animated, {
  SharedTransitionBoundary,
  useAnimatedStyle,
  useDerivedValue,
  useEvent,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTrayKeyboard } from './useTrayKeyboard';
import { useTrayNativeSheet } from './useTrayNativeSheet';
import { TrayHeaderLayer } from './TrayHeaderLayer';
import { animateTrayValue } from './animation';
import type { ResolvedTrayAnimation } from './animation';
import type { TrayAction, TrayEntry, TrayStackState } from './stack';
import { TrayDiagnosticsContext } from './diagnostics';
import { TrayKeyboardContext } from './trayContexts';
import type {
  TrayDescriptor,
  TrayNavigatorOptions,
  TrayHeaderProps,
} from './types';

const DETENTS = [0, 'content'] as const;
const DEFAULT_HEADER_HEIGHT = 56;
const HANDLE_HEIGHT = 14;
const CONTENT_FADE_END = 0.75;
const FULL_SCREEN_SLIDE_DISTANCE = 32;
const SCRIM_OPACITY = 0.35;
// Below one alpha step the backdrop no longer visibly covers the screen.
const CLEAR_BACKDROP_OPACITY = 1 / 255;

export function TrayHost({
  state,
  dispatch,
  goBack,
  NavigationProvider,
  dismiss,
  closeAttempt,
  onBackdropClear,
  screens,
  appearance = 'floating',
  anchor = 'bottom',
  topInset = 0,
  bottomInset = 0,
  horizontalInset = 16,
  keyboardInset = 12,
  backgroundColor = '#ffffff',
  textColor = '#18181b',
  renderHeader: stackRenderHeader,
  renderContentHeader,
  handleVisible: stackHandleVisible = true,
  dismissDisabled = false,
  animation,
  fullScreenTransition = 'fade',
}: Omit<TrayNavigatorOptions, 'animation'> & {
  animation: ResolvedTrayAnimation;
  screens: Record<string, TrayDescriptor>;
  state: TrayStackState;
  dispatch: (action: TrayAction) => boolean;
  NavigationProvider: typeof import('@react-navigation/native').NavigationProvider;
  goBack: () => void;
  dismiss: () => void;
  closeAttempt: number | undefined;
  onBackdropClear: (attempt: number) => void;
}) {
  const { height, width } = useWindowDimensions();
  const DiagnosticObserver = useContext(TrayDiagnosticsContext)?.Observer;
  const keyboard = useTrayKeyboard();
  const nativeSheet = useTrayNativeSheet();
  const hiddenAttempt = useSharedValue(0);
  const remainingSheetHeight = useSharedValue(0);
  const onPositionChange = useEvent<
    NativeSyntheticEvent<PositionChangeEventData>
  >(
    (event) => {
      'worklet';
      if (
        closeAttempt === undefined ||
        event.index * SCRIM_OPACITY >= CLEAR_BACKDROP_OPACITY
      )
        return;
      remainingSheetHeight.value = Math.max(0, event.position);
      if (hiddenAttempt.value !== closeAttempt) {
        hiddenAttempt.value = closeAttempt;
        scheduleOnRN(onBackdropClear, closeAttempt);
      }
    },
    ['onPositionChange'],
    true
  );
  const isBlockedSnap = (index: number) =>
    index === 0 && dismissDisabled && state.phase !== 'closing';
  const keyboardHeight = keyboard.height;
  const backdropTouches = useAnimatedStyle(() => ({
    // Keep the last visible strip of the sheet covered while the rest of
    // the window accepts a new touch. The native spring still owns its end.
    top:
      closeAttempt !== undefined && hiddenAttempt.value === closeAttempt
        ? Math.max(
            0,
            height - keyboardHeight.value - remainingSheetHeight.value
          )
        : 0,
  }));
  const keyboardProgress = keyboard.progress;
  const keyboardState = useMemo(
    () => ({
      height: keyboardHeight,
      progress: keyboardProgress,
      isVisible: keyboard.isVisible,
    }),
    [keyboardHeight, keyboardProgress, keyboard.isVisible]
  );
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
  // The native sheet reports `onSettle` only when its open animation ends.
  // With `animateIn` off it is placed at the open detent without one, so the
  // tray would stay `opening` and reject every push. Settle it here instead.
  useEffect(() => {
    if (reducedMotion && state.phase === 'opening')
      dispatch({ type: 'settled', session: state.session, index: 1 });
  }, [reducedMotion, state.phase, state.session, dispatch]);
  const active = state.entries[state.entries.length - 1]!;
  const entries = [...state.entries, ...(state.transition?.retained ?? [])];
  const renderHeader =
    screens[active.key]?.options?.renderHeader ?? stackRenderHeader;
  const headerHeights = useRef(new Map<string, number>());
  const [headerLayout, setHeaderLayout] = useState<{
    key: string;
    custom: boolean;
    height?: number;
  }>({ key: active.key, custom: !!renderHeader });
  // A returning header needs a fresh layout, including after a built-in header.
  if (headerLayout.key !== active.key || headerLayout.custom !== !!renderHeader)
    setHeaderLayout({ key: active.key, custom: !!renderHeader });
  const contentHeaderHeightFor = (entry: TrayEntry) => {
    const reservedHeight = screens[entry.key]?.options.contentHeaderHeight;
    return renderContentHeader &&
      reservedHeight &&
      Number.isFinite(reservedHeight)
      ? Math.max(0, reservedHeight)
      : 0;
  };
  const headerHeightFor = (entry: TrayEntry) => {
    const options = screens[entry.key]?.options;
    const custom = options?.renderHeader ?? stackRenderHeader;
    const handle =
      !dismissDisabled && (options?.handleVisible ?? stackHandleVisible);
    return (
      contentHeaderHeightFor(entry) +
      (handle ? HANDLE_HEIGHT : 0) +
      (custom
        ? (headerHeights.current.get(entry.key) ??
          options?.headerHeight ??
          DEFAULT_HEADER_HEIGHT)
        : DEFAULT_HEADER_HEIGHT)
    );
  };
  const headerHeight = headerHeightFor(active);
  const title = screens[active.key]?.options?.title ?? active.name;
  const previous = entries.find(
    (entry) => entry.key === state.transition?.from
  );
  const previousTitle = previous
    ? (screens[previous.key]?.options?.title ?? previous.name)
    : title;
  const previousRenderHeader = previous
    ? (screens[previous.key]?.options?.renderHeader ?? stackRenderHeader)
    : undefined;
  const crossfadeHeaders =
    !!previous && !!(renderHeader || previousRenderHeader);
  const headerEntries = crossfadeHeaders ? [previous, active] : [active];
  const canGoBack = state.entries.length > 1;
  const previousDepth = state.transition
    ? entries.length - (state.transition.direction === 1 ? 1 : 0)
    : state.entries.length;
  const previousCanGoBack = previousDepth > 1;
  const fullScreen =
    screens[active.key]?.options?.presentation === 'fullScreen';
  const availableHeight = Math.max(0, height - keyboard.layoutHeight);
  const safeBottomInset = keyboard.layoutHeight > 0 ? 0 : bottomInset;
  const margin = appearance === 'floating' ? horizontalInset : 0;
  const floatingBottomInset = appearance === 'floating' ? bottomInset : 0;
  const keyboardGap = appearance === 'floating' ? keyboardInset : 0;
  // Below a compact card: the bottom inset, or the keyboard gap while typing.
  const compactBottomInset =
    keyboard.layoutHeight > 0 ? keyboardGap : bottomInset;
  const paddingBottom = fullScreen || appearance === 'sheet' ? bottomInset : 0;
  const maxHeightFor = (expanded: boolean, chromeHeight: number) =>
    expanded
      ? Math.max(0, availableHeight - topInset - safeBottomInset - chromeHeight)
      : Math.max(
          80,
          availableHeight - topInset - compactBottomInset - chromeHeight - 6
        );
  const pageHeights = useRef(new Map<string, number>());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const progress = useSharedValue(state.transition ? 0 : 1);
  const progressTransitionId = useSharedValue<number | undefined>(undefined);
  const expansion = useSharedValue(fullScreen ? 1 : 0);
  const contentHeight = useSharedValue(-1);
  const [hasMeasured, setHasMeasured] = useState(false);
  const measuredHeight = useRef(-1);
  const intrinsic = hasMeasured && !state.transition && !fullScreen;
  const destinationHeight = fullScreen
    ? height
    : (pageHeights.current.get(active.key) ?? -headerHeight - paddingBottom) +
      headerHeight +
      paddingBottom;
  const targetReady =
    pageHeights.current.has(active.key) &&
    (!renderHeader ||
      (headerLayout.key === active.key && headerLayout.height !== undefined));
  const slide =
    fullScreenTransition === 'slide' &&
    fullScreen &&
    !!previous &&
    screens[previous.key]?.options?.presentation === 'fullScreen';
  const transitionId = state.transition?.id;
  const timeline = useDerivedValue(() =>
    transitionId === undefined
      ? 1
      : progressTransitionId.value === transitionId
        ? Math.max(0, Math.min(1, progress.value))
        : 0
  );
  useLayoutEffect(() => {
    if (
      !targetReady ||
      !Number.isFinite(destinationHeight) ||
      destinationHeight <= 0
    )
      return;
    // Settlement can precede the height spring's last frame. Keep the next
    // navigation's starting geometry aligned with the intrinsic card.
    if (!state.transition) {
      contentHeight.value = destinationHeight;
      expansion.value = fullScreen ? 1 : 0;
    }
    if (Math.abs(destinationHeight - measuredHeight.current) < 0.5) return;
    const first = measuredHeight.current < 0;
    measuredHeight.current = destinationHeight;
    if (first) setHasMeasured(true);
    contentHeight.value =
      first || !state.transition
        ? destinationHeight
        : animateTrayValue(destinationHeight, animation);
  }, [
    targetReady,
    destinationHeight,
    state.transition,
    animation,
    contentHeight,
    expansion,
    fullScreen,
    layoutVersion,
  ]);
  const toContentHeaderHeight = contentHeaderHeightFor(active);
  const fromContentHeaderHeight = previous
    ? contentHeaderHeightFor(previous)
    : toContentHeaderHeight;
  const liveContentHeaderHeight = useDerivedValue(
    () =>
      fromContentHeaderHeight +
      (toContentHeaderHeight - fromContentHeaderHeight) * timeline.value
  );
  const contentHeaderStyle = useAnimatedStyle(() => ({
    height: liveContentHeaderHeight.value,
  }));
  const wasFullScreen = useRef(fullScreen);
  useLayoutEffect(() => {
    if (wasFullScreen.current === fullScreen) return;
    wasFullScreen.current = fullScreen;
    expansion.value = animateTrayValue(fullScreen ? 1 : 0, animation);
  }, [animation, expansion, fullScreen]);
  const sheetPosition = useAnimatedStyle(() => ({
    bottom: keyboardHeight.value,
  }));
  const keyboardBackground = useAnimatedStyle(() => ({
    height: keyboardHeight.value,
    opacity: Math.max(0, Math.min(1, expansion.value)),
  }));
  const cardHeight = useDerivedValue(() => {
    if (!hasMeasured) return -1;
    const expanded = Math.max(0, Math.min(1, expansion.value));
    const liveGap =
      floatingBottomInset * (1 - keyboardProgress.value) +
      keyboardGap * keyboardProgress.value;
    const liveAvailableHeight = Math.max(0, height - keyboardHeight.value);
    const keyboardCorrection =
      -keyboardHeight.value * expanded -
      (appearance === 'sheet' ? bottomInset * keyboardProgress.value : 0) *
        (1 - expanded);
    return Math.min(
      Math.max(
        headerHeight,
        liveAvailableHeight - (topInset + liveGap + 6) * (1 - expanded)
      ),
      Math.max(headerHeight, contentHeight.value + keyboardCorrection)
    );
  });
  const contentBottom = useDerivedValue(() => {
    const expanded = Math.max(0, Math.min(1, expansion.value));
    return (
      bottomInset *
      (1 - keyboardProgress.value) *
      (appearance === 'sheet' ? 1 : expanded)
    );
  });
  const contentTop = useDerivedValue(
    () =>
      headerHeight -
      toContentHeaderHeight +
      liveContentHeaderHeight.value +
      Math.max(0, Math.min(1, expansion.value)) * topInset
  );
  // Full-screen endpoints keep their own size during tray navigation, but
  // their viewport must follow keyboard frames alongside the outer card.
  const viewportSpace = useDerivedValue(
    () =>
      height -
      keyboardHeight.value -
      topInset -
      bottomInset * (1 - keyboardProgress.value)
  );
  const compactSpace = useDerivedValue(
    () => viewportSpace.value - keyboardGap * keyboardProgress.value - 6
  );
  const cardGeometry = useAnimatedStyle(() => {
    const expanded = Math.max(0, Math.min(1, expansion.value));
    const liveGap =
      floatingBottomInset * (1 - keyboardProgress.value) +
      keyboardGap * keyboardProgress.value;
    return {
      // A settled compact page owns its height through Yoga. Reflecting its
      // animated layout through onLayout and another spring clips the growing
      // content while the card trails behind (especially on keyboard close).
      height: intrinsic || cardHeight.value < 0 ? 'auto' : cardHeight.value,
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
        translateY: Math.max(0, Math.min(1, expansion.value)) * topInset,
      },
    ],
  }));
  const headerGeometry = useAnimatedStyle(() => ({
    width: width - 2 * margin * (1 - Math.max(0, Math.min(1, expansion.value))),
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
      }
    }
    for (const key of headerHeights.current.keys()) {
      if (!retained.has(key)) headerHeights.current.delete(key);
    }
  }, [state.entries, state.transition]);

  return (
    <TrayKeyboardContext.Provider value={keyboardState}>
      <View
        style={styles.fill}
        pointerEvents="box-none"
        accessibilityViewIsModal
        onAccessibilityEscape={() => {
          if (canGoBack || !dismissDisabled) goBack();
        }}
      >
        <Animated.View
          collapsable={false}
          pointerEvents="box-none"
          style={[styles.fill, backdropTouches]}
        >
          <Pressable
            style={styles.fill}
            accessibilityRole="button"
            accessibilityLabel="Dismiss tray"
            disabled={dismissDisabled}
            accessibilityState={{ disabled: dismissDisabled }}
            onPress={dismiss}
          />
        </Animated.View>
        <BottomSheetProvider>
          <ModalBottomSheet
            detents={
              dismissDisabled
                ? [{ value: 0, programmatic: true }, 'content']
                : [...DETENTS]
            }
            index={state.phase === 'closing' ? 0 : 1}
            style={sheetPosition as ViewStyle}
            wrapNativeView={nativeSheet.wrapNativeView}
            topInset={0}
            animateIn={!reducedMotion}
            animateContentHeight={false}
            scrimColor={`rgba(0, 0, 0, ${SCRIM_OPACITY})`}
            scrimAccessibilityLabel="Dismiss tray"
            onPositionChange={
              closeAttempt === undefined ? undefined : onPositionChange
            }
            onIndexChange={(index) => {
              if (isBlockedSnap(index)) {
                nativeSheet.reopen();
                return;
              }
              Keyboard.dismiss();
              const accepted = dispatch({
                type: 'snapped',
                session: state.session,
                index,
              });
              if (!accepted && index === 0) nativeSheet.reopen();
            }}
            onSettle={(index) => {
              if (isBlockedSnap(index)) {
                nativeSheet.reopen();
                return;
              }
              dispatch({ type: 'settled', session: state.session, index });
            }}
          >
            <Animated.View
              style={[styles.card, { backgroundColor }, cardGeometry]}
            >
              {DiagnosticObserver && (
                <DiagnosticObserver state={state} progress={timeline} />
              )}
              <Animated.View
                style={[styles.headers, { backgroundColor }, contentPosition]}
              >
                {headerEntries.map((entry) => {
                  const isActive = entry.key === active.key;
                  const entryRenderHeader =
                    screens[entry.key]?.options?.renderHeader ??
                    stackRenderHeader;
                  const handleVisible =
                    !dismissDisabled &&
                    (screens[entry.key]?.options?.handleVisible ??
                      stackHandleVisible);
                  const entryTitle =
                    screens[entry.key]?.options?.title ?? entry.name;
                  const entryCanGoBack = isActive
                    ? state.entries.length > 1
                    : previousCanGoBack;
                  const changingTitle =
                    !crossfadeHeaders && previousTitle !== entryTitle;
                  const expanded =
                    screens[entry.key]?.options?.presentation === 'fullScreen';
                  return (
                    <TrayHeaderLayer
                      key={entryRenderHeader ? entry.key : 'default'}
                      active={isActive}
                      width={width - (expanded ? 0 : 2 * margin)}
                      progress={timeline}
                      session={state.session}
                      transitionId={crossfadeHeaders ? transitionId : undefined}
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
                          <NavigationProvider
                            route={screens[entry.key]!.route}
                            navigation={screens[entry.key]!.navigation}
                          >
                            <MemoTrayHeaderContent
                              navigation={screens[entry.key]!.navigation}
                              dismiss={dismiss}
                              renderHeader={entryRenderHeader}
                              route={screens[entry.key]!.route}
                              title={entryTitle}
                              canGoBack={entryCanGoBack}
                              dismissDisabled={dismissDisabled}
                              color={textColor}
                            />
                          </NavigationProvider>
                        </TrayCustomHeader>
                      ) : (
                        <Animated.View style={[styles.header, headerGeometry]}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Back in tray"
                            disabled={!entryCanGoBack}
                            accessibilityElementsHidden={!entryCanGoBack}
                            importantForAccessibility={
                              entryCanGoBack ? 'auto' : 'no-hide-descendants'
                            }
                            onPress={goBack}
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
                              <Text style={[styles.back, { color: textColor }]}>
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
                                motionId={progressTransitionId}
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
                              motionId={progressTransitionId}
                            >
                              {entryTitle}
                            </TrayTitle>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Close tray"
                            disabled={dismissDisabled}
                            accessibilityState={{ disabled: dismissDisabled }}
                            onPress={dismiss}
                            style={[
                              styles.headerButton,
                              dismissDisabled && styles.disabledButton,
                            ]}
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
                {renderContentHeader &&
                  (fromContentHeaderHeight > 0 ||
                    toContentHeaderHeight > 0) && (
                    <Animated.View
                      style={[styles.contentHeader, contentHeaderStyle]}
                    >
                      {renderContentHeader({
                        from: previous?.name ?? active.name,
                        to: active.name,
                        progress: timeline,
                      })}
                    </Animated.View>
                  )}
              </Animated.View>
              {entries.map((entry) => {
                const entryFullScreen =
                  screens[entry.key]?.options?.presentation === 'fullScreen';
                const entryHeaderHeight = headerHeightFor(entry);
                const descriptor = screens[entry.key];
                if (!descriptor) return null;
                return (
                  <TrayPage
                    key={entry.key}
                    direction={state.transition?.direction ?? 1}
                    slide={slide}
                    onPageLayout={(pageHeight) => {
                      if (pageHeights.current.get(entry.key) !== pageHeight) {
                        pageHeights.current.set(entry.key, pageHeight);
                        setLayoutVersion((version) => version + 1);
                      }
                    }}
                    active={entry.key === active.key}
                    from={state.transition?.from === entry.key}
                    transitioning={!!state.transition}
                    progress={progress}
                    progressTransitionId={progressTransitionId}
                    animation={animation}
                    session={state.session}
                    transitionId={state.transition?.id}
                    onComplete={complete}
                    maxHeight={maxHeightFor(entryFullScreen, entryHeaderHeight)}
                    fullScreen={entryFullScreen}
                    intrinsic={intrinsic && entry.key === active.key}
                    viewportSpace={viewportSpace}
                    compactSpace={compactSpace}
                    headerHeight={entryHeaderHeight}
                    anchor={screens[entry.key]?.options?.anchor ?? anchor}
                    contentTop={contentTop}
                    contentBottom={contentBottom}
                    width={width - (entryFullScreen ? 0 : 2 * margin)}
                  >
                    {descriptor.render()}
                  </TrayPage>
                );
              })}
            </Animated.View>
          </ModalBottomSheet>
        </BottomSheetProvider>
        {/* Keep the full-screen surface behind translucent keyboards without
          adding the covered area to the sheet's content detent. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.keyboardBackground,
            { backgroundColor },
            keyboardBackground,
          ]}
        />
      </View>
    </TrayKeyboardContext.Provider>
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

const MemoTrayHeaderContent = memo(function TrayHeaderContent({
  renderHeader,
  ...props
}: TrayHeaderProps & {
  renderHeader: (props: TrayHeaderProps) => React.ReactNode;
}) {
  return <>{renderHeader(props)}</>;
});

function TrayPage({
  direction,
  slide,
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
  intrinsic,
  viewportSpace,
  compactSpace,
  headerHeight,
  anchor,
  contentTop,
  contentBottom,
  width,
  children,
}: {
  direction: 1 | -1;
  /** Move sideways with the crossfade, from the leading page to the trailing one. */
  slide: boolean;
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
  intrinsic: boolean;
  viewportSpace: SharedValue<number>;
  compactSpace: SharedValue<number>;
  headerHeight: number;
  anchor: 'top' | 'bottom';
  contentTop: SharedValue<number>;
  contentBottom: SharedValue<number>;
  width: number;
  children: React.ReactNode;
}) {
  const lastHeight = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (lastHeight.current === undefined) return;
    if (fullScreen) lastHeight.current = maxHeight;
    onPageLayout(lastHeight.current);
  }, [active, fullScreen, maxHeight, width, onPageLayout]);
  // Start after the incoming route has committed.
  const startedTransition = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (
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
      : progressTransitionId.value === transitionId
        ? Math.max(0, Math.min(1, progress.value))
        : 0;
    const opacity = Math.min(1, p / CONTENT_FADE_END);
    const offset = slide ? FULL_SCREEN_SLIDE_DISTANCE * direction : 0;
    return {
      opacity: active ? opacity : from ? 1 - opacity : 0,
      transform: [
        { translateX: active ? offset * (1 - p) : from ? -offset * p : 0 },
      ],
    };
  });
  const viewportSize = useAnimatedStyle(() =>
    intrinsic
      ? {
          position: 'relative',
          justifyContent: anchor === 'bottom' ? 'flex-end' : 'flex-start',
          top: undefined,
          bottom: undefined,
          height: 'auto',
          paddingTop: contentTop.value,
          paddingBottom: contentBottom.value,
        }
      : {
          position: 'absolute',
          justifyContent: anchor === 'bottom' ? 'flex-end' : 'flex-start',
          top: anchor === 'top' ? 0 : undefined,
          bottom: anchor === 'bottom' ? 0 : undefined,
          height: fullScreen
            ? Math.max(0, viewportSpace.value - headerHeight)
            : maxHeight,
          paddingTop: 0,
          paddingBottom: 0,
        }
  );
  const contentSize = useAnimatedStyle(() =>
    fullScreen
      ? { height: '100%' }
      : {
          maxHeight: intrinsic
            ? Math.max(80, compactSpace.value - headerHeight)
            : maxHeight,
        }
  );
  // Yoga sizes full-screen descendants from this viewport in the same commit
  // as the keyboard-driven card resize, including bottom-anchored pages.
  const anchorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: intrinsic
          ? 0
          : anchor === 'bottom'
            ? -contentBottom.value
            : contentTop.value,
      },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.centered,
        // Layout-mode changes must travel with the animated card height. A
        // React commit that makes this absolute while the UI still has an
        // intrinsic card height would collapse the entire sheet for a frame.
        { width },
        viewportSize,
        anchorStyle,
      ]}
      pointerEvents={!active ? 'none' : 'box-none'}
    >
      <View
        collapsable={false}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          if (!Number.isFinite(height) || height < 0) return;
          // Full-screen sizing is already known. Intermediate keyboard layouts
          // must not feed per-frame heights back into the React stack state.
          const pageHeight = fullScreen ? maxHeight : height;
          lastHeight.current = pageHeight;
          onPageLayout(pageHeight);
        }}
        style={[
          styles.centered,
          styles.pageContent,
          {
            ...(fullScreen ? { height: '100%' } : {}),
            width,
          },
        ]}
        pointerEvents={!active ? 'none' : 'auto'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={!active ? 'no-hide-descendants' : 'auto'}
      >
        <Animated.View style={[contentSize, pageStyle]}>
          <SharedTransitionBoundary isActive={active}>
            {children}
          </SharedTransitionBoundary>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  card: { overflow: 'hidden' },
  centered: { alignSelf: 'center' },
  contentHeader: { overflow: 'hidden' },
  headers: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
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
  disabledButton: { opacity: 0.4 },
  back: { fontSize: 36, lineHeight: 38 },
  close: { fontSize: 26 },
  titles: { flex: 1, justifyContent: 'center' },
  previousTitle: { position: 'absolute', left: 0, right: 0 },
  title: { textAlign: 'center', fontSize: 16, fontWeight: '600' },
  pageContent: { position: 'relative' },
  keyboardBackground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
