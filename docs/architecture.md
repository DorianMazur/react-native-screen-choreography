# Architecture Guide

Use this document when you are contributing to the library, debugging transition timing, or extending the runtime. If you are integrating the package into an app, start with [README.md](../README.md).

## Source Organization And Entry Points

Public entry modules live in `src/entries` and contain only exports. The package export map keeps the consumer-facing paths independent of their source locations:

| Public import | Entry module | Navigation adapter |
| --- | --- | --- |
| `react-native-screen-choreography` | [src/entries/index.ts](../src/entries/index.ts) | [src/adapters/react-navigation.tsx](../src/adapters/react-navigation.tsx) |
| `react-native-screen-choreography/expo-router` | [src/entries/expo-router.ts](../src/entries/expo-router.ts) | [src/adapters/expo-router.tsx](../src/adapters/expo-router.tsx) |
| `react-native-screen-choreography/core` | [src/entries/core.ts](../src/entries/core.ts) | None |

Both integration entries re-export the shared API from the core entry, then add their own navigation hooks and `ChoreographyScreen` wrapper. Add shared public exports to the core entry once; do not duplicate their lists in the integration entries.

The adapters read navigator state and bind navigation commands and removal interception to the shared hooks. React Navigation imports stay in its adapter; Expo Router imports stay in the Expo adapter. Shared components, hooks, and runtime modules must not import either adapter or a public entry barrel.

The `src/core` directory holds internal runtime machinery, not the public `/core` export surface. `src/components` contains navigator-independent components, including `ChoreographyScreenBase`; `src/hooks` contains shared lifecycle and progress hooks. Rendering recipes, stand-ins, native integration, and logging remain in their respective directories.

[__tests__/entryPoints.test.ts](../__tests__/entryPoints.test.ts) checks that entries contain only exports, that shared value and type exports are identical across integrations, and that their transitive source imports preserve navigation dependency isolation.

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
- drives screen-level visibility through a single direction-agnostic model derived from `(direction, role, phase, progress)`. The pure helpers live in `src/core/screenVisibility.ts` and are unit-tested:
  - **`role`** is one of `source`, `target`, or `inactive` and comes from `getScreenRole(session, screenId)`
  - **`phase`** is one of `idle`, `preparing`, `active`, `completing`, `cancelling` and comes from `getSessionPhase(session, pendingTargetScreenId, screenId)` (treats `state: 'measuring'` and a matching `pendingTargetScreenId` as `preparing`)
  - progress always means `0 = collapsed/list`, `1 = expanded/detail`; direction and role identify which physical side a screen represents, not a separate animation clock
  - during `active`, expanded-screen opacity is `clamp(progress / 0.4, 0, 1)` and collapsed-screen opacity is its complement. The expanded screen is the forward target or backward source.
  - during `preparing`, the forward target is hidden; the backward target and both source roles remain visible. Inactive screens and terminal phases retain normal visibility.
  - participating screens block pointer events (`shouldBlockInteraction`) during `preparing` and `active`, and re-enable them during `completing` and `cancelling`
- the same physical screen has the same opacity at a given expansion progress in either direction. On Back, companion content fades out over `1` to `0.7` while the detail background stays opaque; screen crossfade follows over `0.4` to `0`. This avoids multiplying a late content fade by an early whole-screen fade.

### `SharedElement`

- registers exactly once per `(id, groupId, screenId)` on mount and unregisters on unmount; the registration effect depends only on stable values (`id`, `groupId`, `screenId`, the registration callbacks, and `getPresentation`) so ancestor re-renders, focus changes, or prop churn do not cause re-registration
- keeps the latest `children`, `style`, and `transition` in mutable refs that are written every render
- exposes a stable `getPresentation(): ElementPresentation` to the registry; the coordinator calls it once at session start to freeze the visual contract used by the overlay
- reads a per-element hidden shared value in `useAnimatedStyle`, keeping original elements hidden while their transition renderer owns the overlay presentation

### Frozen Presentations

