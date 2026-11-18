const React = require('react');
const { renderHook } = require('@testing-library/react-native');
const { loadWorkletModule, onUI } = require('../../__fixtures__/worklets');
const { ChoreographyControlsContext } = require('../core/ChoreographyContext');
const {
  ChoreographyProgressContext,
} = require('../core/ChoreographyProgressContext');

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  useAnimatedStyle: (updater) => updater,
}));

test('a screen reveal follows live UI progress without transferring the provider or recipe', () => {
  const { useRevealStyle } = loadWorkletModule(
    require.resolve('./useRevealStyle'),
    require
  );
  const controls = { progress: { value: 0 } };
  const state = { phase: 'active', role: 'target', direction: 'forward' };
  const recipe = { during: [0.25, 0.75], translateY: 20 };
  const { result } = renderHook(() => useRevealStyle(recipe), {
    wrapper: ({ children }) => (
      <ChoreographyControlsContext.Provider value={controls}>
        <ChoreographyProgressContext.Provider value={state}>
          {children}
        </ChoreographyProgressContext.Provider>
      </ChoreographyControlsContext.Provider>
    ),
  });
  const style = onUI(result.current, controls, state, recipe);
  expect(style().opacity).toBe(0);
  controls.progress.value = 0.5;
  expect(style().opacity).toBe(0.5);
  expect(style().transform).toContainEqual({ translateY: 10 });
});
