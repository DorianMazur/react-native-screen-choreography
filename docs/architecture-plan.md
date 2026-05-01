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
- exposes two React contexts so consumers can subscribe at the right granularity:
  - **`ChoreographyActionsContext`** — stable callbacks (`registerElement`, `unregisterElement`, `setScreenReady`, `unregisterScreen`, `waitForScreenReady`, `isElementHidden`). Identity is preserved across all session changes, so subscribers in this context never re-render because of transition state.
  - **`ChoreographyContext`** — the volatile transition state (`activeSession`, `pendingTargetScreenId`, `progress`, lifecycle async helpers). Components that need to react to the current session subscribe here.
- forwards a structured `debug` prop into the logger inside a `useEffect`, so toggling debug at runtime never re-creates registry / coordinator instances

### Hide / Reveal Handoff

The provider deliberately does **not** hide real elements when a session becomes `active`. Hiding is driven by the overlay's `useLayoutEffect` callback (`handleOverlayReady(sessionId)`) and the native host presentation ack (`handleHostPresentationReady`). Both call `syncHiddenElements()` only after their respective host has committed. This is what guarantees there is no blank frame at the start of the animation — the originals are hidden in the same React commit that paints the overlay for the first time. A 150ms safety-net inside `waitForOverlayReady` calls `syncHiddenElements()` if neither callback fired, so the spring never animates with the originals visible underneath.

### `ChoreographyScreen`

- provides a stable `screenId`
- reads volatile transition state from `ChoreographyContext` and lifecycle callbacks (`setScreenReady`, `unregisterScreen`) from `ChoreographyActionsContext` so its registration effect depends only on stable identities and never re-runs on session changes
- reports layout readiness via a double-RAF after each `onLayout`
- drives screen-level visibility through a single direction-agnostic model derived from `(direction, role, phase, progress)`. The pure helpers live in `src/screenVisibility.ts` and are unit-tested:
  - **`role`** is one of `source`, `target`, or `inactive` and comes from `getScreenRole(session, screenId)`
  - **`phase`** is one of `idle`, `preparing`, `active`, `completing`, `cancelling` and comes from `getSessionPhase(session, pendingTargetScreenId, screenId)` (treats `state: 'measuring'` and a matching `pendingTargetScreenId` as `preparing`)
  - the worklet computes a normalized progress `t = direction === 'forward' ? progress : 1 - progress` and applies one rule set:
    - target screen, preparing → `opacity: 0`
    - target screen, active → `opacity: 1` once `t > 0.001`
    - source screen, active → fade out over `t ∈ [0, 0.4]`
    - everything else → `opacity: 1`
  - participating screens block pointer events (`shouldBlockInteraction`) during `preparing` and `active`, and re-enable them during `completing` and `cancelling`
- because the model is direction-agnostic, the backward path is symmetric: when popping a detail, the detail is the `source` and fades out over `progress ∈ [0.6, 1.0]` (i.e. `t ∈ [0, 0.4]`), and the list (the `target` of the backward session) is fully visible the entire time

### `SharedElement`

- registers exactly once per `(id, groupId, screenId)` on mount and unregisters on unmount; the registration effect depends only on stable values (`id`, `groupId`, `screenId`, the registration callbacks, and `getSnapshot`) so ancestor re-renders, focus changes, or prop churn do not cause re-registration
- keeps the latest `children`, `style`, and `transition` in mutable refs that are written every render
- exposes a stable `getSnapshot(): ElementSnapshot` to the registry; the coordinator calls it once at session start to freeze the visual contract used by the overlay
- reads `hidden.value` synchronously during render to set an `initialOpacity` static style before `animatedStyle`; this ensures React's first committed frame never paints an element visible when its SV is already at 1 (hidden) from a prior transition

### Frozen Snapshots

`ElementTransitionPair` carries `sourceSnapshot` and `targetSnapshot` (`ElementSnapshot { content, style?, transition }`). Once the session reaches the `active` state, the overlay reads exclusively from those frozen snapshots — it never calls back into a `SharedElement` for live content. This is what makes the overlay immune to source-side re-renders, list cell recycling, and prop changes that happen during a transition.

### `ElementRegistry`

- stores registered elements by `id` (per-screen lookups via `(id, screenId)` keys)
- allows the same `id` to exist on multiple screens at once
- emits dev warnings when the same `id` is registered on the same screen with conflicting `groupId`s, or across screens with conflicting `groupId`s
- keeps the latest measured metrics for each element

### `TransitionCoordinator`

- pre-measures source elements before navigation
- waits for target elements to register and stabilize
- creates source/target element pairs and freezes a `sourceSnapshot` and `targetSnapshot` onto each pair before promoting the session to `active`
- can refresh source or target metrics for the active session in place
- maintains the `hiddenElements` set; the provider mirrors it onto per-element shared values when the overlay paints
- completes or cancels the active session through a single `state` transition (`measuring → active → completing | cancelling → cleared`)

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
7. The coordinator captures `getSnapshot()` for every paired element and stores frozen `sourceSnapshot`/`targetSnapshot` on each pair, then promotes the session to `active`.
8. `TransitionOverlay` mounts and `NativeTransitionHost` reports presentation ready. Each callback runs `syncHiddenElements()` so the originals are hidden the same frame the overlay first paints. A 150ms safety-net hides them anyway if neither callback fires.
9. Pending target hiding is cleared.
10. Reanimated drives progress from `0` to `1`.
11. On completion, `hiddenElements` is cleared and the session is set to `null`; the overlay unmounts and originals reveal in the same commit.

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

- **`pendingTargetScreenId`**: marks the future target so its phase resolves to `preparing` before the session is `active`, which keeps real content at `opacity: 0` until the overlay has taken over
- **Overlay readiness**: both the native host and overlay content must report ready before the pending state is cleared and the spring starts
- **Symmetric visibility model**: once the session is `active`, real content is revealed/faded by `deriveScreenOpacity(direction, role, phase, progress)` on the UI thread. The same rule set runs in both directions — the only thing that flips is the normalized progress `t`. Per-element shared values still hide individual `SharedElement`s on top of the screen-level opacity rule.

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

## Debug Logging

The `debug` prop on `ChoreographyProvider` accepts either a boolean or a structured config:

```ts
type ChoreographyDebugConfig =
  | boolean
  | {
      level?: 'error' | 'warn' | 'info' | 'trace';
      categories?: ChoreographyDebugCategory[];
      logEveryFrame?: boolean;
    };
```

The provider applies the resolved config inside a `useEffect` so toggling debug never re-creates the registry or coordinator. The logger keeps a bounded ring buffer, suppresses identical consecutive lines as `... (×N)` unless `logEveryFrame` is set, and gates verbose measurement traces behind `level: 'trace'`. The matching imperative API (`setDebugEnabled`, `setDebugLevel`, `setDebugCoalesce`, `isTraceEnabled`, `getDebugLogs`, `clearDebugLogs`) is exported from the package.

## Files Worth Reading

- `src/ChoreographyProvider.tsx`
- `src/TransitionCoordinator.ts`
- `src/TransitionOverlay.tsx`
- `src/hooks/useChoreographyNavigation.ts`
- `src/hooks/useChoreographyProgress.ts`

## Current Pressure Points

- startup still depends on live target measurement
- interactive gesture progress is not wired yet
- the registry is keyed by `id`; cross-screen `groupId` conflicts only produce dev warnings, not hard failures
- no snapshot or replica path exists yet for startup-critical elements (the freeze in `getSnapshot` covers the React layer, not native bitmap fidelity)

See [limitations-and-next-steps.md](limitations-and-next-steps.md) for the current support boundaries and roadmap.
