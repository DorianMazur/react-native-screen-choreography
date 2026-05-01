# Architecture Guide

Use this document when you are contributing to the library, debugging transition timing, or extending the runtime. If you are integrating the package into an app, start with [README.md](../README.md).

## Supported Runtime Model

The library currently works best with this setup:

- `@react-navigation/native-stack`
- stack `animation: 'none'`
- transparent detail presentation
- New Architecture / Fabric enabled
- Babel configured with `react-native-worklets/plugin`

The example app uses `presentation: 'containedTransparentModal'` and `contentStyle: { backgroundColor: 'transparent' }` for the detail route.

## High-Level Architecture

```text
React layer
  ChoreographyProvider
    NavigationContainer / Native Stack
    FullWindowOverlay
      NativeTransitionHost
        TransitionOverlay

Engine layer
  ElementRegistry
  TransitionCoordinator
  Screen readiness tracking
  Transition session state

Animation layer
  Shared progress value
  Stand-in interpolation
  Companion animation hooks

Native layer
  ScreenChoreographyView
    iOS Fabric component above stack containers
    Android Fabric view group above stack containers
```

## Why The Runtime Is Split This Way

The library uses a hybrid runtime because different parts of the problem have different ownership requirements:

- JavaScript / TypeScript owns registration, pairing, screen readiness, and navigation orchestration.
- Reanimated owns progress and visual interpolation on the UI thread.
- Native owns the overlay host so the transition surface is actually above the native-stack containers.

This gives the library a flexible public API while avoiding the most common z-order and reveal-timing failures that appear with screen-level navigator animations.

## Core Runtime Pieces

### `ChoreographyProvider`

- creates the registry and transition coordinator
- tracks the active session and pending target screen
- manages screen readiness state
- fires `onTransitionStart` and `onTransitionEnd` lifecycle callbacks for active sessions
- renders `TransitionOverlay` inside `FullWindowOverlay`
- wraps the overlay in `NativeTransitionHost`
- maintains a per-element `hiddenMap` of `SharedValue<number>` (1 = hidden, 0 = visible) that stand-ins and originals read on the UI thread
- `unregisterElement` skips SV cleanup when the key is in the coordinator's active hidden set, preventing mid-transition remounts from flashing elements visible

### `ChoreographyScreen`

- provides a stable `screenId`
- reports layout readiness after mount
- drives progress-based visibility via a UI-thread worklet with three distinct branches:
  - **`isPendingTarget`**: keeps the screen at `opacity: 0` until the overlay is ready to take over
  - **`isActiveForwardTarget`**: reveals the screen at `opacity: 1` once `progress.value > 0.001` — by the first spring frame, `syncHiddenElements()` has already written to the per-element hidden SVs on the UI thread, so shared elements are individually hidden before the screen becomes visible
  - **`isActiveForwardSource`**: fades the source screen from `opacity: 1` to `0` over `progress [0, 0.4]`, clearing non-shared content during the animated portion of the transition

### `SharedElement`

- registers each element with the provider on mount and unregisters on unmount
- `renderContent` is captured via a ref (`childrenRef.current = children` each render, `useCallback(() => childrenRef.current, [])` for stability) so the function identity never changes across parent re-renders, preventing registration churn when navigation state or focus changes cause ancestor re-renders
- reads `hidden.value` synchronously during render to set an `initialOpacity` static style before `animatedStyle`; this ensures React's first committed frame never paints an element visible when its SV is already at 1 (hidden) from a prior transition

### `ElementRegistry`

- stores registered elements by `id` and `screenId`
- allows the same `id` to exist on multiple screens at once
- keeps the latest measured metrics for each element

### `TransitionCoordinator`

- pre-measures source elements before navigation
- waits for target elements to register and stabilize
- creates source/target element pairs
- can refresh source or target metrics for the active session in place
- hides originals while stand-ins own the frame
- completes or cancels the active session

### `NativeTransitionHost`

- lives above the native stack in `FullWindowOverlay`
- reports when the host is presented and ready
- gives the JS runtime a reliable handoff point before revealing the pushed screen

