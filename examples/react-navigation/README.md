# Example App

This app runs the [shared demos](../shared) through React Navigation. See the [demo gallery](https://screen-choreography.dev/examples.html) for recordings and source links.

## What It Demonstrates

- retained content owned by the source screen and reparented into the detail target, with child layout driven by shared progress
- declarative shared roles and section reveals
- icon handoff with shared bounds interpolation
- live component transitions with custom internal motion
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
- [Shared demo source](../shared) for screen implementations, transition recipes, and retained components

The Expo Router app imports the same shared implementations. Only navigator setup, destination mapping, and dynamic route parameter extraction remain app-specific.

## What To Test Manually

- tap an item and verify the forward transition starts immediately
- press back after the detail settles and verify a visible reverse animation
- start scrolling during an active detail transition and verify `settleTransition()` snaps cleanly to the detail endpoint
- go back quickly and tap a different item once
- repeat push-pop cycles to check for flashes, dropped reverses, or large startup delays

## Transition definitions

Transition recipes live alongside their screens in [the shared source](../shared) and use `defineTransition` from the shared core API.

The definitions coordinate endpoints and local section reveals. Internal layout and visual changes stay inside retained
components using `useSharedElementPresentation`. Enter/Exit wrappers belong to
ordinary screen content, not to content hosted on another route.

## Test animations under JS load

In a development build, tap **JS stress** at the bottom right of any demo.
The menu uses [`ChoreographyOverlay`](../../docs/api/components.md#choreographyoverlay)
to stay above transitions.

- **Heavy load · 30 s** repeats 80 ms of busy work with at least 20 ms free.
- **Super heavy load · 30 s** repeats 500 ms of busy work with at least 20 ms free.
- **Stop JS load** cancels after the current busy interval finishes.

The badge shows the active mode. Load stops after 30 seconds, on backgrounding,
or when the menu unmounts. The menu and load are disabled in release builds.

Compare the same round trip with and without load, watching for flashes, frozen
motion, late handoffs, or missing content. Delayed JS tap handlers are expected.
This stresses JavaScript, not the GPU or native UI thread; use release profiling
on a physical device to measure performance.
