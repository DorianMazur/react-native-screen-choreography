# Navigation Follow-Up Review

Review date: 2026-09-05. Scope: React Navigation native-stack and Expo Router. Intended follow-up implementer: 5.6 SOL.

This is a second review of the current working tree, not a completion certificate for the earlier handoff. It also records the reverse-animation regression reported during this review and the fix applied here. Preserve the user's other uncommitted changes.

## 1. Reported Regression: Fixed

### Missing reverse animation and broken listening-room layout

The running Expo Router example reproduced both symptoms on an iPhone 17 Pro simulator, iOS 26.5. Forward preparation succeeded. Close created a backward session, resolved its live pair, waited for the overlay, and dispatched the pop. Spring construction then threw:

```text
[BackIntercept] popAction returned, scheduling spring
[BackIntercept] reverse transition error: [Worklets] Cannot copy value of type `FiberNode`.
[Coordinator] Cancelling transition "session_16"
```

The reverse callback referred to `reverseSession.id`. Worklets captured the entire session object, including frozen React content and its non-serializable development ownership data. Session-qualified completion was the right improvement, but capturing the containing object broke native execution. Mocked `withSpring` tests did not exercise serialization.

The failure handler cancelled the backward session after navigation had already popped. Backward cancellation restores progress to `1`, so the persistent player could return to a compact host while its contents remained expanded. This explains the reported layout without requiring a player redesign.

**Applied fix:** extract `const sessionId = reverseSession.id` outside the worklet and capture only that scalar in [../src/core/runReverseTransition.ts](../src/core/runReverseTransition.ts).

**Added coverage:** [../__tests__/reverseWorklet.test.js](../__tests__/reverseWorklet.test.js) invokes the real TypeScript and Worklets Babel transforms and checks the generated closure. Keep this in addition to the mocked lifecycle tests in [../__tests__/runReverseTransition.test.ts](../__tests__/runReverseTransition.test.ts).

After the fix, the same device logged a successful reverse spring callback followed by completion of its own session. The listening-room player returned to its compact layout. A paused player remained paused after opening and closing the expanded screen.

Do not revert session-qualified completion, swallow this serialization error, reset global progress on every screen mount, or patch the player's artwork dimensions to hide this failure.

## 2. What Has Landed

These improvements are present in the reviewed source:

- Coordinator preparation has operation-generation checks after asynchronous measurement and target waits.
- Completion and cancellation accept an expected session ID; reverse navigation dispatch is guarded against a second pop after an exception.
- Forward preparation waits for screen readiness on both platforms and honors a false readiness result.
- Screen layout readiness reads the latest `ready` prop through a ref.
- Readiness unregister/dispose settles waiters; provider teardown settles overlay waiters.
- Navigator removal code moved out of `ChoreographyScreenBase` into the adapters and a shared removal hook.
- The bare example now lives under `examples/react-navigation`.

These are meaningful changes, but some implement only part of the original requirement. In particular, moving a listener did not change the unsupported native-stack prevention mechanism. The earlier handoff is historical; do not reapply its already-completed edits blindly.

## 3. Remaining Findings

Except for the regression above, the following are source-level findings and missing coverage, not claims of new on-device reproductions in this pass.

### R1. High: Native-stack removal still uses direct event prevention

Owners: [../src/components/ChoreographyScreen.tsx](../src/components/ChoreographyScreen.tsx), [../src/expo-router.ts](../src/expo-router.ts), [../src/hooks/useChoreographyScreenRemoval.ts](../src/hooks/useChoreographyScreenRemoval.ts).

Both adapters still install `beforeRemove` listeners and call `event.preventDefault()`. React Navigation documents that this does not work properly with native-stack and recommends `usePreventRemove`. This is a remaining compatibility issue, **not the cause of the serialization regression fixed above**.

Implementation:

1. Verify the installed public removal-hook exports in each navigator. Use React Navigation's hook in its adapter and Expo's public equivalent in the Expo adapter. Do not cross their runtime contexts.
2. Retain the exact blocked action and continue it once through the supported mechanism. Keep core transition preparation independent of navigator action types.
3. Coordinate with application removal blockers. A reset, replacement, or multi-pop must not be treated automatically as a return to the last choreography source.
4. Disable unintegrated native interactive gestures in the examples where required by the documented support policy. This does not replace fixing removal interception.

