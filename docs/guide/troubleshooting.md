---
title: Troubleshooting
description: Resolve missing pairs, startup flashes, native build issues, and unexpected retained content behavior.
---

# Find the missing connection.

Most integration issues come from mismatched IDs, layout, or competing screen animations. Compare your setup with the complete [quick start](./quick-start.md).

## Navigation happens without a transition

Check these connections in order:

1. Navigation uses the choreography adapter and includes `transitionConfig: { group }`.
2. The source owner and destination target share the same `id` (or named role) and `groupId`.
3. Both routes are wrapped in the integration's `ChoreographyScreen` with stable, explicit IDs.
4. Both endpoints are mounted and measure to nonzero width and height.
5. The provider remains mounted above the navigator.

For Expo Router, `targetScreenId` must match the destination wrapper's `screenId`. For React Navigation, use a `screenId` matching the route name. Internally, adapters distinguish route instances by route key.

When a deep link opens the destination without a source owner, render fallback content there. An empty target alone does not create content.

## “No valid pairs found”

The coordinator could not find measurable matching endpoints. Inspect the group and element IDs first, then the target size. A virtualized item outside the rendered window is not a usable endpoint. Keep the returning source item mounted and visible enough to measure.

Do not gate required targets with `useLatchedReveal`. Hold the screen's [readiness](./readiness.md) while required layout is being prepared.

## A flash, a second moving card, or an opaque sheet

Keep these native-stack options on the choreographed detail route:

```tsx
options={{
  animation: 'none',
  presentation: 'containedTransparentModal',
  contentStyle: { backgroundColor: 'transparent' },
  gestureEnabled: false,
}}
```

The overlay presents the shared element above the stack. A simultaneous navigator animation can expose a second moving screen. An opaque route presentation can cover the underlying content during preparation.

Also check that you mounted only one owner plus an empty target. A second copy of the artwork on the destination defeats the retained-content model.

## Content arrives in the wrong size

The endpoint `style` controls measured bounds. `portalStyle` controls the owner's payload layout; `hostStyle` controls the receiving host. These are separate layers.

Give the target usable dimensions. Make retained content fill its available space when that matches your design. For internal image cropping, text scaling, or layout that changes between endpoints, use `useSharedElementPresentation` and guard against initially null metrics.

## A button navigates from the original route

The retained element keeps its original React context even while displayed in a destination target. Navigation hooks and closures inside it still belong to the source. Keep destination-specific navigation controls in ordinary destination content, or pass explicit application actions to the retained component.

Likewise, use `useSharedElementPresentation` inside retained content; `useChoreographyProgress` reads the screen context it was mounted under.

## Native component or worklet errors

Confirm that Fabric is enabled, native dependencies satisfy each other's version requirements, and your app has been rebuilt after installation. Expo Go is unsupported.

For bare React Native, configure `react-native-worklets/plugin` last in Babel's plugins list. For Expo, preserve the SDK's Babel preset. Follow [installation](./installation.md) before debugging a transition recipe.

## Gesture updates have no effect

Wait for `beginBack()` and use callbacks from the render where `isActive` is true. Only `setProgress` is a worklet. Schedule the other lifecycle methods on JavaScript, and normalize both translation and velocity. Follow [interactive back](./interactive-back.md).

## Turn on diagnostics

```tsx
<ChoreographyProvider
  debug={{ level: 'trace' }}
  onPreparationTrace={(trace) => {
    console.log(trace.outcome, trace.stages);
  }}
>
  <AppNavigation />
</ChoreographyProvider>
```

Start with `debug={true}` for lifecycle events. Trace level adds preparation and measurement detail. Repeated identical lines are coalesced by default; set `logEveryFrame: true` only when you need each line.

`onPreparationTrace` is deferred startup diagnostics, with timestamps from the JavaScript performance clock. It is not an FPS measurement. See [provider callbacks](../api/components.md#choreographyprovider) for details.

## Share a useful reproduction

Include the library, React Native, Reanimated, Worklets, Screens, and router versions; the platform and architecture; the endpoint and navigator configuration; and the smallest action sequence that reproduces the issue. For interruption bugs, include whether the action occurred during preparation, forward motion, reverse motion, or gesture settlement.

[Open an issue on GitHub](https://github.com/DorianMazur/react-native-screen-choreography/issues).
