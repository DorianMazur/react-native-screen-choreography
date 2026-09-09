# Expo Router example

This Expo SDK 57 development-build app demonstrates `react-native-screen-choreography` with:

- Expo Router's native `Stack`
- the same gallery, music, wallet, and wallet-setup demos as the React Navigation example
- a teleport-backed music player with persistent playback state, an animated waveform, and an interactive pull-down handle
- a custom live renderer that transforms one fixed-layout stateful panel between differently measured Music bounds
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
- `src/ExampleScreen.tsx` maps shared destination requests to Expo Router paths.
- `src/app` contains only route exports and dynamic-parameter adapters.
- `../shared` contains the actual demo screens and transition recipes used by both example apps.

Keep `animation: 'none'` and transparent stack content so the choreography overlay owns the visible motion.

In Music, start a track from its list-row play button, open the track, and return using Back or the pull-down handle. The elapsed time and play/pause state stay with the same `SharedElement.Live` instance across both hosts. Playback is simulated; no audio is streamed.

The smaller LIVE INSTANCE panel uses the same module-scope custom transition on its owner and target. Tap `+1`, open the track, and verify its instance number and counter survive the move into the larger destination bounds. Check Back, a short pull-down that cancels, rapid open-close interruption, and repeated open-close cycles. The panel should remain single, continuous, and aligned at both endpoints without flashing or resetting.
