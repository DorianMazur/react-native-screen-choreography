const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '../..');

module.exports = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
});
