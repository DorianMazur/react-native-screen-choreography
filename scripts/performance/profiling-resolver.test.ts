import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { withProfilingRenderer } = require('./profiling-resolver.cjs');

test('only the Fabric production shim selects the profiling renderer', () => {
  const calls: {
    origin: string;
    moduleName: string;
    platform: string | null;
  }[] = [];
  const resolve = (
    context: { originModulePath: string },
    moduleName: string,
    platform: string | null
  ) => {
    calls.push({ origin: context.originModulePath, moduleName, platform });
    return { type: 'sourceFile', filePath: moduleName };
  };
  const context = {
    originModulePath:
      '/app/node_modules/react-native/Libraries/Renderer/shims/ReactFabric.js',
    resolveRequest: resolve,
  };
  const wrapped = withProfilingRenderer();
  assert.equal(
    wrapped(context, '../implementations/ReactFabric-prod', 'android').filePath,
    '../implementations/ReactFabric-profiling'
  );
  wrapped(context, '../implementations/ReactFabric-dev', 'ios');
  wrapped(
    { ...context, originModulePath: '/app/Other.js' },
    '../implementations/ReactFabric-prod',
    'android'
  );
  assert.deepEqual(
    calls.map((call) => call.moduleName),
    [
      '../implementations/ReactFabric-profiling',
      '../implementations/ReactFabric-dev',
      '../implementations/ReactFabric-prod',
    ]
  );
});

test('preserves a preexisting custom resolver and surfaces missing renderers', () => {
  const context = {
    originModulePath:
      'C:\\app\\node_modules\\react-native\\Libraries\\Renderer\\shims\\ReactFabric.js',
    resolveRequest: () => assert.fail('custom resolver was bypassed'),
  };
  const wrapped = withProfilingRenderer((_context: unknown, name: string) => {
    assert.equal(name, '../implementations/ReactFabric-profiling');
    throw new Error('Profiling renderer is not installed');
  });
  assert.throws(
    () => wrapped(context, '../implementations/ReactFabric-prod', 'android'),
    /not installed/
  );
});
