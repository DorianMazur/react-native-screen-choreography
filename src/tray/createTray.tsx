import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyOverlay } from '../components/ChoreographyOverlay';
import { readTrayDeclaration } from './declarations';
import { animateTrayValue } from './animation';
import type { ResolvedTrayAnimation } from './animation';
import type { TrayScreenMap } from './declarations';
import { initialTrayState, trayReducer } from './stack';
import type { TrayAction, TrayStackState } from './stack';
import type {
  TrayNavigation,
  TrayParamList,
  TrayProviderProps,
  TrayRoute,
  TrayScreenDeclarationProps,
  TrayScreenProps,
  TrayStackProps,
} from './types';

const DETENTS = [0, 'content'] as const;
const HEADER_HEIGHT = 70;

/** Call outside render to preserve the provider and screen identities. */
export function createTray<P extends TrayParamList>() {
  const Context = createContext<TrayNavigation<P> | null>(null);

  function useTray(): TrayNavigation<P> {
    const tray = useContext(Context);
    if (!tray)
      throw new Error('useTray must be used inside its Tray.Provider.');
    return tray;
  }

  function Stack(_props: TrayStackProps): React.ReactElement | null {
    throw new Error('Tray.Stack must be a direct child of its Tray.Provider.');
  }

  function Screen<N extends keyof P & string>(
    _props: TrayScreenDeclarationProps<P, N>
  ): React.ReactElement | null {
    throw new Error('Tray.Screen must be declared inside its Tray.Stack.');
  }

  function Provider({ children }: TrayProviderProps) {
    const declaration = readTrayDeclaration<P>(children, Stack, Screen);
    const [state, dispatch] = useReducer(trayReducer, initialTrayState);
    const screens = useRef(declaration.screens);
    const onDismiss = useRef(declaration.options.onDismiss);
    for (const entry of [
      ...state.entries,
      ...(state.transition?.retained ?? []),
      ...state.queue,
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
    const commands = useMemo(() => {
      const destination =
        (type: 'present' | 'push' | 'replace') =>
        (name: string, params?: unknown) => {
          if (!Object.prototype.hasOwnProperty.call(screens.current, name))
            throw new Error(`Unknown tray screen: ${name}`);
          Keyboard.dismiss();
          dispatch({ type, name, params });
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
    }, []);
    const tray = useMemo<TrayNavigation<P>>(
      () => ({
        ...commands,
        route: state.entries[state.entries.length - 1] as
          | TrayRoute<P>
          | undefined,
        depth: state.entries.length,
        isPresented: state.phase !== 'closed',
      }),
      [commands, state.entries, state.phase]
    );

    const notified = useRef(0);
    useEffect(() => {
      if (state.dismissals > notified.current) {
        notified.current = state.dismissals;
        onDismiss.current?.();
      }
    }, [state.dismissals]);

    useEffect(() => {
      if (!tray.isPresented) return;
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        if (Keyboard.isVisible()) Keyboard.dismiss();
        else commands.back();
        return true;
      });
      return () => listener.remove();
    }, [commands, tray.isPresented]);

    return (
      <Context.Provider value={tray}>
        <View
          style={styles.app}
          collapsable={false}
          accessibilityElementsHidden={tray.isPresented}
          importantForAccessibility={
            tray.isPresented ? 'no-hide-descendants' : 'auto'
          }
        >
          {declaration.content}
        </View>
        {tray.isPresented && (
          <ChoreographyOverlay>
            <TrayHost
              key={state.session}
              {...declaration.options}
              screens={declaration.screens}
              state={state}
              dispatch={dispatch}
              tray={tray}
            />
          </ChoreographyOverlay>
        )}
      </Context.Provider>
    );
  }

  return { Provider, Stack, Screen, useTray };
}

function TrayHost<P extends TrayParamList>({
  state,
  dispatch,
  tray,
  screens,
  appearance = 'floating',
  topInset = 0,
  bottomInset = 0,
  horizontalInset = 16,
  backgroundColor = '#ffffff',
  textColor = '#18181b',
  renderBackIcon,
  renderCloseIcon,
  animation,
}: Omit<TrayStackProps, 'children' | 'animation'> & {
  animation: ResolvedTrayAnimation;
  screens: TrayScreenMap<P>;
  state: TrayStackState;
  dispatch: React.Dispatch<TrayAction>;
  tray: TrayNavigation<P>;
}) {
  const { height, width } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(
    Keyboard.metrics()?.height ?? 0
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
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(
          Math.max(
            0,
            Dimensions.get('screen').height - event.endCoordinates.screenY
          )
        );
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      alive = false;
      motion.remove();
      show.remove();
      hide.remove();
    };
  }, []);
  // Android's resized window already accounts for some or all of the keyboard.
  const keyboardInset = Math.max(
    0,
    keyboardHeight - (Dimensions.get('screen').height - height)
  );
  const active = state.entries[state.entries.length - 1]!;
  const title = screens[active.name]?.title ?? active.name;
  const fullScreen = screens[active.name]?.presentation === 'fullScreen';
  const availableHeight = Math.max(0, height - keyboardInset);
  const margin = appearance === 'floating' ? horizontalInset : 0;
  const gap = appearance === 'floating' ? bottomInset + 12 : 0;
  const paddingTop = fullScreen ? topInset : 0;
  const paddingBottom = fullScreen || appearance === 'sheet' ? bottomInset : 0;
  const fullScreenMaxHeight = Math.max(
    0,
    availableHeight - topInset - bottomInset - HEADER_HEIGHT
  );
  const trayMaxHeight = Math.max(
    80,
    availableHeight -
      topInset -
      gap -
      (appearance === 'sheet' ? bottomInset : 0) -
      76
  );
  const maxHeight = fullScreen ? fullScreenMaxHeight : trayMaxHeight;
  const progress = useSharedValue(state.transition ? 0 : 1);
  const expansion = useSharedValue(fullScreen ? 1 : 0);
  const wasFullScreen = useRef(fullScreen);
  useLayoutEffect(() => {
    if (wasFullScreen.current === fullScreen) return;
    wasFullScreen.current = fullScreen;
    expansion.value = animateTrayValue(fullScreen ? 1 : 0, animation);
  }, [animation, expansion, fullScreen]);
  const contentHeight = useSharedValue(-1);
  const [hasMeasured, setHasMeasured] = useState(false);
  const measuredHeight = useRef(-1);
  const cardGeometry = useAnimatedStyle(() => {
    const expanded = Math.max(0, Math.min(1, expansion.value));
    return {
      ...(!hasMeasured
        ? {}
        : {
            height: Math.min(
              availableHeight,
              Math.max(HEADER_HEIGHT, contentHeight.value)
            ),
          }),
      marginHorizontal: margin * (1 - expanded),
      marginBottom: gap * (1 - expanded),
      borderRadius: 30 * (1 - expanded),
      borderBottomLeftRadius: appearance === 'sheet' ? 0 : 30 * (1 - expanded),
      borderBottomRightRadius: appearance === 'sheet' ? 0 : 30 * (1 - expanded),
    };
  });
  // Move the header without triggering a new content measurement each frame.
  const contentPosition = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          Math.max(0, Math.min(1, expansion.value)) * topInset - paddingTop,
      },
    ],
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
  const entries = [...state.entries, ...(state.transition?.retained ?? [])];

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
          style={{ bottom: keyboardInset }}
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
                    ? maxHeight + HEADER_HEIGHT + paddingTop + paddingBottom
                    : undefined,
                },
                contentPosition,
              ]}
            >
              <View
                style={{ paddingTop, paddingBottom }}
                onLayout={(event) => {
                  const next = fullScreen
                    ? availableHeight
                    : event.nativeEvent.layout.height;
                  if (!Number.isFinite(next) || next <= 0) return;
                  if (Math.abs(next - measuredHeight.current) < 0.5) return;
                  const first = measuredHeight.current < 0;
                  measuredHeight.current = next;
                  if (first) setHasMeasured(true);
                  contentHeight.value = first
                    ? next
                    : animateTrayValue(next, animation);
                }}
              >
                <View style={styles.handle} />
                <View style={styles.header}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back in tray"
                    disabled={state.entries.length < 2}
                    accessibilityElementsHidden={state.entries.length < 2}
                    importantForAccessibility={
                      state.entries.length < 2 ? 'no-hide-descendants' : 'auto'
                    }
                    onPress={tray.back}
                    style={[
                      styles.headerButton,
                      state.entries.length < 2 && styles.invisible,
                    ]}
                  >
                    <View
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      {renderBackIcon ? (
                        renderBackIcon({ color: textColor, size: 24 })
                      ) : (
                        <Text style={[styles.back, { color: textColor }]}>
                          ‹
                        </Text>
                      )}
                    </View>
                  </Pressable>
                  <Text
                    accessibilityRole="header"
                    numberOfLines={1}
                    style={[styles.title, { color: textColor }]}
                  >
                    {title}
                  </Text>
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
                      {renderCloseIcon ? (
                        renderCloseIcon({ color: textColor, size: 24 })
                      ) : (
                        <Text style={[styles.close, { color: textColor }]}>
                          ×
                        </Text>
                      )}
                    </View>
                  </Pressable>
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
                    const Component = screens[entry.name]?.component as
                      | React.ComponentType<TrayScreenProps<P>>
                      | undefined;
                    if (!Component) return null;
                    return (
                      <TrayPage
                        key={entry.key}
                        active={entry.key === active.key}
                        from={state.transition?.from === entry.key}
                        transitioning={!!state.transition}
                        progress={progress}
                        animation={animation}
                        session={state.session}
                        transitionId={state.transition?.id}
                        onComplete={complete}
                        maxHeight={
                          entryFullScreen ? fullScreenMaxHeight : trayMaxHeight
                        }
                        fullScreen={entryFullScreen}
                        width={width - (entryFullScreen ? 0 : 2 * margin)}
                      >
                        <Component route={entry as TrayRoute<P>} tray={tray} />
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

function TrayPage({
  active,
  from,
  transitioning,
  progress,
  animation,
  session,
  transitionId,
  onComplete,
  maxHeight,
  fullScreen,
  width,
  children,
}: {
  active: boolean;
  from: boolean;
  transitioning: boolean;
  progress: SharedValue<number>;
  animation: ResolvedTrayAnimation;
  session: number;
  transitionId: number | undefined;
  onComplete: (session: number, id: number) => void;
  maxHeight: number;
  fullScreen: boolean;
  width: number;
  children: React.ReactNode;
}) {
  // Wait for the portal to commit the destination before starting its transition.
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
  }, [active, animation, onComplete, progress, session, transitionId]);
  const pageStyle = useAnimatedStyle(() => {
    const p = transitioning ? Math.max(0, Math.min(1, progress.value)) : 1;
    return {
      opacity: active ? p : from ? 1 - p : 0,
    };
  });
  return (
    <Animated.View
      style={[
        styles.centered,
        active ? styles.activePage : styles.inactivePage,
        {
          maxHeight,
          height: fullScreen ? maxHeight : undefined,
          width,
        },
        pageStyle,
      ]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  fill: { ...StyleSheet.absoluteFillObject },
  card: { overflow: 'hidden' },
  centered: { alignSelf: 'center' },
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 56,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invisible: { opacity: 0 },
  back: { fontSize: 36, lineHeight: 38 },
  close: { fontSize: 26 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  activePage: { position: 'relative' },
  inactivePage: { position: 'absolute', top: 0 },
});
