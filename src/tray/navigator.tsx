import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { BackHandler, Keyboard, StyleSheet, View } from 'react-native';
import type * as ReactNavigation from '@react-navigation/native';
import type {
  NavigationAction,
  ParamListBase,
  StackActionHelpers,
  StackNavigationState,
  StackRouterOptions,
  TypedNavigator,
} from '@react-navigation/native';
import { useStableCallback } from '../hooks/useStableCallback';
import { resolveTrayAnimation } from './animation';
import { TrayHost } from './TrayHost';
import { TrayDiagnosticsContext } from './diagnostics';
import { createTrayStateStore } from './state';
import { describeRouteChange, type TrayAction, type TrayEntry } from './stack';
import { TrayDismissContext, TraySettledContext } from './trayContexts';
import { TrayRetentionContext } from './trayStackLayout';
import type {
  TrayDescriptor,
  TrayNavigationProp,
  TrayNavigatorProps,
  TrayScreenOptions,
} from './types';

type NavigationAPI = Pick<
  typeof ReactNavigation,
  | 'createNavigatorFactory'
  | 'StackRouter'
  | 'useNavigationBuilder'
  | 'useNavigation'
  | 'useRoute'
  | 'useIsFocused'
  | 'usePreventRemove'
  | 'NavigationProvider'
>;

