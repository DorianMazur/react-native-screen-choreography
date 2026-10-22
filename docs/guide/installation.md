---
title: Installation
description: Install Screen Choreography for React Navigation, Expo Router, or independent dynamic trays.
---

# Installation

Screen Choreography includes native code. Install the dependencies, configure worklets, and rebuild your iOS or Android app.

## Compatibility

These are the package's declared peer ranges, not a guarantee that every combination works together. Choose React Native, Reanimated, and Worklets versions that also support each other.

| Dependency                             | Declared requirement                     |
| -------------------------------------- | ---------------------------------------- |
| React Native                           | `>= 0.81`, **New Architecture / Fabric** |
| React                                  | `>= 18`                                  |
| Reanimated                             | `>= 4`                                   |
| React Native Worklets                  | `>= 0.8`                                 |
| React Native Teleport                  | `>= 1.2.2`                               |
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

`react-native-screens` and `react-native-safe-area-context` are dependencies of the navigation setup. Screen Choreography's core does not depend on `react-native-screens`.

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

## Dynamic trays without a router

Trays manage their own screen stack. An app using only trays does not need React Navigation or Expo Router:

```bash
npm install react-native-screen-choreography
npm install react-native-reanimated react-native-worklets react-native-teleport
npm install @swmansion/react-native-bottom-sheet@0.16.2 react-native-keyboard-controller@^1.22.7
```

For a bare React Native app, add `react-native-worklets/plugin` last in your Babel plugins as shown above, install iOS pods, and rebuild. For Expo, preserve `babel-preset-expo`, use `npx expo install` for Reanimated and Worklets, and create a development build. Expo Go is not supported.

Wrap your tray provider in `KeyboardProvider` from `react-native-keyboard-controller`. The [dynamic tray guide](./dynamic-trays.md) shows the complete setup. Its example also uses `react-native-safe-area-context` to supply insets; install that package if your app does not already use it. The tray manages its own bottom-sheet provider.

The sheet and keyboard packages are optional peers required only by `/tray`. Apps using other entries without trays do not need them.

## Choose an entry

| Import path                                    | Use it for                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `react-native-screen-choreography`             | React Navigation screens and hooks                                  |
| `react-native-screen-choreography/expo-router` | Expo Router screens and hooks                                       |
| `react-native-screen-choreography/core`        | Shared, navigator-independent components and transition definitions |
| `react-native-screen-choreography/tray`        | Independent dynamic trays and their typed screen stacks             |

Both integration entries re-export the shared API. Keep `ChoreographyScreen` and navigation hooks on the entry matching your router. The `/core` entry does not include a screen wrapper or navigation adapter.

Use `/tray` for tray components and hooks, and `/core` for shared elements inside trays. Neither entry requires a navigation library. Trays can also run alongside either navigation integration.
