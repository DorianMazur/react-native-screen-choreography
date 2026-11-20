# Installation

Install the navigator and native peers in your React Native app.

```sh
npm install react-native-screen-choreography @swmansion/react-native-bottom-sheet@^1.1.0 react-native-keyboard-controller@^1.23.1 react-native-reanimated@^4.8.0 react-native-worklets@~0.14.0
```

Use React Native 0.87 or a compatible later release. Configure the Worklets Babel plugin for a bare app, install iOS pods and rebuild both platforms. Expo Router requires a development build. Wrap the app in `KeyboardProvider` and apply `trayStackLayout` to the parent stack. The React Navigation example uses `@react-navigation/native` and `@react-navigation/native-stack`. Expo apps import the navigator from `react-native-screen-choreography/expo-router`.

## Jest

In your Jest setup, map each library entry that your app imports to its packaged mock.

```js
jest.mock('react-native-screen-choreography', () =>
  require('react-native-screen-choreography/mock')
);
jest.mock('react-native-screen-choreography/expo-router', () =>
  require('react-native-screen-choreography/mock/expo-router')
);
jest.mock('react-native-screen-choreography/tray', () =>
  require('react-native-screen-choreography/mock/tray')
);
jest.mock('react-native-screen-choreography/expo-router/tray', () =>
  require('react-native-screen-choreography/mock/expo-router/tray')
);
```
