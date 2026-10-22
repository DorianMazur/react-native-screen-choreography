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

## Dynamic tray demo

Open **Dynamic tray** on the landing screen to try a wallet flow with retained forms and a full-screen recipient list. See the [dynamic tray guide](../../docs/guide/dynamic-trays.md) for setup and usage.

## Field journal demo

Open **Field journal** to explore a collection of observation prompts: Trails, Sky, Street, Botanical, Wildlife, and Seasons. Each collection stamp expands into a full-screen journal page.

Open a collection from the grid, log an observation, then pull the top handle a short distance and release. The page returns to full size with its counter and bookmark state intact. A longer pull or the close button returns to the originating stamp. Closing and reopening starts a fresh visit.

The [shared implementation](../shared/journal/JournalScreens.tsx) uses a custom `makeTransition` renderer for the single retained stamp. The destination places its live observation page inside `Element.Target` and reads `useSharedElementPresentation` for captured endpoints and progress. Both screens use `keepVisible` so the transparent page can reveal the collection grid beneath it. Page content mounts with the destination, and the same progress-driven crossfade runs in both directions.

The library supplies presentation data independently of the renderer's lifetime and keeps the route mounted through the return animation. Cancelled dismissal preserves the page's local state. The example does not publish geometry, cache endpoints, or depend on an early-removal threshold. `useInteractiveGestureLifecycle` handles asynchronous gesture preparation and cancellation.

The page uses native rounded clipping (`overflow: 'hidden'`). Its animated mask matches the scaled stamp's square bounds and corner radius throughout the crossfade, then unfolds to the screen's aspect ratio. Fixed-size content scales within that frame. The page stays opaque underneath the fading stamp so the grid does not show through their overlap. At rest it uses the destination's current layout.

The expansion motion takes inspiration from [Enzo Manuel Mangano’s launcher transition](https://github.com/enzomanuelmangano/demos/blob/54b9041a52323d2aa7dcd000e14439608eeb0bb0/src/navigation/home/launch-transition.tsx), applied here to a journal collection flow.
