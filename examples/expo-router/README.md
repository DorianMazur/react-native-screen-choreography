# Expo Router example

This Expo SDK 57 development-build app demonstrates `react-native-screen-choreography` with:

- Expo Router's native `Stack`
- the same gallery, wallet, and wallet-setup demos as the React Navigation example
- one live Gallery hero owned by the list and reparented into the detail target: photo, title, subtitle, camera icon, and gradient share one derived frame; fixed image/text layouts use transforms instead of image reloads or text crossfades
- shared screens, data, transition renderers, and styles from `examples/shared`
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

## Transition definitions

All three demos use `defineTransition` from the shared core API:

| Demo | Definition | Live content |
| --- | --- | --- |
| Gallery | `../shared/gallery/galleryTransitions.tsx` | One hero plus a local detail reveal |
| Wallet | `../shared/wallet/walletTransitions.tsx` | Five named logo/text/value roles plus staged detail sections |
| Wallet setup | `../shared/wallet-setup/setupTransitions.tsx` | One panel containing persistent buttons and artwork |

The definitions coordinate endpoints and local section reveals. Image cropping,
text scaling, and the setup panel's internal motion stay inside their retained
components using `useSharedElementPresentation`. Enter/Exit wrappers belong to
ordinary screen content, not to content hosted on another route.
