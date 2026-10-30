/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  modulePathIgnorePatterns: ['<rootDir>/artifacts/performance/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/examples/',
    '/lib/',
    '/scripts/performance/',
    '/artifacts/performance/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-reanimated)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    // Repository tests run before lib/ is built. Keep /mock exports unmapped.
    '^react-native-screen-choreography$': '<rootDir>/src/entries/index.ts',
    '^react-native-screen-choreography/core$': '<rootDir>/src/entries/core.ts',
    '^react-native-screen-choreography/expo-router$':
      '<rootDir>/src/entries/expo-router.ts',
    '^react-native-reanimated$':
      '<rootDir>/__mocks__/react-native-reanimated.js',
  },
};