export function makeTrayIntegration(api: NavigationAPI) {
  function TrayNavigator({
    children,
    id,
    initialRouteName,
    screenOptions,
    screenListeners,
    screenLayout,
    layout,
    UNSTABLE_router,
    UNSTABLE_routeNamesChangeBehavior,
    ...options
  }: TrayNavigatorProps) {
    const parent = api.useNavigation();
    const focused = api.useIsFocused();
    const parentRoute = api.useRoute();
    const [store] = useState(createTrayStateStore);
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const diagnostics = useContext(TrayDiagnosticsContext);
    const send = useStableCallback((action: TrayAction) =>
      store.dispatch(action, diagnostics?.dispatch)
    );
    const pendingRemoval = useRef<NavigationAction | undefined>(undefined);
    const dismissed = useRef(false);
    const retain = useContext(TrayRetentionContext);
    const release = useRef<(() => void) | undefined>(undefined);
    const closeAttempt = useRef(0);
    api.usePreventRemove(focused && !dismissed.current, ({ data }) => {
      if (dismissed.current) {
        parent.dispatch(data.action);
        return;
      }
      Keyboard.dismiss();
      if (store.getSnapshot().phase !== 'closing') closeAttempt.current++;
      pendingRemoval.current = data.action;
      send({ type: 'dismiss' });
    });
    const dismiss = useStableCallback(() => {
      if (pendingRemoval.current || dismissed.current || !parent.isFocused())
        return;
      parent.dispatch({
        type: 'GO_BACK',
        source: parentRoute.key,
        target: parent.getState()?.key,
      });
    });

    const {
      state: stack,
      descriptors,
      navigation,
      NavigationContent,
    } = api.useNavigationBuilder<
      StackNavigationState<ParamListBase>,
      StackRouterOptions,
      StackActionHelpers<ParamListBase>,
      TrayScreenOptions,
      {}
    >(api.StackRouter, {
      children,
      id,
      initialRouteName,
      screenOptions,
      screenListeners,
      screenLayout,
      layout,
      UNSTABLE_routeNamesChangeBehavior,
      UNSTABLE_router: (base) => {
        const router = { ...base, ...UNSTABLE_router?.(base) };
        return {
          ...router,
          getStateForAction(current, action, config) {
            const name = (action.payload as { name?: string } | undefined)
              ?.name;
            if (
              action.type === 'PUSH' &&
              name &&
              current.routeNames.includes(name)
            ) {
              const sheet = store.getSnapshot();
              const owner = current.routes[current.index]?.key;
              if (
                sheet.phase !== 'open' ||
                sheet.queue.length ||
                (action.source && action.source !== owner) ||
                (sheet.transition &&
                  (action.source !== sheet.transition.to ||
                    action.source !== owner))
              )
                return current;
            }
            return router.getStateForAction(current, action, config);
          },
        };
      },
    });
    const routes = useMemo(
      () => stack.routes.slice(0, stack.index + 1),
      [stack.routes, stack.index]
    );
    const lastRoutes = useRef<TrayEntry[]>([]);
    useLayoutEffect(() => {
      const previous = lastRoutes.current;
      if (
        previous.length === routes.length &&
        routes.every(
          (r, i) =>
            r.key === previous[i]?.key && r.params === previous[i]?.params
        )
      )
        return;
      const command = describeRouteChange(previous, routes);
      lastRoutes.current = command.entries;
      if (command.type !== 'present' && command.type !== 'update')
        Keyboard.dismiss();
      send(command);
    }, [routes, send]);
    const goBack = useStableCallback(() => navigation.goBack());

    useEffect(() => {
      if (!focused) return;
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        if (Keyboard.isVisible()) Keyboard.dismiss();
        else if (!options.dismissDisabled || navigation.getState().index > 0)
          navigation.goBack();
        return true;
      });
      return () => listener.remove();
    }, [focused, navigation, options.dismissDisabled]);

    const resumeRemoval = useStableCallback(() => {
      const removal = pendingRemoval.current;
      if (!removal) return;
      pendingRemoval.current = undefined;
      dismissed.current = true;
      parent.dispatch(removal);
    });
    const onBackdropClear = useStableCallback((attempt: number) => {
      if (
        !retain ||
        attempt !== closeAttempt.current ||
        !pendingRemoval.current ||
        store.getSnapshot().phase !== 'closing'
      )
        return;
      release.current = retain(parentRoute.key);
      if (release.current) resumeRemoval();
    });
    const dispatch = useStableCallback((action: TrayAction) => {
      const settledClosed = action.type === 'settled' && action.index === 0;
      if ('session' in action) {
        if (action.session !== store.getSnapshot().session) return false;
        // After focus returns, only the closing spring's settlement is pending.
        // A repeated native snap must not command the departing sheet to reopen.
        if (dismissed.current && !(settledClosed && release.current))
          return action.type === 'snapped';
      }
      if (action.type === 'snapped' && action.index === 0) {
        // Let child and parent removal guards see the gesture before committing the close.
        dismiss();
        if (!pendingRemoval.current) return false;
      }
      if (
        action.type === 'snapped' &&
        action.index === 1 &&
        store.getSnapshot().phase === 'closing'
      )
        pendingRemoval.current = undefined;
      send(action);
      if (settledClosed && store.getSnapshot().phase === 'closed') {
        // Reduce Motion and immediate closes may settle without a position event.
        resumeRemoval();
        release.current?.();
        release.current = undefined;
      }
      return true;
    });

    // A popped descriptor owns the original live subtree until its animation finishes.
    const retained = useRef<Record<string, TrayDescriptor>>({});
    const screens = { ...retained.current, ...descriptors };
    useLayoutEffect(() => {
      const keep: Record<string, TrayDescriptor> = {};
      for (const route of [
        ...routes,
        ...state.entries,
        ...(state.transition?.retained ?? []),
      ]) {
        const descriptor = screens[route.key];
        if (descriptor) keep[route.key] = descriptor;
      }
      retained.current = keep;
    });
    const deliverEvents = useStableCallback(() => {
      for (const event of store.takeEvents()) {
        if (event.type === 'onDismiss') {
          options.onDismiss?.();
        } else {
          const screen = screens[event.key];
          if (screen)
            options[event.type]?.({
              route: screen.route,
              options: {
                ...screen.options,
                title: screen.options.title ?? screen.route.name,
                presentation: screen.options.presentation ?? 'tray',
              },
            });
        }
      }
    });
    useEffect(() => {
      if (state === store.getSnapshot()) deliverEvents();
    }, [state, store, deliverEvents]);
    useEffect(
      () => () => {
        // A settled removal may unmount this navigator in the same commit.
        if (dismissed.current) deliverEvents();
      },
      [deliverEvents]
    );
    const settled =
      focused &&
      state.nativeSettled &&
      state.phase === 'open' &&
      !state.transition &&
      !state.queue.length;
    return (
      <NavigationContent>
        <TrayDismissContext.Provider value={dismiss}>
          <TraySettledContext.Provider
            value={settled ? state.entries.at(-1)?.key : undefined}
          >
            {state.phase !== 'closed' && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  !focused && !release.current && styles.hidden,
                ]}
                pointerEvents="box-none"
              >
                <TrayHost
                  {...options}
                  animation={resolveTrayAnimation(options.animation)}
                  screens={screens}
                  state={state}
                  dispatch={dispatch}
                  goBack={goBack}
                  dismiss={dismiss}
                  closeAttempt={
                    retain && state.phase === 'closing'
                      ? closeAttempt.current
                      : undefined
                  }
                  onBackdropClear={onBackdropClear}
                  NavigationProvider={api.NavigationProvider}
                />
              </View>
            )}
          </TraySettledContext.Provider>
        </TrayDismissContext.Provider>
      </NavigationContent>
    );
  }

  function createTrayNavigator<const P extends ParamListBase>() {
    type Bag = {
      ParamList: P;
      NavigatorID: string | undefined;
      State: StackNavigationState<P>;
      ScreenOptions: TrayScreenOptions;
      EventMap: {};
      NavigationList: { [N in keyof P]: TrayNavigationProp<P, N> };
      Navigator: typeof TrayNavigator;
    };
    return api.createNavigatorFactory(TrayNavigator)() as TypedNavigator<
      Bag,
      undefined
    >;
  }

  function useTraySettled() {
    const key = api.useRoute().key;
    const focused = api.useIsFocused();
    return useContext(TraySettledContext) === key && focused;
  }

  return { createTrayNavigator, useTraySettled };
}

const styles = StyleSheet.create({ hidden: { display: 'none' } });