Acceptance: app Back/Close, header back, Android back, repeated back, nested stacks, reset, multi-pop, and a second application blocker. Verify both adapters on devices. Reference: <https://reactnavigation.org/docs/navigation-events/#beforeremove>.

### R2. High: Ownership guards do not cover every shared-progress write

Owners: [../src/hooks/useInteractiveTransition.ts](../src/hooks/useInteractiveTransition.ts), [../src/hooks/useChoreographyNavigation.ts](../src/hooks/useChoreographyNavigation.ts), [../src/core/runReverseTransition.ts](../src/core/runReverseTransition.ts).

Session-qualified completion protects the coordinator, but some callbacks mutate the shared progress value before ownership is checked. Interactive duration fallbacks write `0` or `1` before calling their guarded RN continuation. The active-session effect clears the old interactive session ID without clearing its settlement timer. A timer from A can therefore change B's progress even when B correctly rejects A's completion.

The navigation hook's active-forward Back branch also awaits a frame and metric refresh, then schedules a spring without rechecking the original session at each boundary. Creating a new local animation token at the end of stale work does not establish ownership over a provider-wide session.

Implementation: cancel obsolete timers when ownership changes; check ownership before every progress write, animation scheduling, and navigation dispatch. Use a provider/coordinator-owned operation identity and a UI-readable scalar token where UI-thread work requires it. Capture primitives or shareable handles, never the full session or React context object.

Acceptance: A's delayed timer/worklet callback/RAF after B starts leaves B's progress, route, pending target, hidden set, and completion count unchanged. Include interruption between measurement and the final RAF. Add real worklet-transform coverage alongside mocked tests where capture contents matter.

### R3. High: Provider teardown is not effect-replay-safe

Owners: [../src/components/ChoreographyProvider.tsx](../src/components/ChoreographyProvider.tsx), [../src/core/TransitionCoordinator.ts](../src/core/TransitionCoordinator.ts).

The coordinator callback is installed only inside `if (!coordinatorRef.current)`. Provider effect cleanup calls `dispose()`, which replaces that callback with a no-op. React Strict Mode can replay effect setup/cleanup/setup while retaining the ref. The effect's next setup does not reconnect the callback, leaving an existing coordinator unable to publish sessions to the provider.

Implementation: make subscription setup and teardown symmetrical and re-establish the callback on effect setup. Keep stable runtime identity and registration dependencies. Decide separately how final disposal rejects asynchronous work. Do not fix this by disabling Strict Mode or rebuilding the registry on every provider render.

Acceptance: mount under Strict Mode, allow effect replay, perform forward and reverse navigation, and verify provider state and overlay publication. Real unmount must still settle waiters and prevent late state updates.

### R4. High: Navigation preparation still has per-hook locks

Owners: [../src/hooks/useChoreographyNavigation.ts](../src/hooks/useChoreographyNavigation.ts), [../src/core/NavigationSessionController.ts](../src/core/NavigationSessionController.ts), [../src/hooks/useInteractiveTransition.ts](../src/hooks/useInteractiveTransition.ts).

Each navigation-hook instance constructs its own controller. Two callers can acquire independent locks before either premeasurement finishes or provider state renders. Coordinator cancellation handles overlapping sessions later, but cannot undo two already-dispatched routes or prevent stale pending-target cleanup.

Forward preparation lacks an operation check before dispatch after premeasurement. Interactive begin checks its begin token only after `startTransition`, so unmount while premeasurement is pending can still create a session before cancelling it.

Implementation: place operation arbitration in the existing provider-owned domain. Validate identity after each await, before dispatch/start, and before clearing pending state. Keep hook-local UI state local. No public external-runtime factory is needed.

Acceptance: two independent hook consumers navigate in the same tick; unmount during premeasurement; A's readiness failure arrives after B starts. Assert at-most-once authorized dispatch and no cleanup of B by A.

### R5. Medium: Overlay acknowledgement still has incomplete identity

Owner: [../src/components/ChoreographyProvider.tsx](../src/components/ChoreographyProvider.tsx), with its native host bridge/spec.

`handleHostPresentationReady` accepts no session token and attributes the event to whichever session is current. The coordinator change callback clears both acknowledgement refs even on updates to the same session. `waitForOverlayReady` can register a waiter for an already-obsolete ID; its timeout resolves `true` even when that ID is no longer active.

Implementation: preserve readiness for same-session metric updates, reject stale waits immediately, and carry presentation identity through the native request/acknowledgement boundary. Keep the existing paint-driven hiding rule and explicit 150ms fallback for the current session only.

