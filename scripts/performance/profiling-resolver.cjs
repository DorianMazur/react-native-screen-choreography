'use strict';

// A benchmark-only renderer substitution
function withProfilingRenderer(resolveRequest) {
  return (context, moduleName, platform) => {
    const origin = context.originModulePath.replaceAll('\\', '/');
    const isFabricShim = origin.endsWith(
      '/react-native/Libraries/Renderer/shims/ReactFabric.js'
    );
    const requested =
      isFabricShim && moduleName === '../implementations/ReactFabric-prod'
        ? '../implementations/ReactFabric-profiling'
        : moduleName;
    return (resolveRequest ?? context.resolveRequest)(
      context,
      requested,
      platform
    );
  };
}

module.exports = { withProfilingRenderer };
