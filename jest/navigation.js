const React = require('react');
const { mutable } = require('./shared-value');

function ChoreographyScreen({ children }) {
  return children;
}

// Keep command identities stable while forwarding to the latest navigator.
function useCommands(target, create) {
  const latest = React.useRef(target);
  latest.current = target;
  const [commands] = React.useState(() => create(latest));
  return commands;
}

function useInteractiveTransition() {
  const [controller] = React.useState(() => {
    const progress = mutable(0);
    return {
      progress,
      isActive: false,
      beginBack: async () => null,
      setProgress: (value) => {
        progress.value = value;
      },
      finish: () => {},
      cancel: () => {},
      settle: () => {},
    };
  });
  return controller;
}

module.exports = { ChoreographyScreen, useCommands, useInteractiveTransition };
