/** @type {import('jest').Config} */
module.exports = {
  preset: '@react-native/jest-preset',
  modulePathIgnorePatterns: ['<rootDir>/artifacts/performance/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/examples/',
    '/lib/',
    '/scripts/performance/',
    '/artifacts/performance/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-reanimated|@react-navigation|use-latest-callback|nanoid|query-string|decode-uri-component|split-on-first|filter-obj|strict-uri-encode|fast-deep-equal)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^expo-router/build/(.*)$': '<rootDir>/node_modules/expo-router/build/$1',
    // Repository tests run before lib/ is built. Keep /mock exports unmapped.
    '^react-native-screen-choreography$': '<rootDir>/src/entries/index.ts',
    '^react-native-screen-choreography/expo-router$':
      '<rootDir>/src/entries/expo-router.ts',
    '^react-native-screen-choreography/expo-router/tray$':
      '<rootDir>/src/entries/expo-router-tray.ts',
    '^react-native-screen-choreography/tray$': '<rootDir>/src/entries/tray.ts',
    '^react-native-reanimated$':
      '<rootDir>/__mocks__/react-native-reanimated.js',
  },
};
