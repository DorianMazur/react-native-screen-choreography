---
title: Interactive back
description: Drive reverse navigation with your own gesture, then finish or cancel it safely.
---

# Let the gesture lead.

`useInteractiveTransition` lets a custom gesture prepare a reverse transition, move it, and decide whether to return or stay. Native-stack swipe progress is **not** connected automatically.

Import the hook from your integration entry: the package root for React Navigation, or `/expo-router` for Expo Router. Call it in a destination route beneath the provider.

## Two progress values, opposite meanings

| Clock                           | `0`              | `1`             |
| ------------------------------- | ---------------- | --------------- |
| Choreography expansion progress | Collapsed source | Expanded detail |
| Interactive gesture progress    | Untouched detail | Completed back  |

The hook's `progress` and `setProgress` use **gesture progress**. The library converts it to expansion progress for the shared elements and companion content.

## Prepare, update, settle

```tsx
const interactive = useInteractiveTransition();

// JavaScript callback: prepare and wait for the overlay.
async function prepareBack() {
  const session = await interactive.beginBack();
  return session !== null;
}

// Separate callbacks, bound again after the active-state render.
function updateDrag(normalizedDistance: number) {
  if (interactive.isActive) interactive.setProgress(normalizedDistance);
}

function releaseDrag(normalizedVelocity: number) {
  if (interactive.isActive)
    interactive.settle({ velocity: normalizedVelocity });
}
```

`beginBack()` uses the group and source recorded by a successful choreography navigation. You may pass `{ group, targetScreenId }` explicitly. A `null` result means no session was acquired: for example, another transition owns progress, return information is missing, or preparation could not complete.

`beginBack()` can take over an active opening transition on the same destination: it completes that opening before preparing the return. Unrelated transitions remain protected.

While a gesture owns the return, its source screen stays visible and accepts touches, including at gesture progress `1`. Use a transparent source background if the screen underneath should show through. Keep the gesture responder on a stationary screen view: shared content moves into a non-interactive overlay, and retained content keeps its original React ancestry. Call `finish()` only after any custom docking animation has reached its destination, or `cancel()` to restore the detail.

`beginBack()` is asynchronous, and its success updates React state. Build gesture callbacks from the latest render and gate updates with `isActive`; do not keep a callback created before preparation or assume the immediately preceding render has the new progress ownership token.

## Respect the JavaScript boundary

Only **`setProgress` is a worklet**. Run `beginBack`, `finish`, `cancel`, and `settle` on JavaScript. From a UI-thread gesture callback, use `scheduleOnRN` from `react-native-worklets` for those lifecycle operations.

This fragment shows the boundary for a Gesture Handler pan after preparation. It assumes `interactive.isActive` is true and `dismissDistance` is a positive layout distance:

```tsx
import { Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

const { setProgress, settle, isActive } = interactive;

const pan = Gesture.Pan()
  .enabled(isActive)
  .onUpdate((event) => {
    setProgress(event.translationY / dismissDistance);
  })
  .onEnd((event) => {
    scheduleOnRN(settle, {
      velocity: event.velocityY / dismissDistance,
    });
  });
```

Gesture Handler is an optional application dependency, not a library peer. Connect `pan` to your existing `GestureDetector` setup. Start preparation from a JavaScript interaction in your flow before enabling the pan; the fragment is a progress binding, not a complete gesture activation strategy.

::: tip Normalize velocity too
Gesture velocity is usually measured in pixels per second. Divide by the same dismissal distance used for translation. The hook expects **progress units per second**, positive toward completing back.
:::

## Finish or cancel

```tsx
// Complete the back navigation.
interactive.finish({ spring: { damping: 28, stiffness: 400 } });

// Return to the expanded detail without navigating back.
interactive.cancel({ duration: 220 });

// Let progress and velocity decide.
interactive.settle({ threshold: 0.5, velocityImpact: 0.2 });
```

`settle` projects `progress + velocity × velocityImpact`, clamps it to `[0, 1]`, and finishes at or above `threshold`. Otherwise it cancels. Defaults are `threshold: 0.5`, `velocityImpact: 0.2`, and `velocity: 0`.

Both finish and cancel use a fast spring by default. A supplied `duration` uses timing instead. On gesture cancellation or a failed gesture, schedule `cancel()` on JavaScript if preparation was started. Avoid issuing a cancel after an intentional successful finish from a generic finalization callback.

## Test the interruptions

Check a slow drag below threshold, a fast release, reversal of direction, gesture cancellation, and repeated attempts while preparation is pending. Keep the source owner mounted and measurable for the return.

See the [navigation reference](../api/navigation.md#useinteractivetransition) for the complete options.