### `TransitionOverlay`

- renders stand-ins for the active session
- picks the correct stand-in strategy for each animation type
- reports when overlay content is ready to render

## Forward Transition Lifecycle

1. A source screen calls `navigate()` from `useChoreographyNavigation`.
2. Source elements are pre-measured while they are still mounted and visible.
3. The target screen is marked as pending so its real content stays hidden.
4. Navigation pushes the target route with stack animation disabled.
5. Target `SharedElement`s register as the destination mounts.
6. `TransitionCoordinator` waits for the structural target elements to exist and stabilize.
7. `NativeTransitionHost` and `TransitionOverlay` both report readiness.
8. Pending target hiding is cleared.
9. Reanimated drives progress from `0` to `1`.
10. On completion, the originals are restored and the session is cleared.

## Reverse Transition Lifecycle

There are two main reverse paths today.

### Reverse while a forward session is still active

- the existing session is reused
- the detail route is popped first so the source screen is visible underneath
- source-side metrics can be refreshed after the pop before progress animates back
- progress animates back to the source endpoint
- completion tears down the reused session

### Reverse after the forward session has already settled

- detail elements are measured again
- a new backward session is created
- the detail route is popped
- progress animates back over the visible source screen

## Visibility And Readiness Rules

Three separate concepts control whether the user sees real screen content during a transition:

- **`pendingTargetScreenId`**: whether the pushed screen should stay at `opacity: 0` before the overlay is ready (handled by the `isPendingTarget` worklet branch in `ChoreographyScreen`)
- **Overlay readiness**: both the native host and overlay content must report ready before the pending state is cleared
- **Progress-driven reveal**: once pending is cleared, real screen content is revealed by `progress.value > 0.001` on the UI thread rather than by a JS state change; this avoids a one-frame gap between overlay teardown and React's async state propagation

The destination screen is intentionally revealed early (at the first spring frame) with only shared elements hidden individually via their `hiddenMap` SVs. This gives the "everything is already there, just the animated pieces are morphing" visual effect. The source screen fades out quickly over the first 40% of progress to remove non-shared content from view.

## Measurement Model

The current runtime still relies on live measurement.

- source elements are measured before navigation
- target elements are measured after mount
- startup waits are biased toward structural elements such as the container and icon
- reused reverse paths can refresh active session metrics after the source screen becomes visible again

This is still the largest startup cost in the current architecture.

## Progress And Companion Motion

The shared progress value is the contract between the transition runtime and companion screen motion.

- `useChoreographyProgress()` exposes the shared progress value and common derived behaviors
- `useLatchedReveal()` keeps staged content visible once it has crossed its reveal threshold
- `useStaggeredReveal()` creates per-item reveal styles from the same session progress
- `settleTransition()` lets a screen settle to its current endpoint as soon as the user starts scrolling or otherwise interacting

## Extending The Library

When adding new behavior, keep these boundaries intact:

- element registration and pairing belong in the engine layer
- screen visibility and readiness belong in the provider / screen wrapper layer
- visual interpolation belongs in overlay stand-ins and progress hooks
- screen-specific composition belongs in the consuming app, not in the core runtime

Typical extension points:

- add a new reusable `SharedElementTransition` renderer by composing the exported stand-in primitives or custom overlay content in app code
- add a new companion motion helper in `src/hooks/useChoreographyProgress.ts`
- add more debug instrumentation in `src/debug/logger.ts` and the provider / navigation hooks

## Files Worth Reading

- `src/ChoreographyProvider.tsx`
- `src/TransitionCoordinator.ts`
- `src/TransitionOverlay.tsx`
- `src/hooks/useChoreographyNavigation.ts`
- `src/hooks/useChoreographyProgress.ts`

## Current Pressure Points

- startup still depends on live target measurement
- interactive gesture progress is not wired yet
- reverse flows under very rapid interruption still need ongoing hardening
- no snapshot or replica path exists yet for startup-critical elements

See [limitations-and-next-steps.md](limitations-and-next-steps.md) for the current support boundaries and roadmap.
