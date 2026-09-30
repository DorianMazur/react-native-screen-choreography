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

// The query form lets Metro serve assets outside the app directory. Offline
// bundles need file paths: a query string makes iOS truncate the asset URL.
config.transformer.publicPath = process.argv.some(
  (arg) => arg === '--assets-dest' || arg.startsWith('--assets-dest=')
)
  ? '/assets'
  : '/assets/?unstable_path=.';

module.exports = config;
