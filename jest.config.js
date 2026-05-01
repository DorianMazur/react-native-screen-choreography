/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: ['/node_modules/', '/example/', '/lib/'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-reanimated)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^react-native-reanimated$':
      '<rootDir>/__mocks__/react-native-reanimated.js',
  },
};
