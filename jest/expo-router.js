const core = require('./core');
const {
  ChoreographyScreen,
  useCommands,
  useInteractiveTransition,
} = require('./navigation');

function useChoreographyRouter(router) {
  return useCommands(router, (latest) => ({
    push: async ({ href }) => {
      latest.current.push(href);
    },
    navigate: async ({ href }) => {
      latest.current.navigate(href);
    },
    back: async () => {
      latest.current.back();
    },
  }));
}

module.exports = {
  ...core,
  ChoreographyScreen,
  useChoreographyRouter,
  useInteractiveTransition,
};

Object.defineProperty(module.exports, '__esModule', { value: true });