Acceptance: delayed native acknowledgement for A after B starts; same-session metric refresh; waiting after cancellation; unmount with outstanding waiters. Verify no stale success and no premature hiding of B's elements.

### R6. Medium: Screen scope and route-instance identity remain unresolved

Owners: [../examples/shared/gallery/GalleryDetailScreen.tsx](../examples/shared/gallery/GalleryDetailScreen.tsx), [../src/hooks/useReactNavigationChoreography.ts](../src/hooks/useReactNavigationChoreography.ts), [../src/hooks/useChoreographyProgress.ts](../src/hooks/useChoreographyProgress.ts), [../src/components/ChoreographyProvider.tsx](../src/components/ChoreographyProvider.tsx).

The gallery screen calls progress/navigation hooks before returning its own `ChoreographyScreen`. A provider returned by a component cannot supply context to hooks already called in that component. React Navigation falls back to route names, and Expo's demo wrapper accepts an explicit name, concealing part of this problem. Progress role/settlement still sees the wrong scope.

Reusable names such as `GalleryDetail` are also used as readiness and lineage keys. Multiple mounted route instances can overwrite each other. `unregisterScreen` does not prune lineage. The live portal names use group/element identity without route-instance identity.

Implementation: place adapter screen scope above shared screen components, then explicitly design request-to-route-instance association in each adapter. Do not treat a route name or pathname as an instance ID. Prune lineage according to instance lifetime without losing frozen data still needed by an active transition.

The progress hook also calls `completeTransition` even when settling toward the source, and supplies an endpoint for unrelated screens. Define participant settlement explicitly: target completion, source cancellation, unrelated no-op, with matching navigation policy.

Acceptance: hooks observe the intended screen scope; duplicate detail instances; custom screen IDs; reset/deep link after an earlier visit; source/target/nonparticipant settlement.

### R7. Medium: Staggered styles still hide a hook in a regular function

Owner: [../src/hooks/useChoreographyProgress.ts](../src/hooks/useChoreographyProgress.ts).

`getItemStyle(index)` calls `useAnimatedStyle` with a Rules of Hooks suppression. The three unconditional calls in the gallery happen to have stable order, but the public API invites loops, conditional calls, or render-item callbacks that break hook ordering.

Implementation: introduce an explicitly named per-item hook used at component top level, or a component that owns its animated style. Migrate the example, document compatibility/deprecation, and remove the suppression. Do not replace it with a dynamic loop of hooks.

Acceptance: adding/removing/reordering list items preserves hook order and styles; public examples show legal usage.

## 4. What Is the Shared Runtime File?

[../examples/shared/runtime.tsx](../examples/shared/runtime.tsx) is a **demo dependency-injection facade**, not the library's animation runtime. The actual transition runtime is owned by `ChoreographyProvider` and its coordinator/registries.

Each app imports a configuration module for its side effect:

- [../examples/react-navigation/src/exampleRuntime.ts](../examples/react-navigation/src/exampleRuntime.ts) selects root-package components/hooks and React Navigation commands.
- [../examples/expo-router/src/exampleRuntime.ts](../examples/expo-router/src/exampleRuntime.ts) selects the Expo subpath and maps demo destinations to Expo hrefs.

Both call `configureExampleRuntime(...)`, which replaces one module-global object. Shared screens import wrapper components/hooks that read that object and forward every call to the chosen implementation.

### Is it needed?

**Needed by the current callers: yes. Necessary architecture: no.** Deleting it immediately breaks shared-screen imports and shell initialization. Replacing every import with the package root is also wrong: that root imports the React Navigation adapter, while Expo needs its own public navigation contexts.

There is currently no public `/core` export in [../package.json](../package.json). Add the neutral boundary before removing the facade.

### Is it clean?

It is a workable transitional mechanism, but not a clean final boundary:

- Mutable singleton configuration makes behavior depend on import order and prevents isolated bindings within one module graph.
- It forwards neutral stand-ins, shared elements, helpers, and safe-area APIs that do not need navigator selection.
- It injects hook implementations dynamically instead of providing ordinary typed command values through React.
- It duplicates `SharedElement` static members and weakens component typing with casts and broad types.
- The shells still use `useNavigation<any>()` and `as never` for Expo hrefs, hiding integration mistakes from the successful typechecks.

Two separate app processes do not overwrite each other's singleton. The concern is unnecessary global coupling and test/composition fragility, not a demonstrated cross-process collision.

