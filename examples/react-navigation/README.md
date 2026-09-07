# Example App

This example app exposes the shared gallery, music, wallet, and wallet-setup demos through React Navigation.

## What It Demonstrates

- explicit per-element transition objects reused across list and detail screens
- surface interpolation for the row-to-detail card container
- icon handoff with shared bounds interpolation
- built-in surface, stretch, and native font-size recipes, alongside custom wallet value motion
- early settle handling when detail interaction starts mid-transition
- staged reveal of detail content
- fast push-pop-push interruption handling
- native view reparenting in Music with one stateful player instance shared between compact and expanded hosts
- a pull-down handle that supports completing or cancelling an interactive return to the music list

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
- `../shared/music/MusicListScreen.tsx` for the `SharedElement.Live` owners
- `../shared/music/NowPlayingScreen.tsx` for the destination-only `LiveTarget` and pull-down handle
- `../shared/music/TrackItem.tsx` for the playback clock, waveform, and controls that survive teleporting

The Expo Router app imports those same files. Only navigator setup, destination mapping, and dynamic route parameter extraction remain app-specific.

## What To Test Manually

- tap a token and verify the forward transition starts immediately
- press back after the detail settles and verify a visible reverse animation
- start scrolling during an active detail transition and verify `settleTransition()` snaps cleanly to the detail endpoint
- go back quickly and tap a different token once
- repeat push-pop cycles to check for flashes, dropped reverses, or large startup delays
- start a track from the Music list, open its artwork/title, and verify the elapsed time continues in Now Playing
- pause, return to the list, and reopen the same track; its elapsed time and play/pause state should not reset
- pull the music handle down a little and release to cancel, then pull farther to return to the list

Music simulates playback with a clock and animated waveform; it does not play audio. Each track's live component owns its state while the Music list stays mounted.
