const React = require('react');
const { useMutable } = require('./shared-value');
const { Easing, StyleSheet, View } = require('react-native');

const noop = () => {};
const release = () => noop;
const controls = { settleTransition: noop };
const blocker = { acquire: release };
const gesture = { begin: () => 0, update: noop, release: noop };

const ProgressContext = React.createContext(null);
const PresentationContext = React.createContext(null);

function ChoreographyProvider({ children }) {
  const progress = useMutable(0);
  return React.createElement(
    ProgressContext.Provider,
    { value: progress },
    children
  );
}

function ChoreographyOverlay({ children }) {
  return children;
}

function SharedElement({ children, style, portalStyle, metadata }) {
  const progress = React.useContext(ProgressContext);
  const presentationProgress = useMutable(0);
  const frame = useMutable(null);
  const value = React.useMemo(
    () => ({
      progress: progress ?? presentationProgress,
      presentationProgress,
      frame,
      transitioning: false,
      direction: null,
      collapsed: { metrics: null, metadata, style: StyleSheet.flatten(style) },
      expanded: { metrics: null },
      settled: 'collapsed',
    }),
    [progress, presentationProgress, frame, metadata, style]
  );
  return React.createElement(
    PresentationContext.Provider,
    { value },
    React.createElement(
      View,
      { style },
      React.createElement(View, { style: portalStyle }, children)
    )
  );
}

SharedElement.Target = function Target({ style, hostStyle }) {
  return React.createElement(
    View,
    { style },
    React.createElement(View, { style: hostStyle })
  );
};

function TransitionFrame({ children }) {
  return React.createElement(View, null, children);
}

function useChoreographyProgress() {
  const progress = React.useContext(ProgressContext);
  const fallback = useMutable(0);
  return {
    progress: progress ?? fallback,
    backdropStyle: { opacity: 0 },
    isActive: false,
    isPendingTarget: false,
    role: 'inactive',
    phase: 'idle',
    direction: null,
    groupId: null,
    sessionId: null,
    ...controls,
  };
}

function useSharedElementPresentation() {
  const presentation = React.useContext(PresentationContext);
  if (!presentation) {
    throw new Error(
      'useSharedElementPresentation requires a SharedElement owner.'
    );
  }
  return presentation;
}

function useLatchedReveal({ visibleWhenInactive = true } = {}) {
  return visibleWhenInactive;
}

function useRevealStyle() {
  return {
    opacity: 1,
    transform: [{ translateY: 0 }, { translateX: 0 }, { scale: 1 }],
  };
}

function makeTransition({ renderer, zIndex = 100 }) {
  return { renderer, zIndex };
}

function defineTransition(definition) {
  function Element({ name, ...props }) {
    return React.createElement(SharedElement, { ...props, id: name });
  }
  Element.Target = function Target({ name, ...props }) {
    return React.createElement(SharedElement.Target, { ...props, id: name });
  };
  function Reveal({ children, style }) {
    return React.createElement(View, { style }, children);
  }
  return {
    Element,
    Enter: Reveal,
    Exit: Reveal,
    navigationOptions: { ...definition.motion },
  };
}

function resolveSurfaceStyle(style, fallback) {
  const flat = StyleSheet.flatten(style) ?? {};
  return {
    backgroundColor:
      typeof flat.backgroundColor === 'string'
        ? flat.backgroundColor
        : fallback?.backgroundColor,
    borderRadius:
      typeof flat.borderRadius === 'number'
        ? flat.borderRadius
        : fallback?.borderRadius,
    boxShadow: Array.isArray(flat.boxShadow)
      ? flat.boxShadow.map(
          ({
            offsetX = 0,
            offsetY = 0,
            blurRadius = 0,
            spreadDistance = 0,
            color = 'rgba(0,0,0,0)',
          }) => ({ offsetX, offsetY, blurRadius, spreadDistance, color })
        )
      : undefined,
  };
}

const Springs = {
  default: {
    damping: 28,
    mass: 1,
    stiffness: 240,
    overshootClamping: true,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
  },
  snappy: { damping: 20, mass: 0.8, stiffness: 300 },
  fast: {
    damping: 28,
    mass: 1,
    stiffness: 400,
    overshootClamping: true,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
  },
  gentle: { damping: 28, mass: 1, stiffness: 180 },
};

module.exports = {
  ChoreographyProvider,
  ChoreographyOverlay,
  SharedElement,
  TransitionSurface: TransitionFrame,
  TransitionFrame,
  makeTransition,
  defineTransition,
  resolveSurfaceStyle,
  useChoreographyBlocker: () => blocker,
  useChoreographyControls: () => controls,
  useChoreographyProgress,
  useLatchedReveal,
  useRevealStyle,
  useSharedElementPresentation,
  useInteractiveGestureLifecycle: () => gesture,
  Springs,
  Easings: {
    contentReveal: Easing.out(Easing.cubic),
    smooth: Easing.inOut(Easing.cubic),
    sharp: Easing.out(Easing.quad),
  },
  setDebugEnabled: noop,
};

Object.defineProperty(module.exports, '__esModule', { value: true });
