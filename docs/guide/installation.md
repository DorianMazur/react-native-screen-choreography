---
title: Installation
description: Install Screen Choreography for React Navigation or an Expo Router development build.
---

# Installation

Screen Choreography includes native code. Install the dependencies, configure worklets, and rebuild your iOS or Android app.

## Compatibility

These are the package's declared peer ranges, not a guarantee that every combination works together. Choose React Native, Reanimated, Worklets, and Screens versions that also support each other.

| Dependency                             | Declared requirement                     |
| -------------------------------------- | ---------------------------------------- |
| React Native                           | `>= 0.76`, **New Architecture / Fabric** |
| React                                  | `>= 18`                                  |
| Reanimated                             | `>= 4`                                   |
| React Native Worklets                  | `>= 0.8`                                 |
| React Native Screens                   | `>= 4`                                   |
| React Native Teleport                  | `>= 1.2`                                 |
| React Navigation native + native stack | `>= 6`, when using that integration      |
| Expo Router                            | `>= 56.1.1`, when using that integration |

The bare example uses **React Native 0.83**; the Expo Router example uses **Expo SDK 57** (React Native 0.86.3). Both use React 19 and Reanimated 4. Check the [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) when selecting versions for an existing app.

## React Navigation

From your app directory:

```bash
npm install react-native-screen-choreography
npm install react-native-reanimated react-native-worklets react-native-teleport
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
```

`react-native-safe-area-context` belongs to the navigation setup. Keep dependencies you already have at versions compatible with your app.

Add the Worklets Babel plugin **last** in your existing plugins list:

```js
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

Install iOS pods using your project's usual CocoaPods setup, then rebuild:

```bash
cd ios
bundle exec pod install
cd ..
npm run ios
# Or: npm run android
```

For projects without Bundler, use `pod install`. Follow the [React Navigation environment setup](https://reactnavigation.org/docs/getting-started/) for any remaining platform configuration.

Continue to the [quick start](./quick-start.md).

## Expo Router

Start with an Expo Router project whose SDK satisfies the peer requirements above. Let Expo select its compatible native dependency versions:

```bash
npm install react-native-screen-choreography react-native-teleport
npx expo install react-native-reanimated react-native-worklets
npx expo install react-native-screens react-native-safe-area-context expo-dev-client
npx expo install --check
```

If Expo selects a version below a required peer range, upgrade to a compatible SDK before continuing. Do not force a newer native dependency into an incompatible SDK.

The repository's Expo example uses `babel-preset-expo`, which configures the Reanimated/Worklets transform for its SDK. Preserve that preset; consult your SDK's [Reanimated setup](https://docs.expo.dev/versions/latest/sdk/reanimated/) if you have customized Babel.

Build a native app:

```bash
npx expo run:ios
# Or: npx expo run:android
```

Continue to the [Expo Router guide](./expo-router.md).

## Choose one integration entry

| Import path                                    | Use it for                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `react-native-screen-choreography`             | React Navigation screens and hooks                                  |
| `react-native-screen-choreography/expo-router` | Expo Router screens and hooks                                       |
| `react-native-screen-choreography/core`        | Shared, navigator-independent components and transition definitions |

Both integration entries re-export the shared API. Keep `ChoreographyScreen` and navigation hooks on the entry matching your router. The `/core` entry does not include a screen wrapper or navigation adapter.
