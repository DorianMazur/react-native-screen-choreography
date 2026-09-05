# Expo Router example

This Expo SDK 57 development-build app demonstrates `react-native-screen-choreography` with:

- Expo Router's native `Stack`
- the same gallery, music, wallet, and live-player demos as the React Navigation example
- shared screens, data, transition renderers, styles, and interactive gestures from `examples/shared`
- thin typed dynamic route adapters such as `/gallery/[photoId]`
- explicit `ChoreographyScreen` identity
- provider-owned reverse-transition lineage, without private URL parameters
- no conditional imports or React Navigation modules in the Expo bundle graph

## Run

Install dependencies once from the repository root:

```bash
yarn install
```

Build and run the native app:

```bash
cd examples/expo-router
yarn ios
# or
yarn android
```

Expo Go is not supported because the library includes a custom native overlay host. After the first native build, `yarn start` starts Metro for the installed development build.

## Files to inspect

- `src/app/_layout.tsx` mounts `ChoreographyProvider` around the Expo Router stack.
- `src/exampleRuntime.ts` maps shared destination requests to Expo Router paths.
- `src/app` contains only route exports and dynamic-parameter adapters.
- `../shared` contains the actual demo screens and transition recipes used by both example apps.

Keep `animation: 'none'` and transparent stack content so the choreography overlay owns the visible motion.
