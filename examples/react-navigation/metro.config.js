const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '../..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
});

config.transformer.publicPath = '/assets/?unstable_path=.';

if (process.env.CHOREOGRAPHY_REACT_PROFILE === '1') {
  const {
    withProfilingRenderer,
  } = require('../../scripts/performance/profiling-resolver.cjs');
  config.resolver.resolveRequest = withProfilingRenderer(
    config.resolver.resolveRequest
  );
}

module.exports = config;
