const assert = require('node:assert/strict');
const vm = require('node:vm');
const { transformFileSync } = require('@babel/core');

function loadWorkletModule(filename, requireFromTest) {
  const { code } = transformFileSync(filename, {
    configFile: false,
    babelrc: false,
    plugins: [
      [
        '@babel/plugin-transform-typescript',
        { isTSX: filename.endsWith('.tsx') },
      ],
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs',
      'react-native-worklets/plugin',
    ],
  });
  const compiled = { exports: {} };
  vm.runInNewContext(code, {
    module: compiled,
    exports: compiled.exports,
    require: requireFromTest,
    global: { Error },
    AbortController,
  });
  return compiled.exports;
}

// Shared values are live references. JS functions have no transferred lexical
// scope, while another worklet carries its own closure.
function captures(value, input, seen = new Set()) {
  if (value === input) return true;
  if (typeof value === 'function') value = value.__closure;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => captures(child, input, seen));
}

function onUI(worklet, ...jsOnly) {
  for (const value of jsOnly) {
    assert.ok(
      !captures(worklet.__closure, value),
      'worklet captured a JS-only object'
    );
  }
  // The serialized function can access only what the Worklets plugin captured.
  return vm.runInNewContext(`(${worklet.__initData.code})`).bind({
    __closure: worklet.__closure,
  });
}

module.exports = { loadWorkletModule, captures, onUI };
