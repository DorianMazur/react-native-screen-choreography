const core = require('./core');
const {
  ChoreographyScreen,
  choreographyScreenLayout,
  useCommands,
  useInteractiveTransition,
} = require('./navigation');

function useChoreographyNavigation(navigation) {
  return useCommands(navigation, (latest) => ({
    navigate: async (name, params) => {
      latest.current.navigate(name, params);
    },
    goBack: async () => {
      latest.current.goBack();
    },
  }));
}

module.exports = {
  ...core,
  ChoreographyScreen,
  choreographyScreenLayout,
  useChoreographyNavigation,
  useInteractiveTransition,
};

Object.defineProperty(module.exports, '__esModule', { value: true });
