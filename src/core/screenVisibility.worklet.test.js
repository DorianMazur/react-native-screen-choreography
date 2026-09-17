const path = require('path');
const vm = require('vm');
const { transformFileSync } = require('@babel/core');

test('screen opacity runs in an isolated UI runtime with omitted and explicit fade settings', () => {
  const { code } = transformFileSync(
    path.resolve(__dirname, 'screenVisibility.ts'),
    {
      configFile: false,
      babelrc: false,
      plugins: [
        '@babel/plugin-transform-typescript',
        'react-native-worklets/plugin',
        '@babel/plugin-transform-modules-commonjs',
      ],
    }
  );
  const exports = {};
  vm.runInNewContext(code, { exports, global: { Error } });
  const worklet = exports.deriveScreenOpacity;
  // Execute serialized UI code without the original module's lexical scope.
  // Calling the JS function directly would mask missing worklet captures.
  const opacity = vm
    .runInNewContext(`(${worklet.__initData.code})`)
    .bind({ __closure: worklet.__closure });

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
