const React = require('react');
const { Button, Text, View } = require('react-native');
const { ChoreographyProvider } = require('./core');
const { mutable } = require('./shared-value');

// Stack and Screen are declarations, including when grouped in fragments.
function mapChildren(children, visit) {
  return React.Children.map(children, (child) =>
    React.isValidElement(child) && child.type === React.Fragment
      ? React.cloneElement(child, {}, mapChildren(child.props.children, visit))
      : visit(child)
  );
}

function readStack(children, Stack, Screen) {
  let stack;
  const screens = new Map();
  const content = mapChildren(children, (child) => {
    if (!React.isValidElement(child) || child.type !== Stack) return child;
    if (stack)
      throw new Error('Tray.Provider requires exactly one Tray.Stack.');
    stack = child.props;
    mapChildren(stack.children, (screen) => {
      if (screen == null) return null;
      if (!React.isValidElement(screen) || screen.type !== Screen)
        throw new Error('Tray.Stack requires Tray.Screen declarations.');
      const { name, component, options } = screen.props;
      if (screens.has(name)) throw new Error(`Duplicate tray screen: ${name}`);
      screens.set(name, {
        component,
        options: {
          ...options,
          title: options?.title ?? name,
          presentation: options?.presentation ?? 'tray',
        },
      });
      return null;
    });
    return null;
  });
  if (!stack || !screens.size)
    throw new Error('Tray.Provider requires a Tray.Stack with a Tray.Screen.');
  return { stack, screens, content };
}

function createStore(config) {
  let routes = [];
  let state = { route: undefined, depth: 0, isPresented: false };
  let nextKey = 0;
  const listeners = new Set();
  const events = [];

  function commit(next) {
    const previous = state.route;
    routes = next;
    const route = routes[routes.length - 1];
    state = { route, depth: routes.length, isPresented: !!route };
    const screen = route ?? previous;
    const details = {
      route: screen,
      options: config.current.screens.get(screen.name).options,
    };
    if (!previous) {
      events.push(['onWillPresent', details], ['onPresent', details]);
    } else if (!route) {
      events.push(['onWillDismiss', details], ['onDismiss']);
    } else {
      events.push(['onNavigate', details]);
    }
    listeners.forEach((listener) => listener());
  }

  function entry(name, params) {
    if (!config.current.screens.has(name))
      throw new Error(`Unknown tray screen: ${name}`);
    return { key: String(++nextKey), name, params };
  }
  const tray = {
    present: (name, params) => commit([entry(name, params)]),
    push(name, params) {
      if (routes.length) commit([...routes, entry(name, params)]);
    },
    replace(name, params) {
      if (routes.length) commit([...routes.slice(0, -1), entry(name, params)]);
    },
    back() {
      if (routes.length) commit(routes.slice(0, -1));
    },
    popToRoot() {
      if (routes.length > 1) commit(routes.slice(0, 1));
    },
    dismiss() {
      if (routes.length) commit([]);
    },
  };
  return {
    tray,
    keyboard: { height: mutable(0), progress: mutable(0), isVisible: false },
    getState: () => state,
    getRoutes: () => routes,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    deliverEvents(committedRoutes) {
      if (committedRoutes !== routes) return;
      for (const [name, ...args] of events.splice(0))
        config.current.stack[name]?.(...args);
    },
  };
}

function defaultHeader({ tray, title, canGoBack, dismissDisabled }) {
  return React.createElement(
    React.Fragment,
    null,
    canGoBack &&
      React.createElement(Button, {
        title: 'Back',
        accessibilityLabel: 'Back in tray',
        onPress: tray.back,
      }),
    React.createElement(Text, null, title),
    React.createElement(Button, {
      title: 'Close',
      accessibilityLabel: 'Close tray',
      disabled: dismissDisabled,
      onPress: tray.dismiss,
    })
  );
}

function createTray() {
  const Store = React.createContext(null);
  const Owner = React.createContext(null);

  function Stack() {
    throw new Error('Tray.Stack must be a direct child of its Tray.Provider.');
  }
  function Screen() {
    throw new Error('Tray.Screen must be declared inside its Tray.Stack.');
  }
  function useStore() {
    const store = React.useContext(Store);
    if (!store) throw new Error('Tray hooks require their Tray.Provider.');
    return store;
  }
  function useTray() {
    const store = useStore();
    return React.useContext(Owner)?.tray ?? store.tray;
  }
  function useTrayState(selector) {
    const store = useStore();
    const getSelected = React.useMemo(() => {
      let previous;
      let selected;
      return () => {
        const state = store.getState();
        if (state !== previous) {
          selected = selector(state);
          previous = state;
        }
        return selected;
      };
    }, [store, selector]);
    return React.useSyncExternalStore(
      store.subscribe,
      getSelected,
      getSelected
    );
  }
  function useOwner() {
    const owner = React.useContext(Owner);
    if (!owner)
      throw new Error('This hook requires a tray screen or custom header.');
    return owner;
  }
  function useFocusEffect(effect) {
    const { route } = useOwner();
    const store = useStore();
    const focused = useTrayState((state) => state.route === route);
    React.useEffect(() => {
      if (focused && store.getState().route === route) return effect();
    }, [effect, focused, route, store]);
  }
  function useKeyboard() {
    useOwner();
    return useStore().keyboard;
  }

  function Page({ route, screen, stack, active, canGoBack }) {
    const store = useStore();
    const props = React.useMemo(
      () => ({
        route,
        tray: {
          ...store.tray,
          push(...args) {
            if (store.getState().route === route) store.tray.push(...args);
          },
        },
      }),
      [route, store]
    );
    const renderHeader =
      screen.options.renderHeader ?? stack.renderHeader ?? defaultHeader;
    return React.createElement(
      Owner.Provider,
      { value: props },
      React.createElement(
        View,
        { style: active ? undefined : { display: 'none' } },
        active &&
          renderHeader({
            ...props,
            canGoBack,
            title: screen.options.title,
            color: stack.textColor ?? '#18181b',
            dismissDisabled: stack.dismissDisabled ?? false,
          }),
        React.createElement(screen.component, props)
      )
    );
  }
  function Provider({ children }) {
    const declaration = React.useMemo(
      () => readStack(children, Stack, Screen),
      [children]
    );
    const config = React.useRef(declaration);
    React.useLayoutEffect(() => {
      config.current = declaration;
    });
    const [store] = React.useState(() => createStore(config));
    const routes = React.useSyncExternalStore(
      store.subscribe,
      store.getRoutes,
      store.getRoutes
    );
    React.useEffect(() => store.deliverEvents(routes), [store, routes]);
    return React.createElement(
      Store.Provider,
      { value: store },
      React.createElement(
        Owner.Provider,
        { value: null },
        React.createElement(
          View,
          {
            accessibilityElementsHidden: routes.length > 0,
            importantForAccessibility: routes.length
              ? 'no-hide-descendants'
              : 'auto',
          },
          declaration.content
        ),
        routes.length > 0 &&
          React.createElement(
            ChoreographyProvider,
            null,
            routes.map((route, index) =>
              React.createElement(Page, {
                key: route.key,
                route,
                screen: declaration.screens.get(route.name),
                stack: declaration.stack,
                active: index === routes.length - 1,
                canGoBack: index > 0,
              })
            )
          )
      )
    );
  }
  return {
    Provider,
    Stack,
    Screen,
    useTray,
    useTrayState,
    useFocusEffect,
    useKeyboard,
  };
}

module.exports = { createTray };
Object.defineProperty(module.exports, '__esModule', { value: true });