### Safe replacement sequence

1. **Add an additive neutral package entry.** Export existing navigation-independent components, stand-ins, progress hooks, and types from it. Preserve the existing root and `/expo-router` APIs. Check emitted JavaScript and declarations after building.
2. **Move route scope into app-owned wrappers.** Each wrapper renders its adapter's `ChoreographyScreen` above a bindings component and the shared visual screen. Remove the inner wrapper from that shared screen in the same migration.
3. **Inject commands, not hooks.** A small demo React context carries `open`, `navigate`, and `goBack` callback values using the existing destination union. Bindings components call navigator hooks normally and provide their returned commands. Give the missing-provider case a clear error.
4. **Account for interactive navigation separately.** Both adapters expose navigation-aware interactive hooks. Bind these under the correct route scope and inject their result or wrap the shared gesture UI in a small adapter component. Do not claim that the navigation-aware hook becomes neutral merely by re-exporting it.
5. **Use direct neutral imports in shared UI.** Import safe-area primitives directly from their library. Ensure Metro still resolves React, Reanimated, Worklets, and native peers to the consuming app's versions.
6. **Remove the singleton last.** Delete the forwarding facade and side-effect configuration modules only after all shared consumers migrate. Use a typed stack param list and Expo's exported href types instead of `any`/`never` casts.

A private shared workspace package is optional; the important boundaries can be fixed while keeping `examples/shared` as a source directory. Do not combine this task with a wholesale Metro/dependency rewrite.

Acceptance: root and Expo imports remain isolated; shared screens consume one neutral implementation; screen-local hooks see their wrapper; no import-time runtime configuration is required; component identities remain stable; live playback survives reparenting; both app typechecks and native smoke tests pass.

## 5. Implementation Order and Guardrails

1. Keep the scalar-capture fix and real transform regression test from this review.
2. Fix R2-R4 with focused lifecycle/Strict Mode tests before expanding the public API.
3. Fix supported removal handling and acknowledgement identity, with device coverage for both adapters.
4. Replace the example singleton and correct hook scope. Treat route-instance association as an explicit contract, not a naming cleanup.
5. Repair the staggered-hook API and update integration documentation.

Keep changes small enough to validate separately. Do not alter native overlay ownership, frozen presentations, stable element registration, the plain-View pending-target gate, or paint-driven hiding as incidental cleanup. Do not introduce another navigator backend or a public runtime factory.

Lower-priority release checks still worth scheduling: actual RN/Reanimated/Worklets version tuples versus peer ranges; support for the declared debug-category filter; stale constant/config fields; package-build and CI coverage of both apps. These were not comprehensively re-audited in this focused follow-up and should not be marked fixed by inference.

## 6. Verification in This Pass

| Check | Result |
| --- | --- |
| Full `yarn test --runInBand` | 13 suites, 101 tests passed |
| `yarn typecheck` | Passed |
| `yarn workspace react-native-screen-choreography-example typecheck` | Passed |
| `yarn workspace screen-choreography-expo-router-example typecheck` | Passed |
| `yarn lint` | Passed after formatting the new test |
| Real Worklets transform | Reverse closure captures scalar `sessionId`, not `reverseSession` |
| Expo iOS live reproduction | Captured the original FiberNode error; after fix, reverse spring completed |
| Listening-room layout | Visually inspected compact returned artwork, text, and controls |
| Recorded flow replay | 22 steps, 16 non-echo checks/actions passed; no failures/errors/skips |

The flow is [../.argent/flows/live-player-return-e2e-20260905.yaml](../.argent/flows/live-player-return-e2e-20260905.yaml). It launches the installed Expo example, scrolls to the live demo, pauses playback, opens the player, closes it, and checks that Close disappears and Play track remains. It requires a working Expo development build and Metro serving the current source. Replay with `argent flow run live-player-return-e2e-20260905 --platform ios --device <simulator-udid>`.

The flow has semantic targets and no raw-coordinate exceptions. It verifies structural return and paused state, not animation smoothness by itself. Runtime logs and a visual screenshot were checked separately. No image-baseline assertion or frame-by-frame animation recording was added. Watchman emitted a recrawl warning during Jest; it did not fail the checks.

**Not verified here:** Android runtime, bare React Navigation native runtime, every demo's visual return, native-stack gesture/reset/blocker scenarios, Strict Mode mounting, package publication, or native rebuilds. The runtime fix is shared by both adapters, but that is not equivalent to executing both platform matrices.