const React = require('react');
const { Button, Text, View } = require('react-native');
const { mutable } = require('./shared-value');

const Owner = React.createContext(null);
function useOwner() {
  const owner = React.useContext(Owner);
  if (!owner) throw new Error('This hook requires a tray screen or header.');
  return owner;
}
function useTrayDismiss() {
  return useOwner().dismiss;
}
function useTraySettled() {
  return useOwner().active;
}
function useTrayKeyboard() {
  return useOwner().keyboard;
}

function createTrayNavigator() {
  function Screen() {
    return null;
  }
  function Group() {
    return null;
  }
  function Navigator({
    children,
    initialRouteName,
    screenOptions,
    renderHeader,
    renderContentHeader,
    textColor,
    dismissDisabled,
    onDismiss,
    onPresent,
    onNavigate,
    onWillPresent,
    onWillDismiss,
  }) {
    const screens = new Map();
    function collect(nodes, defaults = []) {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type === Group || child.type === React.Fragment)
          collect(child.props.children, [
            ...defaults,
            child.props.screenOptions,
          ]);
        else if (child.type === Screen)
          screens.set(child.props.name, { ...child.props, defaults });
      });
    }
    collect(children);
    const serial = React.useRef(0);
    const [routes, setRoutes] = React.useState(() => {
      const name = initialRouteName ?? screens.keys().next().value;
      return [
        { name, key: 'initial', params: screens.get(name)?.initialParams },
      ];
    });
    const [keyboard] = React.useState(() => ({
      height: mutable(0),
      progress: mutable(0),
      isVisible: false,
    }));
    const [progress] = React.useState(() => mutable(1));
    const active = routes.at(-1);
    const dismiss = React.useCallback(() => setRoutes([]), []);
    const prior = React.useRef(null);
    const pages = routes.map((route, index) => {
      const screen = screens.get(route.name);
      if (!screen) throw new Error('Unknown tray screen: ' + route.name);
      const entry = (name, params) => ({
        name,
        params: params ?? screens.get(name)?.initialParams,
        key: String(++serial.current),
      });
      const navigation = {
        push(name, params) {
          const next = entry(name, params);
          setRoutes((current) => [...current, next]);
        },
        navigate(name, params) {
          if (route.name !== name) navigation.push(name, params);
          else navigation.setParams(params);
        },
        replace(name, params) {
          const next = entry(name, params);
          setRoutes((current) => [...current.slice(0, -1), next]);
        },
        goBack() {
          setRoutes((current) => current.slice(0, -1));
        },
        pop(count = 1) {
          setRoutes((current) =>
            current.slice(0, Math.max(1, current.length - count))
          );
        },
        popToTop() {
          setRoutes((current) => current.slice(0, 1));
        },
        setParams(params) {
          setRoutes((current) =>
            current.map((r) =>
              r.key === route.key
                ? { ...r, params: { ...r.params, ...params } }
                : r
            )
          );
        },
        getParent() {
          return { goBack: dismiss };
        },
        isFocused() {
          return active.key === route.key;
        },
        canGoBack() {
          return routes.length > 0;
        },
        getState() {
          return { routes, index: routes.length - 1 };
        },
      };
      const props = { route, navigation };
      const options = Object.assign(
        { title: route.name, presentation: 'tray' },
        ...[screenOptions, ...screen.defaults, screen.options].map((o) =>
          typeof o === 'function' ? o(props) : o
        )
      );
      return { ...props, options, index, screen };
    });
    const page = pages.at(-1);
    React.useEffect(() => {
      const last = prior.current;
      const details = page && { route: page.route, options: page.options };
      prior.current = details;
      if (!last && details) {
        onWillPresent?.(details);
        onPresent?.(details);
      } else if (last && !details) {
        onWillDismiss?.(last);
        onDismiss?.();
      } else if (last && details && last.route.key !== details.route.key)
        onNavigate?.(details);
    });
    const content = pages.map(
      ({ route, navigation, options, index, screen }) => {
        const visible = active.key === route.key;
        const header = options.renderHeader ?? renderHeader;
        const headerProps = {
          route,
          navigation,
          title: options.title,
          color: textColor ?? '#18181b',
          canGoBack: index > 0,
          dismiss,
          dismissDisabled: !!dismissDisabled,
        };
        return React.createElement(
          Owner.Provider,
          { key: route.key, value: { active: visible, dismiss, keyboard } },
          React.createElement(
            View,
            { style: visible ? undefined : { display: 'none' } },
            visible &&
              (header
                ? header(headerProps)
                : React.createElement(
                    React.Fragment,
                    null,
                    index > 0 &&
                      React.createElement(Button, {
                        title: 'Back',
                        accessibilityLabel: 'Back in tray',
                        onPress: navigation.goBack,
                      }),
                    React.createElement(Text, null, options.title),
                    React.createElement(Button, {
                      title: 'Close',
                      accessibilityLabel: 'Close tray',
                      disabled: dismissDisabled,
                      onPress: dismiss,
                    })
                  )),
            screen.children
              ? screen.children({ route, navigation })
              : React.createElement(screen.component ?? screen.getComponent(), {
                  route,
                  navigation,
                })
          )
        );
      }
    );
    return React.createElement(
      React.Fragment,
      null,
      page && page.options.contentHeaderHeight > 0 && renderContentHeader
        ? renderContentHeader({
            from: page.route.name,
            to: page.route.name,
            progress,
          })
        : null,
      content
    );
  }
  return { Navigator, Screen, Group };
}
function trayStackLayout({ state, descriptors }) {
  return React.createElement(
    View,
    null,
    state.routes.slice(0, state.index + 1).map(({ key }, index) =>
      React.createElement(
        View,
        {
          key,
          collapsable: false,
          pointerEvents: 'box-none',
          accessibilityElementsHidden: index !== state.index,
          importantForAccessibility:
            index === state.index ? 'auto' : 'no-hide-descendants',
        },
        descriptors[key].render()
      )
    )
  );
}
module.exports = {
  trayStackLayout,
  createTrayNavigator,
  useTrayDismiss,
  useTraySettled,
  useTrayKeyboard,
};
Object.defineProperty(module.exports, '__esModule', { value: true });
