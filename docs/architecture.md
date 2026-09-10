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

[src/entries/index.test.ts](../src/entries/index.test.ts) checks that entries contain only exports, that shared value and type exports are identical across integrations, and that their transitive source imports preserve navigation dependency isolation.

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
  ScreenChoreographyPreparation
    Batched mounted-layout validation before forward pairing
  ScreenChoreographyView
    iOS Fabric component above stack containers
    Android Fabric view group above stack containers
```

## Why The Runtime Is Split This Way

The library uses a hybrid runtime because different parts of the problem have different ownership requirements:

- JavaScript / TypeScript owns registration, pairing, screen readiness, and navigation orchestration.
- Reanimated owns progress and visual interpolation on the UI thread.
- Native validates mounted destination layout and owns the overlay host so the transition surface is actually above the native-stack containers.

This gives the library a flexible public API while avoiding the most common z-order and reveal-timing failures that appear with screen-level navigator animations.

## Core Runtime Pieces

### `ChoreographyProvider`

- creates the registry and transition coordinator
- tracks the active session and pending target screen
- manages screen readiness state
- fires `onTransitionStart` and `onTransitionEnd` lifecycle callbacks for active sessions
- renders `TransitionOverlay` inside `FullWindowOverlay`
- wraps the overlay in `NativeTransitionHost`
- maintains an `ElementVisibilityRegistry` of per-element `SharedValue<number>` entries (1 = hidden, 0 = visible), with the last scheduled visibility tracked on JS
- `unregisterElement` skips SV cleanup when the key is in the coordinator's active hidden set, preventing mid-transition remounts from flashing elements visible
- separates React subscriptions by responsibility:
  - **`ChoreographyActionsContext`** — stable callbacks (`registerElement`, `unregisterElement`, `setScreenReady`, `unregisterScreen`, `waitForScreenReady`, `isElementHidden`). Identity is preserved across all session changes, so subscribers in this context never re-render because of transition state.
  - **`ChoreographyContext`** — the volatile transition state (`activeSession`, `pendingTargetScreenId`, `progress`, lifecycle async helpers). Components that need to react to the current session subscribe here.
  - **`ChoreographyControlsContext`** - stable progress and screen-qualified settle commands. `useChoreographyControls()` binds the command to the current screen; the provider resolves the latest active session and validates progress ownership when it is invoked.
  - **`ChoreographyProgressContext`** - memoized screen-visible fields (`role`, `phase`, `direction`, `isActive`, group and session identity). `ChoreographyScreen` scopes this context to its route instance. Pair and measurement changes do not notify progress consumers unless one of these fields changes. The provider supplies a default scope for consumers outside a screen.
- forwards a structured `debug` prop into the logger inside a `useEffect`, so toggling debug at runtime never re-creates registry / coordinator instances

### Hide / Reveal Handoff

The provider deliberately does **not** hide real elements when a session becomes `active`. Hiding is driven by the overlay's `useLayoutEffect` callback (`handleOverlayReady(sessionId)`) and the native host presentation ack (`handleHostPresentationReady`). The second acknowledgment calls `syncHiddenElements()` only after both content and native presentation are ready. Morph-image renderers block content readiness until `Image.onLoad`; each overlay session has its own readiness gate, so a late event from a replaced session cannot release the new one. The UI visibility batch hides the originals and enables the session's stand-in layers together. Live layers bypass that readiness opacity gate because their sole native view moves into the overlay in the mounting commit; gating it would hide the only visible instance before acknowledgment. A 150ms safety-net inside `waitForOverlayReady` permits a missing native acknowledgment only when content is ready; otherwise navigation completes without choreography.

`syncHiddenElements()` compares desired visibility against the registry's last scheduled values and sends only changed entries in one UI worklet. Repeated presentation acknowledgements with the same hidden set schedule no work. Comparisons do not read shared values on JS. Ordered hide/reveal batches preserve cancellation and replacement behavior; unregistering a hidden element retains its shared value, and cleanup reveals retained entries before releasing them. The presentation callbacks and 150ms safety net remain the only hide triggers.

At a forward animation's endpoint, the UI runtime reveals the ordinary shared elements before scheduling JS completion. Stand-in-only sessions hide their overlay layers immediately. Mixed live/stand-in sessions retain all overlay layers until React teardown: the live view still sits above the destination until reparenting, so its companion text must remain above it too. Reverse commits disable that unconditional handoff: `ReverseTransitionHandoff` combines the animation endpoint and the navigation adapter's presentation acknowledgment in shared UI state. Whichever signal arrives last reveals the ordinary shared elements and assigns input ownership to the destination in one UI worklet. If navigation is already presented, a busy JS runtime cannot delay that endpoint handoff. JS subsequently releases navigation bookkeeping and removes the overlay. Session and animation ownership reject stale completion; reclaiming a visually completed session restores its hidden elements and stand-in layers. Timed reverse settlements and gesture cancellations complete from the owned Reanimated callback; no JavaScript deadline forces the animation to its endpoint. Readiness timeouts remain separate from animation completion.

Live pairs are different: their only mounted native subtree is still inside an overlay portal until React reparents it. Their overlay layers remain visible at the endpoint until that commit. Completion visibility is therefore applied per pair, not to the whole overlay, so mixed sessions can release stand-ins without hiding live content prematurely. The session gate still hides stale overlay instances in both modes.

### `ChoreographyScreen`

- keeps the supplied `screenId` as a logical name while adapters supply the navigator route key as its internal instance identity; registration, readiness, visibility, and lineage use that instance key
- reads volatile transition state from `ChoreographyContext` and lifecycle callbacks (`setScreenReady`, `unregisterScreen`) from `ChoreographyActionsContext` so its registration effect depends only on stable identities and never re-runs on session changes
- reports layout readiness from `onLayout` when the optional native preparation module is available; forward preparation then validates the mounted native views. Without the module, it retains the double-RAF readiness gate
- drives screen-level visibility through a single direction-agnostic model derived from `(direction, role, phase, progress)`. The pure helpers live in `src/core/screenVisibility.ts` and are unit-tested:
  - **`role`** is one of `source`, `target`, or `inactive` and comes from `getScreenRole(session, screenId)`
  - **`phase`** is one of `idle`, `preparing`, `active`, `completing`, `cancelling` and comes from `getSessionPhase(session, pendingTargetScreenId, screenId)` (treats `state: 'measuring'` and a matching `pendingTargetScreenId` as `preparing`)
  - progress always means `0 = collapsed/list`, `1 = expanded/detail`; direction and role identify which physical side a screen represents, not a separate animation clock
  - during `active`, expanded-screen opacity is `clamp(progress / 0.4, 0, 1)` and collapsed-screen opacity is its complement. The expanded screen is the forward target or backward source.
  - during `preparing`, the forward target is hidden; the backward target and both source roles remain visible. Inactive screens and terminal phases retain normal visibility.
  - participating screens block pointer events (`shouldBlockInteraction`) during `preparing` and `active`. A shared UI input owner can release the acknowledged reverse destination while React still has an active session. The plain outer view blocks input during preparation; the animated inner view controls the active-phase handoff.
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
- for forward preparation with the native module, validates the mounted screen and all participating target views across two stable native passes, then obtains coordinates through one existing batched measurement
- retains cached target validation for backward preparation and the legacy forward path; the cache is keyed by logical screen layout, group, and element so new route instances retain this optimization without sharing registrations
- discovers expected IDs from the source screen's group, creates only matching source/target pairs, and freezes a `sourcePresentation` and `targetPresentation` onto each pair before promoting the session to `active`
- can refresh source or target metrics for the active session in place
- maintains the `hiddenElements` set; the provider mirrors it onto per-element shared values when the overlay paints
- completes or cancels the active session through a single `state` transition (`measuring → active → completing | cancelling → cleared`)

Declarative enter/exit tracks explicitly allow a missing collapsed or expanded
endpoint. Pair discovery includes destination-only tracks after readiness, and
waits for matching registrations only for source elements requiring a pair.
Absent endpoints are plain session data with `present: false`; they never
register views, take measurements, enter the metric cache, or hide real content.
Shared and live transitions keep their existing pairing requirements. The final
validated target batch is reused for pairing when its native refs still match;
changed refs invalidate that reuse. Native forward preparation also rechecks
explicit application readiness and operation ownership before activation.

### `ScreenChoreographyPreparation`

This optional TurboModule is a mounted-layout barrier for forward preparation.
After application readiness and target registration, it resolves the destination
screen and every participating target tag together. The native views must remain
attached in the same window, the targets must belong to the screen, identities
must remain current, and all measured bounds must be nonzero with no pending
ancestor layout. Each screen and target rectangle must remain stable within 0.5
layout units across two distinct native passes. Android samples at pre-draw; iOS samples
on display-link ticks after flushing pending window and screen layout.

The acknowledgment is followed by one `measureElementsBatched` call, preserving
the existing React Native/Reanimated window-coordinate contract. JavaScript node
identities and native tags are checked after the acknowledgment, after that
measurement, and before the prepared metrics are reused. The normal native path
skips the screen's two JavaScript frame waits and Android navigation's extra
JavaScript frame wait; it also replaces the legacy target stability loop.

An early native failure restores those conservative frame waits and the existing
measurement fallback. A native 500ms deadline, or its 550ms JavaScript guard,
ends preparation instead of starting another long fallback wait. Cancellation,
screen removal, and module invalidation clean up pending native work. An app
binary without the optional module retains the legacy path; enabling the module
after a library upgrade requires rebuilding the native app.

Two stable mounted samples do not guarantee that future React commits, image
loads, fonts, or application data cannot change the layout. `ready` and application
blockers remain separate requirements and are rechecked before activation. This
barrier neither captures nor hides content and does not replace the overlay's
presentation acknowledgment. Backward preparation and the retained reverse
handoff keep their existing paths.

### `NativeTransitionHost`

- lives above the native stack in `FullWindowOverlay`
- reports when the host is presented and ready: iOS emits `onPresentationReady` from a `CATransaction` completion block after the mount commit, Android emits from the first `dispatchDraw` after activation (the provider retains the 150ms timeout fallback)
- gives the JS runtime a reliable handoff point before revealing the pushed screen
- on Android, retains its dismissal frame across two `postOnAnimation` callbacks rather than two main-queue callbacks, which can both execute before a draw
- retains one private host frame for two ticks during teardown to cover the native/React commit boundary; this is not per-element capture and is never exposed to renderers

### `TransitionOverlay`

- renders stand-ins for the active session
- picks the correct stand-in strategy for each animation type
- reports when overlay content is ready to render

The overlay supplies immutable, direction-normalized anchor geometry for shared
pairs and marks ordinary renderer subtrees with `useTransitionPresentation()`.
Declarative renderers use semantic expansion progress in both directions. Their
fixed endpoint content uses transforms/crossfades; surface and image clip frames
can resize independently. Existing renderer components remain supported.

## Forward Transition Lifecycle

1. A source screen calls `navigate()` from `useChoreographyNavigation`.
2. Source elements are pre-measured while they are still mounted and visible.
3. The target screen is marked as pending so its real content stays hidden.
4. Navigation pushes the target route with stack animation disabled. The adapter resolves its route key from navigation state before waiting for that instance's readiness. Until resolution, the logical pending-target gate applies only to the focused destination and excludes the source instance.
5. Target `SharedElement`s register as the destination mounts.
6. After application readiness and target registration, `TransitionCoordinator` awaits two stable native layout passes and one coordinate batch when the preparation module is available. Otherwise it uses the legacy readiness and target measurement path.
7. The coordinator captures `getPresentation()` for every paired element and stores frozen `sourcePresentation`/`targetPresentation` on each pair. It rechecks readiness, operation ownership, and prepared-view identities before promoting the session to `active`.
8. `TransitionOverlay` mounts and `NativeTransitionHost` reports presentation ready. The second acknowledgment runs `syncHiddenElements()` after both content and native presentation are ready. The 150ms fallback requires content readiness; unready content completes navigation without choreography.
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

- detail elements are measured again and a new backward session is created
- accepting `finish()` transfers settlement ownership to the provider's `ReverseTransitionController`
- on iOS, the outgoing route stays mounted through the reverse animation with its shared elements hidden. The controller commits Back at the animation endpoint, then releases the overlay after removal is confirmed. This avoids UIKit snapshots retaining duplicate shared content; iOS does not mount a retained screen snapshot for reverse commits
- on Android, for stand-in sessions, `ScreenChoreographySnapshotView` captures the inner outgoing content view and hides that view atomically; the retained image sits under the paired overlay renderers and reproduces the screen's opacity curve
- after native capture acknowledgment, the remaining animation and navigation dispatch run concurrently; the route may unmount without cancelling provider-owned settlement
- both adapters subscribe before dispatch and accept navigation as soon as the outgoing route is removed from state. A matching `transitionEnd` observed before removal is diagnostic only, not a handoff requirement. Mounted `ChoreographyScreen` wrappers forward parent-navigation events for nested destinations, scoped to their owning navigator
- the shared UI gate releases visuals and input only after animation completion and confirmed route removal; React session teardown follows. Native-stack should use `animation: 'none'` to avoid its own animation and input blocking
- failed capture (150ms maximum wait), missing refs, and sessions containing live pairs retain the animate-then-pop ordering. Live portals keep their original React owner and are not rasterized
- missing navigation state events use a 700ms safety timeout to recheck removal; observed removal clears it immediately without waiting for native presentation. The adapter reports removal separately from presentation so an already removed source is never restored. A prevented action cancels back to the source

### Back-navigation interception

Both adapters use `usePreventRemove` in `ChoreographyScreen` and look up provider-owned lineage by the current route key. A single-route Back can run a reverse transition when its previous route matches the recorded source route key. Multi-route removals and unrelated routes do not borrow that transition.

`runReverseTransition` acquires the provider's preparation lock and delegates to the same provider-owned reverse commit used by interactive finish and programmatic reverse. The intercepted original action is redispatched through the adapter's navigation acknowledgment contract. Unavailable pairing falls back to the original action while the preparation still owns its session. Explicit hook Back during an active forward transition retains the existing pop-first reuse path. Built-in native swipe progress is not connected to choreography progress.

## Visibility And Readiness Rules

Three separate concepts control whether the user sees real screen content during a transition:

- **`pendingTargetScreenId`**: marks the future target so its phase resolves to `preparing` before the session is `active`, which keeps real content at `opacity: 0` until the overlay has taken over
- **Overlay readiness**: both the native host and overlay content must report ready before the pending state is cleared and the spring starts
- **Reversible visibility model**: once the session is `active`, `deriveScreenOpacity(direction, role, phase, progress)` maps source/target roles to collapsed/expanded screens and evaluates the same expansion-progress curve in both directions on the UI thread. Per-element shared values still hide individual `SharedElement`s on top of the screen-level opacity rule.

## Measurement Model

The runtime measures live views but avoids timing-based polling where it can.

- source elements are measured before navigation
- target registration is awaited through registry subscription events
- native forward preparation checks mounted screen and target geometry together across two stable native passes, then reads target coordinates in one batch
- backward preparation and the legacy forward path validate cached target metrics per `(logical screen layout, groupId, id)` against the actual destination instance with one batched read; mismatches fall back to the stability loop
- the legacy stability loop gives structural elements such as the container and icon additional settling time on first open
- reused reverse paths can refresh active session metrics after the source screen becomes visible again

Native layout validation establishes current mounted readiness, while the final
coordinate batch preserves renderer geometry. Their latency, navigation and
application readiness, and overlay presentation must be measured separately to
attribute startup cost; the barrier does not impose a preparation-time guarantee.

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

`makeLiveTransition` adapts a custom live renderer to that same lifecycle. The
adapter owns the screen-pair-scoped `PortalHost`, passes it as required children,
and removes presentation content from the custom renderer's endpoint inputs.
Its factory result is explicitly live and defaults to zIndex 100. Both endpoints
accept that result; departing-endpoint transition selection remains unchanged,
so callers reuse one object for forward and reverse motion. Factory calls belong
outside render or in a configuration-dependent memo, preserving adapter identity.

Live endpoint metadata is captured by reference with `ElementPresentation` and
forwarded from the session's frozen presentations. Updating props does not
re-register an element or alter an active session's captured reference. SharedValue
objects contained in metadata remain live; there is no deep snapshot. The public
ordinary `SharedElement` props do not expose the internal metadata plumbing.
Endpoint wrapper style, live portal style, and receiving host style compose
independently. Custom renderers are responsible for endpoint geometry continuity;
host naming, settlement, overlay visibility handoff, and reverse commit timing
retain the existing lifecycle.

## Navigation Session Controller

Each provider owns one `NavigationSessionController`. Forward navigation, intercepted Back, and interactive Back share its preparation lock. Lock releases can be qualified by a token so stale cleanup cannot unlock a newer request. Queued requests carry their source route key and can only replay on that instance; unregistering the source discards its queue and invalidates unfinished preparation. The provider updates the controller's active session synchronously with coordinator notifications.

`useChoreographyNavigation` retains platform effects and Reanimated scheduling while delegating mutable session decisions to this directly testable controller. Live portal owners and hosts are also namespaced by route endpoints. Logical screen names are metadata used for destination hints and validated layout caching, not lifecycle identity.

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


### Image readiness timeout

Morph images hold overlay readiness until image loading completes. Releasing a child blocker waits until the layout-effect pass finishes,
so Strict Mode cleanup/replay cannot report an unfinished image as ready. At the
150ms handoff deadline, a missing native acknowledgment may fall back only when
content is ready. If content is unready, forward navigation reveals the already
pushed destination without choreography; Back performs an ordinary pop. The
original image is not hidden in favor of an unready overlay.
