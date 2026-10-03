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
    '^react-native-reanimated$':
      '<rootDir>/__mocks__/react-native-reanimated.js',
  },
};
