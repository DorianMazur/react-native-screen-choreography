# Example App

This example app exposes the shared gallery, wallet, and wallet-setup demos through React Navigation.

## What It Demonstrates

- one live Gallery hero owned by the list and reparented into the detail target: photo, title, subtitle, camera icon, and gradient share one derived frame; fixed image/text layouts use transforms instead of image reloads or text crossfades
- explicit custom transition objects in the Wallet demo
- surface interpolation for the row-to-detail card container
- icon handoff with shared bounds interpolation
- live component transitions with custom wallet value motion
- early settle handling when detail interaction starts mid-transition
- staged reveal of detail content
- fast push-pop-push interruption handling

## Important Runtime Setup

The example intentionally uses:

- `@react-navigation/native-stack`
- `animation: 'none'`
- `presentation: 'containedTransparentModal'` on the detail screen
- transparent detail `contentStyle`

Those settings are part of the current working recipe for the library.

## Run The Example

From the repository root:

```bash
yarn install
```

For iOS:

```bash
cd examples/react-navigation/ios && pod install && cd ..
yarn ios
```

For Android:

```bash
cd examples/react-navigation
yarn android
```

You can also run Metro manually:

```bash
cd examples/react-navigation
yarn start
```

## Files Worth Inspecting

- `src/App.tsx` for navigator configuration
- `src/ExampleScreen.tsx` for the React Navigation adapter used by shared screens
- `../shared/wallet/TokenListScreen.tsx` for forward navigation and transition config
- `../shared/wallet/TokenDetailScreen.tsx` for companion animations and reverse navigation
- `../shared/wallet/TokenRow.tsx` for shared element structure on the list row

The Expo Router app imports those same files. Only navigator setup, destination mapping, and dynamic route parameter extraction remain app-specific.

## What To Test Manually

- tap a token and verify the forward transition starts immediately
- press back after the detail settles and verify a visible reverse animation
- start scrolling during an active detail transition and verify `settleTransition()` snaps cleanly to the detail endpoint
- go back quickly and tap a different token once
- repeat push-pop cycles to check for flashes, dropped reverses, or large startup delays