`ElementTransitionPair` carries `sourcePresentation` and `targetPresentation` (`ElementPresentation { content, style?, transition }`). Once the session reaches the `active` state, the overlay reads exclusively from those frozen presentations — it never calls back into a `SharedElement` for live content. This is what makes the overlay immune to source-side re-renders, list cell recycling, and prop changes that happen during a transition.

### `ElementRegistry`

- stores registered elements by compound `(screenId, groupId, id)` identity
- allows the same `id` to exist on multiple screens at once
- allows the same `id` to exist in different groups on one screen and warns only when an exact compound identity is replaced
- keeps the latest measured metrics for each element
- exposes `subscribe(listener)` so the coordinator can await registration and metrics events instead of polling on a timer

### `TransitionCoordinator`

- pre-measures source elements before navigation
- waits for target elements to register via registry subscription events (with a 500ms safety deadline) instead of a 16ms polling loop
- validates cached target metrics from previous sessions with one batched measurement; only falls back to the multi-read stability loop when the cache is missing or stale
- discovers expected IDs from the source screen's group, creates only matching source/target pairs, and freezes a `sourcePresentation` and `targetPresentation` onto each pair before promoting the session to `active`
- can refresh source or target metrics for the active session in place
- maintains the `hiddenElements` set; the provider mirrors it onto per-element shared values when the overlay paints
- completes or cancels the active session through a single `state` transition (`measuring → active → completing | cancelling → cleared`)

### `NativeTransitionHost`

- lives above the native stack in `FullWindowOverlay`
- reports when the host is presented and ready: iOS emits `onPresentationReady` from a `CATransaction` completion block after the mount commit, Android emits from the first `dispatchDraw` after activation (with a two-frame fallback)
- gives the JS runtime a reliable handoff point before revealing the pushed screen
- retains one private host frame for two ticks during teardown to cover the native/React commit boundary; this is not per-element capture and is never exposed to renderers

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
7. The coordinator captures `getPresentation()` for every paired element and stores frozen `sourcePresentation`/`targetPresentation` on each pair, then promotes the session to `active`.
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

### Back-navigation interception

Any back action on a screen that was entered through `useChoreographyNavigation.navigate()` plays the reverse animation, even if the app does not call `goBack()` through the hook. This is achieved by a `beforeRemove` listener installed inside `ChoreographyScreen`:

- on every back attempt (header back, hardware back, programmatic `navigation.goBack()`, swipe-back), the listener inspects the current route's `_choreographyGroup` / `_choreographySourceScreen` params (set by the forward `navigate()`)
- if those params are present and no session is already running, the listener calls `e.preventDefault()`, runs `runReverseTransition(...)`, and re-dispatches `e.data.action` once the choreography has handed off to the spring
- if a session is already running (e.g. `useChoreographyNavigation.goBack()` initiated this back), the listener defers to the existing logic
- `runReverseTransition` lives in `src/core/runReverseTransition.ts` and is shared by both the listener and the standalone-reverse path inside `useChoreographyNavigation.goBack`, so the two entry points produce identical behavior

## Visibility And Readiness Rules

Three separate concepts control whether the user sees real screen content during a transition:

- **`pendingTargetScreenId`**: marks the future target so its phase resolves to `preparing` before the session is `active`, which keeps real content at `opacity: 0` until the overlay has taken over
- **Overlay readiness**: both the native host and overlay content must report ready before the pending state is cleared and the spring starts
- **Reversible visibility model**: once the session is `active`, `deriveScreenOpacity(direction, role, phase, progress)` maps source/target roles to collapsed/expanded screens and evaluates the same expansion-progress curve in both directions on the UI thread. Per-element shared values still hide individual `SharedElement`s on top of the screen-level opacity rule.

## Measurement Model

The runtime measures live views but avoids timing-based polling where it can.

- source elements are measured before navigation
- target registration is awaited through registry subscription events
- target metrics from previous sessions are cached per `(screenId, id)` and validated with one batched read on repeated opens; mismatches fall back to the stability loop
- startup waits are biased toward structural elements such as the container and icon
- reused reverse paths can refresh active session metrics after the source screen becomes visible again

First-open structural measurement is still the largest startup cost in the current architecture.

## Progress And Companion Motion

