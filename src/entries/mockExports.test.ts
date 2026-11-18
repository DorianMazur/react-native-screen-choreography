import manifest from '../../package.json';

jest.mock('react-native-teleport', () => ({}));
jest.mock('@react-navigation/native', () => ({}));
jest.mock('expo-router', () => ({}));
jest.mock('expo-router/react-navigation', () => ({}));
jest.mock('@swmansion/react-native-bottom-sheet', () => ({}));
jest.mock('react-native-keyboard-controller', () => ({}));

const entries = Object.entries(manifest.exports)
  .filter(([, target]) => typeof target === 'object' && 'source' in target)
  .map(([entry]) => entry);

test.each(entries)(
  'the mock for %s matches its public runtime exports',
  (entry) => {
    const subpath = entry.slice(1);
    const actual = require(manifest.name + subpath);
    const mock = require(manifest.name + '/mock' + subpath);
    expect(Object.keys(mock).sort()).toEqual(Object.keys(actual).sort());
  }
);
