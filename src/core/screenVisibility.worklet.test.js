const { loadWorkletModule, onUI } = require('../../__fixtures__/worklets');

test('screen opacity runs in an isolated UI runtime with omitted and explicit fade settings', () => {
  const { deriveScreenOpacity } = loadWorkletModule(
    require.resolve('./screenVisibility'),
    require
  );
  const opacity = onUI(deriveScreenOpacity);

  expect(opacity('forward', 'target', 'active', 0.2)).toBeCloseTo(0.5);
  expect(opacity('backward', 'target', 'active', 0.2, undefined)).toBeCloseTo(
    0.5
  );
  expect(
    opacity('forward', 'target', 'preparing', 0, { during: [0.2, 0.8] })
  ).toBe(0);
  expect(
    opacity('backward', 'source', 'active', 0.5, { during: [0.2, 0.8] })
  ).toBeCloseTo(0.5);
});
