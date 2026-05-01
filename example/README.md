# Example App

This example app demonstrates the current reference transition for `react-native-screen-choreography`: a wallet-style token list that expands a tapped row into a detail card.

## What It Demonstrates

- container morph from list row to detail card
- icon move-resize continuity
- move-resize continuity for name and symbol
- text crossfades for value and change
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
cd example/ios && pod install && cd ..
yarn ios
```

For Android:

```bash
cd example
yarn android
```

You can also run Metro manually:

```bash
cd example
yarn start
```

## Files Worth Inspecting

- `src/App.tsx` for navigator configuration
- `src/TokenListScreen.tsx` for forward navigation and transition config
- `src/TokenDetailScreen.tsx` for companion animations and reverse navigation
- `src/TokenRow.tsx` for shared element structure on the list row

## What To Test Manually

- tap a token and verify the forward transition starts immediately
- press back after the detail settles and verify a visible reverse animation
- start scrolling during an active detail transition and verify `settleTransition()` snaps cleanly to the detail endpoint
- go back quickly and tap a different token once
- repeat push-pop cycles to check for flashes, dropped reverses, or large startup delays