The shared progress value is the contract between the transition runtime and companion screen motion.

- `useChoreographyProgress()` exposes the shared progress value and common derived behaviors
- the progress hook also exposes the current screen role, lifecycle phase, direction, group, and session identity
- `useLatchedReveal()` keeps staged content visible once it has crossed its reveal threshold
- `useStaggeredReveal()` creates per-item reveal styles from the same session progress
- default screen crossfade occupies progress `0` to `0.4`, before the default companion reveal window of `0.7` to `1`. Custom reveal windows may overlap the screen fade; their visible opacity is multiplied by the parent screen opacity.
- reversing or cancelling a gesture retraces the same active-state opacity curves. Equal progress produces equal visual state, but the default forward and reverse springs have different speeds.
- `settleTransition()` lets a screen settle to its current endpoint as soon as the user starts scrolling or otherwise interacting
- `useInteractiveTransition()` prepares a backward session and maps gesture-normalized progress (`0` detail, `1` back complete) onto the existing semantic progress value (`1` detail, `0` list)
- interactive sessions can project normalized release velocity through `settle()` and preserve that velocity in the endpoint spring

## Readiness And Live Payloads

`ScreenReadinessRegistry` combines screen layout readiness with reference-counted application blockers. `ChoreographyScreen ready={false}` and `useChoreographyBlocker().acquire()` both hold the existing pre-transition readiness wait; neither creates a separate transition lifecycle.

Normal pairs render frozen `ElementPresentation` values. `SharedElement.Live` is a distinct opt-in path: `react-native-teleport` physically reparents one React-owned native subtree into a pair-specific overlay host during animation and into `SharedElement.LiveTarget` at the settled detail endpoint. The original owner must remain mounted, and ordinary shared elements remain preferable when live native state is unnecessary.

## Navigation Session Controller

`NavigationSessionController` owns navigation locking, last-request queueing, animation tokens, and active-session validation outside React. `useChoreographyNavigation` retains platform effects and Reanimated scheduling while delegating mutable session decisions to this directly testable controller.

## Extending The Library

When adding new behavior, keep these boundaries intact:

- element registration and pairing belong in the engine layer
- screen visibility and readiness belong in the provider / screen wrapper layer
- visual interpolation belongs in overlay stand-ins and progress hooks
- screen-specific composition belongs in the consuming app, not in the core runtime

Typical extension points:

- add a new reusable `SharedElementTransition` renderer by composing the exported stand-in primitives or custom overlay content in app code
- reusable surface, stretch, and plain-text recipes live in `src/transitions/` and are exported from the root, core, and Expo Router entries; examples import them instead of maintaining duplicate renderers
- recipe renderers consume frozen presentations and extract scalar inputs before worklets; forward and backward should retrace the same appearance at equal expansion progress when their measured endpoints are unchanged
- `StandInElement` owns single-content frame geometry; `StandInContainer` adds surface color, radius, and static expanded-side shadow presentation. Neither performs content crossfading.
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

The provider applies the resolved config inside a `useEffect` so toggling debug never re-creates the registry or coordinator. The logger keeps a bounded ring buffer, suppresses identical consecutive lines as `... (×N)` unless `logEveryFrame` is set, and gates verbose measurement traces behind `level: 'trace'`. The package also exports a `setDebugEnabled` helper for toggling logging from outside the provider.

## Files Worth Reading

- `src/components/ChoreographyProvider.tsx`
- `src/core/TransitionCoordinator.ts`
- `src/core/TransitionOverlay.tsx`
- `src/native/NativeTransitionHost.tsx`
- `src/hooks/useChoreographyNavigation.ts`
- `src/hooks/useChoreographyProgress.ts`

## Current Pressure Points

- first-open startup still depends on live target measurement (repeated opens use the validated metrics cache)
- native-stack's built-in swipe progress is not wired automatically; custom gestures can use `useInteractiveTransition`
- ordinary renderers operate on frozen React content rather than captured native pixels; live native state requires the explicit teleport path

See [limitations-and-next-steps.md](limitations-and-next-steps.md) for the current support boundaries and roadmap.
