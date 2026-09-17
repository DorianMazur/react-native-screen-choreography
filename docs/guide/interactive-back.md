---
title: Interactive back
description: Drive reverse navigation with your own gesture, then finish or cancel it safely.
---

# Let the gesture lead.

`useInteractiveGestureLifecycle` connects a custom gesture to interactive back preparation, progress, and settlement. It buffers updates and early releases while the overlay becomes ready. Native-stack swipe progress is **not** connected automatically.

Create a controller with `useInteractiveTransition()` in the destination route beneath the provider. Import that hook from the package root for React Navigation, or `/expo-router` for Expo Router. Pass the controller into your gesture component; this preserves the route's navigator binding even when the gesture is rendered beneath a nested navigator.

## Two progress values, opposite meanings

| Clock                           | `0`              | `1`             |
| ------------------------------- | ---------------- | --------------- |
| Choreography expansion progress | Collapsed source | Expanded detail |
| Interactive gesture progress    | Untouched detail | Completed back  |

The interactive APIs use **gesture progress**. The library converts it to expansion progress for shared elements and companion content.

## Bind a pan gesture

This wrapper receives the controller created by its owning route. `onFallbackFinish` should perform that route's ordinary back navigation when a qualifying release has no transition session, including when reduced motion skips the morph.

```tsx
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import {
  useInteractiveGestureLifecycle,
  type InteractiveGestureController,
} from 'react-native-screen-choreography';

export function DismissGesture({
  controller,
  onFallbackFinish,
  children,
}: {
  controller: InteractiveGestureController;
  onFallbackFinish: () => void;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const ticket = useSharedValue(0);
  const distance = 320;
  const { begin, update, release } = useInteractiveGestureLifecycle(
    controller,
    {
      animate: !reducedMotion,
      threshold: 0.35,
      velocityImpact: 0.2,
      onFallbackFinish,
    }
  );

  const pan = Gesture.Pan()
    .activeOffsetY(5)
    .onStart(() => {
      ticket.value = begin();
    })
    .onUpdate((event) => {
      update(ticket.value, event.translationY / distance);
    })
    .onEnd((event, success) => {
      if (!success) return;
      release(ticket.value, {
        progress: event.translationY / distance,
        velocity: event.velocityY / distance,
      });
      ticket.value = 0;
    })
    .onFinalize((_event, success) => {
      if (success) return;
      release(ticket.value, { cancelled: true });
      ticket.value = 0;
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
```

Gesture Handler remains an optional application dependency; use your application's existing `GestureHandlerRootView` setup. The lifecycle hook is also exported from `/core` and `/expo-router`.

`begin`, `update`, and `release` are worklets. There is no application-side `scheduleOnRN` call or wait for an `isActive` render. `begin()` returns a ticket identifying the attempt, or `0` when disabled or busy; updates and releases for obsolete tickets are ignored. `release(ticket)` can omit progress to use the last update. Finalization cancels only failed attempts, so it does not undo a successful release.

::: tip Normalize velocity too
Divide gesture translation and velocity by the same positive dismissal distance. Velocity must be in **progress units per second**, positive toward completing back. The example uses 320 layout points; choose a distance appropriate for your layout.
:::

## Decide and settle

Release projects `progress + velocity × velocityImpact`, clamps it to `[0, 1]`, and finishes at or above `threshold`. Otherwise it cancels. Defaults are `threshold: 0.5`, `velocityImpact: 0.2`, and `velocity: 0`; `cancelled: true` always cancels.

Finish and cancel use a fast spring by default. Pass `spring` to tune it or `duration` to use timing. `animate: false` skips transition preparation but keeps the release decision and fallback dismissal. `enabled: false` prevents new attempts.

The controller uses the group and source recorded by successful choreography navigation. Override these with `group` and `targetScreenId` when needed. Set `scopeKey` when an application-specific identity changes, such as the selected gallery item. Changing those identity options, `enabled`, or `animate`, or unmounting, abandons the current attempt and cancels pending preparation or the acquired session.

After an accepted release hands Back completion to the library, cleanup leaves that navigation handoff running. Motion settings are captured when an attempt begins; fallback dismissal uses the latest committed `onFallbackFinish` callback.

## A handle that travels with the card

Use `defineTransition` and `useSharedElementPresentation` to render the visible handle inside a retained card. It then moves with the same content in the row, overlay, and expanded detail. Keep the gesture responder on a stationary view in the destination route: the overlay is non-interactive, and the retained card keeps its source route's React ancestry. The Wallet example uses this arrangement with a full-row expansion.

Drive retained children with `presentationProgress`, which stays still for other cards. Mount expensive detail-only content while the card is transitioning or settled expanded. Keep that content at its expanded dimensions and animate transforms inside the card's clipping frame to avoid laying out the chart and scroll view on every update.

While a gesture owns the return, its source screen stays visible and accepts touches, including at gesture progress `1`. Use a transparent source background when the shrinking card should reveal the screen underneath.

Map distance to progress in your gesture binding. Set `velocityImpact: 0` for a decision based only on distance; for example, a 280-point full range and `threshold: 0.5` commits at 140 points. Keep custom geometry, gesture recognition, and hit targets in the application; the lifecycle hook owns readiness, buffering, cancellation, and settlement.

If your interaction has a separate docking animation, use the lower-level session handle and call `finish()` only after docking completes. Trips uses that pattern of application-controlled settlement.

## Keep direct control when needed

The existing `useInteractiveTransition` API remains available. `beginBack()` now returns a session-bound handle with the existing `id` and `progress` fields plus `setProgress`, `finish`, and `cancel`:

```tsx
const interactive = useInteractiveTransition();

async function prepareBack(signal?: AbortSignal) {
  const handle = await interactive.beginBack({ signal });
  if (!handle) return;

  handle.setProgress(0.25);
  handle.cancel({ duration: 220 });
}
```

The handle is ready to use when the promise resolves and cannot control a later session. A `null` result means no session was acquired. An optional `AbortSignal` cancels preparation only; after readiness, use `handle.cancel()`.

On this direct API, only `setProgress` is a worklet. `beginBack`, `finish`, `cancel`, and the hook's `settle` run on JavaScript; bridge those yourself if calling from a worklet. Existing hook callbacks still work when taken from the current active render.

## Test the interruptions

Check a slow drag below threshold, a fast release, reversal of direction, release before readiness, cancellation, repeated attempts, identity changes, and reduced motion. Keep the source owner mounted and measurable for the return.

See the [navigation reference](../api/navigation.md#useinteractivegesturelifecycle) for the complete options.
