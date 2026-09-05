# Navigation Compatibility Review and Implementation Handoff

Review date: 2026-09-05. Intended implementer: 5.6 SOL.

This is a review of the current working tree, including the uncommitted example migration. It is not a claim that the proposed integration has been implemented or tested on devices. Preserve the user's existing changes. Do not reset, revert, or regenerate the repository wholesale.

## 1. The Requirement That Controls the Work

The user's corrected requirement is compatibility with:

1. **React Navigation**, specifically `@react-navigation/native` and `@react-navigation/native-stack`.
2. **Expo Router**, currently SDK 57 in this repository.

**Scope correction:** Wix's `react-native-navigation` package is not a target. This revision supersedes the initial handoff's separate-root integration proposal. Do not add that package, replace the bare app's navigator, or introduce multi-root infrastructure for this task.

Both existing example apps use the intended navigators. The bare example lives at `examples/react-navigation`, matching the React Navigation package family rather than Wix's similarly named package.

Evidence: [App.tsx](../examples/react-navigation/src/App.tsx#L1), [bare app dependencies](../examples/react-navigation/package.json#L15), and [existing adapter](../src/hooks/useReactNavigationChoreography.ts#L1).

The current overall direction is appropriate: one provider around each app's navigation tree, a shared transition engine, and separate adapters importing their own navigator's public APIs. Improve these boundaries without replacing the architecture wholesale.

Desired outcome: the same two example apps with shared demo implementations, navigation-neutral core behavior, honest capability documentation, and thin adapters using public APIs. Preserve the existing React Navigation and Expo Router public APIs during migration unless the user approves a breaking release.

## 2. Findings, Ranked

### F1. P2: The Existing Adapter Split Is Appropriate but Incomplete

The provider currently owns registry, coordinator, progress, readiness, lineage, and the overlay in one React tree: [ChoreographyProvider.tsx](../src/components/ChoreographyProvider.tsx#L89).

That provider-owned model is suitable for both intended apps. Neither integration requires a public external-runtime factory, a store shared across separate React roots, or a replacement overlay backend merely to support the requested navigators.

The incomplete boundary is [ChoreographyScreenBase.tsx](../src/components/ChoreographyScreenBase.tsx#L24): it still receives a React Navigation-shaped navigation object, reads route metadata, and intercepts removal. Keep identity scope, visibility, and readiness in the base; move navigator-specific lifecycle behavior into the existing adapters. F4 describes the concrete removal-interception defect.

Keep the existing native host approach while validating its behavior in both apps. The important work is correct session ownership, route-instance identity, supported removal APIs, and independent package imports, not another navigation implementation.

### F2. P1: Cancelled Preparation Can Reactivate a Session

Location: [TransitionCoordinator.startTransition](../src/core/TransitionCoordinator.ts#L451).

`startTransition` installs a measuring session, awaits target registration/stability and batched measurement, then writes registry metrics, hidden elements, progress, and an active session without checking whether it still owns the operation. `cancelTransition()` does not invalidate those continuations. A second start can also supersede the first while the first continues.

**Reproduced in isolation:** start a transition, suspend target readiness, cancel it, release readiness. The actual coordinator reactivates the cancelled session and hides two elements. Measurement/readiness boundaries were stubbed; this was a control-flow reproduction, not a native rendering test.

Fix: operation generation or cancellation token owned by the shared runtime/coordinator. Check ownership after every await and before every side effect, including failure cleanup. An obsolete operation must not activate itself, clear a newer pending target, modify current visibility, or abort its replacement.

Tests: cancellation while waiting for registration; cancellation during stable measurement; overlapping A/B starts finishing in both orders; empty-pair failure from A after B becomes active; runtime disposal while preparing.

### F3. P1: Reverse Completion Is Not Session-Safe, and Failure Can Pop Twice

Location: [runReverseTransition](../src/core/runReverseTransition.ts#L26).

The spring callback calls unqualified `completeTransition()`, unlike the token checks in parts of the navigation hook. If an old completion reaches JS after a replacement session starts, it can complete that replacement.

The helper calls `popAction()` before constructing the spring and calls it again in `catch`. An exception from animation setup after a successful pop results in two pop calls. Failure after session creation also has no explicit owned-session cleanup.

**Reproduced in isolation:** an old stored spring callback completed a replacement session; a mocked animation-construction error caused two pop invocations.

Fix: session-qualified completion/cancellation and an at-most-once navigation commit. Treat dispatch, observed route removal, animation cancellation, and transition cleanup separately. React Navigation/Expo imperative dispatch is not a promise that guarantees native completion; use the supported lifecycle/state signals and do not blindly dispatch removal again after an exception.

Tests: stale callback after replacement; exception before pop; exception after pop; prevented/no-op removal; repeated back requests; completion after unmount. Include equivalent ownership checks in interactive finish/cancel and their duration fallback timers.

### F4. P1: Native-Stack Removal Interception Uses the Unsupported Path

Location: [ChoreographyScreenBase.tsx](../src/components/ChoreographyScreenBase.tsx#L93).

Both current wrappers share a direct `beforeRemove` listener with `event.preventDefault()`. React Navigation explicitly warns this does not work properly with native-stack and recommends `usePreventRemove`.

Move removal interception into navigator-specific adapters. For React Navigation use its supported removal hook. For Expo use the public equivalent exported by the installed Expo Router version, with Expo's navigation contexts. Do not import `@react-navigation/*` into the Expo adapter to get the hook. Verify the actual exported API rather than guessing an import path.

Retain the exact blocked action and replay it once through the documented continuation mechanism. Preserve cooperation with application-level unsaved-change blockers. A reset, replacement, or multi-pop is not necessarily a reverse to the last choreography source; animate only when the actual destination matches usable lineage. Otherwise clear owned state and allow ordinary navigation.

Tests: header back, Android back, app button, nested removal, reset, replace, multi-pop, external removal during preparation, and application removal blockers.

### F5. P1: Screen Identity Is Logical, Not Instance-Safe

Locations: [React Navigation adapter](../src/hooks/useReactNavigationChoreography.ts#L9), [Expo router request](../src/expo-router.ts#L47), [lineage map](../src/components/ChoreographyProvider.tsx#L262).

The compound element identity is a good design, but its `screenId` is commonly a reusable name such as `GalleryDetail`. Multiple mounted instances of that route share readiness and lineage keys. Pushing the same item twice can also collide in element registration. Different items avoid some element collisions through `groupId`, but still overwrite lineage for the shared screen name.

Lineage is keyed only by target screen ID. `unregisterScreen` does not clear it. It is deleted on selected completion/cancellation paths, so an unrelated later open or reset can retain stale ancestry.

The React Navigation adapter also equates destination route name with the destination choreography screen ID, while the public screen component permits a custom ID. Expo exposes the mismatch as a manual `targetScreenId` contract rather than solving instance identity.

Fix: distinguish logical destination, route instance, choreography operation, and shared-element group. Expo/React Navigation route instance keys must be associated with a pending request through adapter-observed route state or another documented mechanism. Do not assume a pathname or route name is unique. Do not put renderer functions or transition metadata into URL params.

Make request-to-route association a focused design task: specify how it behaves for duplicate pushes, navigation to an existing route, redirects, and nested stacks before implementation. If an association is ambiguous, fall back to ordinary navigation instead of pairing the wrong screens.

Tests: duplicate route instances with equal/different entity IDs; same screen in two stacks; deep link after an earlier choreographed visit; source removal; reset; cancelled back; destination reuse. Prune lineage and readiness by instance lifetime without breaking an in-flight transition's frozen data.

### F6. P1: Readiness Guarantees Differ by Platform

Locations: [prepareForwardTransition](../src/core/NavigationSessionController.ts#L113), [provider readiness wait](../src/components/ChoreographyProvider.tsx#L273), [screen layout readiness](../src/components/ChoreographyScreenBase.tsx#L140).

The controller waits for screen readiness only under `isAndroid`. The coordinator checks registration and geometry, not the explicit readiness/blocker registry. Thus `ready={false}` and acquired blockers do not gate iOS forward preparation as documented.

**Reproduced:** the actual controller calls the readiness wait zero times for iOS and once for Android.

The provider also discards the readiness registry's boolean timeout result. Android proceeds after timeout even if an application blocker remains active. Decide and document the policy: a timeout should normally abort choreography, clear hiding/pending state, and leave ordinary navigation functional, not pretend the screen was ready.

The two-RAF layout callback captures `ready`; changing readiness before it executes can publish an old value. Review cancellation/generation of that callback as part of the same fix.

Tests: identical readiness contract on both platforms; overlapping blockers; release ordering; ready prop changes between layout and RAF completion; timeout; destination removal; route-instance reuse.

### F7. P1/P2: Native Acknowledgement and Cleanup Still Need Ownership

Locations: [host bridge](../src/native/NativeTransitionHost.tsx#L4), [provider acknowledgement](../src/components/ChoreographyProvider.tsx#L410), [iOS host](../ios/ScreenChoreographyView.mm#L136), [Android host](../android/src/main/java/com/screenchoreography/ScreenChoreographyView.kt#L123).

The JS overlay-ready signal contains a session ID, but the native presentation event only carries a timestamp and the bridge drops it. The provider attributes any callback to whichever session is active when it arrives. Native request counters cannot identify an already queued old event at the JS boundary.

Additionally, every coordinator update clears both ready refs, including metrics-only updates to the same session. Such an update need not cause a new native activation or overlay-ready effect. Readiness should be scoped to a presentation generation and deliberately invalidated, not reset indiscriminately.

Add a presentation generation/session token to the native prop and event contract. Validate both acknowledgements against it. Settle/cancel waiters and timers on replacement/disposal; clearing a waiter map does not cancel its scheduled timeout. Native host replacement while continuously active must also produce the correct generation's acknowledgement.

The native teardown comments equate two main-queue posts with two display frames. Those are not equivalent. Keep this as an explicit native validation item; do not remove the dismissal-frame safety mechanism without transition evidence. If a frame guarantee is required, use a real frame/presentation mechanism rather than relabeling queue hops as frames.

These are source-level risks; stale native events and visible teardown artifacts were not reproduced on a device in this review.

### F8. P2: The Stagger Helper Conceals Hook Calls

Location: [useStaggeredReveal](../src/hooks/useChoreographyProgress.ts#L162).

`getItemStyle(index)` invokes `useAnimatedStyle` inside an ordinary function and disables `react-hooks/rules-of-hooks`. The fixed calls in today's demos can work, but mapping over a changing list or calling it conditionally changes the parent's hook order.

Replace with a real per-item hook, for example `useStaggeredItemStyle(index, config)`, called unconditionally inside an item component; or provide a per-item component. A list-level helper may compute shared values/configuration but must not return functions that allocate hooks. Plan deprecation for the existing exported API.

Tests: insert/remove/reorder items; conditional item mounting; Strict Mode; no hook-rule suppression in the replacement. Do not replace this with another loop that allocates a variable number of hooks.

### F9. P2: Shared Example Runtime Is an Avoidable Service Locator

Location: [shared runtime](../examples/shared/runtime.tsx#L1).

The positive part is that screens, data, renderers, and most UI are genuinely shared. Thin route parameter extraction is also appropriate duplication. Relative imports alone are not a hack.

The avoidable part is `let runtime`, configured by side-effect imports, plus wrappers forwarding almost the entire library and safe-area API. Hook implementations are selected through mutable global state. This obscures dependencies, relies on import order, adds type assertions, complicates isolated rendering/tests, and cannot represent two differently configured trees safely in one JS runtime.

There is also a scope issue: shared screens call `useChoreographyProgress()` before returning their own `ChoreographyScreen`, so those hook calls do not see the context provided below them. For example [GalleryDetailScreen](../examples/shared/gallery/GalleryDetailScreen.tsx#L37) gets the default screen scope, not `GalleryDetail`. This can make `role`, `phase`, and screen-specific settlement incorrect. The hook's nonparticipant fallback hides this mistake rather than detecting it.

Fix: route wrappers supply choreography screen scope above the shared screen, and a small example navigation context contains typed command values, not dynamically selected hooks. Shared renderers/components import neutral library exports directly. Import safe-area primitives normally. Retain the provider around each app's navigation tree and the appropriate screen adapter around each shared screen.

The bare adapter uses `any` for navigation and route params. The Expo mapping uses `as never` despite enabling typed routes: [Expo exampleRuntime.ts](../examples/expo-router/src/exampleRuntime.ts#L49). Use typed destination mappings, `Href`/route literals as supported by the installed Expo version, and validate `string | string[] | undefined` route parameters at the route boundary.

Tests: render shared screens with injected command values and no module configuration; invalid destinations fail typechecking; screen-aware hooks see the mounted instance scope; two independent example providers do not interfere.

### F10. P2: Dependency and Export Claims Are Too Broad

Location: [package configuration](../package.json#L7).

An emitted-source import-graph audit found:

- Root entry point transitively imports `@react-navigation/native` at runtime.
- Expo entry point imports `expo-router`, not `@react-navigation/native`.

Keep the second property. SDK 56+ Expo Router specifically directs application imports away from external React Navigation contexts. Do not consolidate both adapters into one file that imports both packages.

Optional peer metadata does not make an unconditional runtime import optional. Neutral consumers currently have no public navigation-free entry point. Expo's manually duplicated export list also omits common types/debug exports that the root provides.

Keep the existing root entry point for React Navigation and `/expo-router` for Expo. Add a focused neutral `/core` entry point if needed for direct shared-demo imports without pulling either navigator. A shared neutral export module can prevent drift, but the Expo entry must never re-export the root if that imports React Navigation. Validate generated declaration graphs as well as runtime graphs; type-only root imports can still expose unwanted declarations to consumers. No root API replacement or third navigator subpath is required.

The declared RN >=0.76 + Reanimated >=4 + Worklets >=0.8 combination is not an accurate compatibility promise. Reanimated 4's published matrix starts at RN 0.78 for older minors, and supported Worklets versions depend on the Reanimated minor. Unbounded ranges also accept future majors. Publish tested tuples and choose defensible peer ranges; no set of independent peer ranges expresses every allowed tuple.

Installed tuples observed in this review:

| Scope | React | RN | Reanimated | Worklets |
| --- | --- | --- | --- | --- |
| Library / current bare example | 19.2.0 | 0.83.0 | 4.3.0 | 0.8.1 |
| Expo example | 19.2.3 | 0.86.3 | 4.5.1 | 0.10.1 |

Different versions are not proof that either current bundle is broken: the monorepo helper deliberately redirects peer resolution. However, Expo recommends avoiding duplicate native versions and already configures monorepos automatically. Prefer an aligned tuple supported by the selected Expo SDK, React Navigation, and native dependencies if testing different versions is not intentional. If the bare app is deliberately a separate compatibility fixture, isolate its resolution/install as needed and prove JS/native resolution agrees. Do not force an unsupported tuple just to deduplicate.

The Expo Metro helper is a third-party helper, not a homemade patch, but it overrides watch folders, blocklists, extra modules, and resolution. Test the standard Expo config after proper workspace packaging. Retain only configuration with a demonstrated requirement. Account for library source development: removing the helper can switch resolution to stale built output, so either build/watch the library or deliberately enable its source condition.

### F11. P1: CI Still References the Removed Example Location

Location: [CI workflow](../.github/workflows/ci.yml#L163).

The iOS pod installation step and Gradle cache hash must point to `examples/react-navigation`; stale paths will fail on a cache miss.

CI runs only the root typecheck, which excludes examples. The Expo app has no `build:ios` or `build:android` script matching the Turbo jobs, so those jobs do not establish Expo build compatibility.

Fix paths, add both app typechecks, and define explicit native build jobs for both intended navigator apps. Update Turbo cache selection before adding multiple tasks: `.tasks.find(...)` is not a sound summary of several app builds. Include clean package-consumer smoke tests without workspace source aliases or accidental hoisted navigation peers.

## 3. Confirmed Cleanup and API Debt

Treat cleanup separately from the correctness work. Do not remove exported APIs merely because no example uses them.

| Candidate | Evidence / Recommendation |
| --- | --- |
| `DEFAULT_DURATION`, `REVERSE_DURATION`, `CONTENT_REVEAL_DURATION`, `STAGGER_DELAY`, `DEFAULT_CORNER_RADIUS` | Repository source search found definitions only in [constants.ts](../src/core/constants.ts#L28). Not re-exported by the package entry points. Remove after rechecking consumers. |
| `debug.categories` | Declared in [types.ts](../src/types.ts#L165) and documented, but provider config and logger never apply it. Implement category filtering with tests or deprecate/remove the promise deliberately. |
| `restDisplacementThreshold`, `restSpeedThreshold` | Public spring type/presets still expose old thresholds. Installed Reanimated 4.3/4.5 spring code uses `energyThreshold`; these old fields are not consumed there. Base the supported physics config on Reanimated's actual type, or use a deliberately constrained compatible subset. Do not translate thresholds numerically without evidence. |
| Unproduced transition states | Coordinator emits `measuring`, `active`, and `null`; several members of [TransitionState](../src/types.ts#L71) are never emitted. Some are referenced by visibility helpers/tests, so align the real state machine and derived phases before deleting them. |
| `ElementRegistry.getGroupElements`, `getDebugSnapshot`, `clear` | Internal methods with test consumers but no production callers found. Low-priority candidates, not urgent bugs. `clear` may become useful in explicit runtime disposal. Keep intentional diagnostic/disposal utilities if documented and tested. |
| `_choreographyGroup`, `_choreographySourceScreen` fallback | Still read by reverse/interactive code, but current adapters no longer write these fields. This is a legacy compatibility path, not automatically dead code. Isolate/deprecate it, with a migration policy, rather than contaminating the neutral core forever. |
| Navigation options on back | `goBack` largely uses spring logic, and settled back delegates to interception without forwarding per-call configuration. Clarify which `spring`/`duration` options apply and preserve them consistently in a shared reverse request. |
| Readiness/lineage/hidden-value storage | Readiness entries are not removed; lineage is only partly pruned; hidden values retained through unmount can outlive their registrations. Introduce instance-aware release/disposal before increasing reliance on unique instance IDs. Do not delete entries while an active session still owns them. |

No repository-wide unused-code analyzer or profiler was run. Do not turn these findings into claims of exhaustive dead-code or performance coverage.

## 4. Architecture to Implement

### 4.1 Keep Provider-Owned State

Retain `ChoreographyProvider` as the owner of a transition domain. Both current apps can share the existing engine while mounting their own provider around their navigation tree. Make ownership explicit internally rather than requiring applications to create and pass an external runtime:

- Each provider owns registry, readiness, lineage, coordinator, progress, operation tokens, navigation serialization, and cleanup.
- Move lock/operation state that must coordinate multiple hook callers into that provider-owned domain. Keep screen-specific adapter subscriptions local to their screen.
- Frame progress remains a Reanimated shared value, not React state updated every frame.
- Preserve the stable actions versus volatile session-context split so registration does not churn.
- Keep one overlay host per provider. Internal component extraction is fine if it simplifies ownership, but a public host-plug-in API is not required for these two adapters.
- Screen unmount releases its registrations, readiness, lineage, and subscriptions with respect for active-session ownership. Provider unmount invalidates pending work and releases all remaining timers/listeners/resources.
- Completion/cancellation/acknowledgement must include an operation or session identity. Synchronous navigation dispatch and asynchronous layout/presentation readiness are separate events.
- Independent providers must not interfere with each other's transitions or live-host identities.

Reuse the existing registry/coordinator machinery. Do not introduce Redux, `useSyncExternalStore`, a public runtime factory, or multi-root bindings solely for this compatibility task. Extract a small internal controller only where it gives shared operations one owner and makes their behavior easier to test.

### 4.2 Separate Adapter Responsibilities

The neutral screen primitive owns screen identity, readiness, visibility, and registration scope. It must not take a React Navigation-shaped `navigation` object or inspect route metadata.

Each adapter owns:

- Actual route instance identity and lifecycle subscriptions.
- Focus/visibility eligibility, distinguishing native attachment from logical focus.
- Typed navigation requests and supported dispatch/state observation.
- Removal/back interception supported by that navigator.
- Association between pending requests and mounted destination instances.
- Detection of redirects, resets, external removal, and failed/no-op navigation.
- Navigator-specific stack options and honest gesture/presentation capability documentation.

Do not create a large fake universal navigator. Keep the existing adapters thin, share orchestration in the core, and let each adapter import hooks/types from its own supported package entry points.

A practical package shape retains the root React Navigation API and `/expo-router`, with an additive neutral `/core` entry point for reusable primitives and hooks. The neutral entry point is a proposal, not an existing API. Do not rename or deprecate the existing root merely to make the structure more symmetrical.

### 4.3 Keep These Existing Invariants

- Stable element registration by full instance/group/element identity.
- Frozen renderer presentations per pair; overlay never reads live element props during a session.
- Source measurement before navigation detaches it.
- Real-element hiding stays tied to overlay presentation readiness, not eager session activation.
- Pending target is hidden before pairing completes.
- The Android static visibility gate remains on a plain outer View, separate from animated opacity.
- Progress semantics remain coherent for forward/backward and companion motion.
- Main geometry uses controlled non-overshooting behavior; Android shadows are static `boxShadow` layers with animated opacity, not per-frame shadow mutation.
- No transition functions, React elements, or internal lineage in Expo URL params.

Do not remove frame/readiness safeguards just because they look inelegant. Replace them only when a measured, tested lifecycle contract takes over their responsibility.

## 5. Native Compatibility Verification

Use the two existing apps. No new navigator spike or app bootstrap is required. Pin supported RN/Reanimated/Worklets combinations and validate both React Navigation native-stack and Expo Router native `Stack` on iOS and Android.

1. Retain each app's provider placement and stack configuration while fixing ownership defects. Disable competing stack animation and document the supported transparent detail presentation explicitly.
2. Start with one list/detail stand-in flow in both apps, then cover gallery, music, wallet, and live demos. The fact that both use native-stack primitives does not prove their integration contexts and routing semantics are interchangeable.
3. Exercise `navigate`, Expo `push`, and back as exposed by the adapters. Distinguish dispatch, actual route changes, screen layout readiness, and overlay presentation acknowledgement.
4. Validate the supported removal-hook implementation with header back, Android back, custom buttons, nested navigation, unsaved-change blockers, reset, and replace.
5. Check first-open and repeated-open measurement, transparent screen visibility, and source detachment. Preserve pre-navigation source measurement and the static pending-target gate.
6. Validate host stacking and touch pass-through, including safe-area/status-bar offsets, keyboard behavior, and supported modal presentations. Do not assume `zIndex` handles arbitrary native modals.
7. Exercise duplicate routes, redirects, deep links, and no-op/prevented actions; verify no stale lineage or pending target survives.
8. Report unsupported configurations explicitly. Do not patch navigator internals or change navigation semantics merely to make a visual test pass.

### Back Behavior Is a Capability, Not an Assumption

Use supported removal hooks and replay the original action at most once. Preserve application blockers and root exit behavior. Do not assume all removals are single-screen pops or that dispatch means the route was removed.

Native iOS swipe progress and Android predictive-back progress are not demonstrated by the current library. Do not describe a disabled native gesture plus a custom gesture as automatic native-gesture integration. Report controlled navigation, custom interactive back, and native gestures separately. Align the two demo apps' gesture configuration where practical so they exercise equivalent behavior rather than conceal differences.

### Live Views Still Need Native Regression Coverage

[SharedElement.Live](../src/components/SharedElement.tsx#L284) uses `react-native-teleport` to move a real view. Its host names currently contain group and element IDs, but no provider, route-instance, or session identity: [host naming](../src/components/SharedElement.tsx#L68). Repeated destinations can collide within a portal scope; verify the portal library's scoping before claiming cross-provider collisions.

Keep the current portal-based approach while testing real native view lifetime and handoff in both existing apps. Cross-root reparenting support is not a requirement of this task.

Acceptance: one stateful native/player instance survives forward, reverse, interrupted forward, and cancelled gesture; it does not remount or lose state; destination/overlay hosts have unambiguous identities. Include source route detachment/unmount and removal of the destination.

Do not silently remove the live demo or use private Fabric reparenting to bypass a failing test. Record any mode-specific limitation separately from ordinary stand-in compatibility.

## 6. Clean Example Organization

Keep two primary app shells and one private shared workspace. There is no need to move everything into a generic monorepo template.

Suggested layout, after migration:

```text
examples/
  shared/                         # private workspace package
    package.json
    src/
      navigation.tsx              # destination types + command-value context
      gallery/ music/ wallet/ live/
      components/
      theme.ts
  react-navigation/               # existing React Navigation native-stack app
    src/navigation/
    src/routes/
  expo-router/                    # Expo layout + file route wrappers
    src/app/
    src/navigation/
```

Shared package name suggestion: `@screen-choreography/example-shared`, `private: true`, depended on via `workspace:*`. Declare React/RN/library/safe-area/Reanimated requirements deliberately so it does not install an extra native runtime. The current `examples/*` workspace glob already fits this location once a manifest exists.

Share business data, visual screens, transition renderers, gestures that are actually backend-neutral, and typed destination definitions. Keep app bootstrap, stack setup, native configuration, route files, param decoding, and backend command mapping local. A few lines of route wrapper duplication are healthy boundary code.

Each route wrapper should render:

1. The correct navigator adapter's screen/lifecycle binding, establishing instance scope above hooks.
2. A typed example navigation provider whose value contains already-created command callbacks.
3. The shared visual screen with validated entity props.

Avoid a mutable hook/component registry, `as never` routing casts, resolver aliases that swap entire implementations, or requiring both navigator dependencies just to render a shared screen. Do not turn the example navigation context into a public library abstraction; the library adapter contracts and demo destinations serve different purposes.

Keep both existing shells and their showcase roles. Refactor sharing incrementally with regression comparison before/after. Final primary app count remains two; do not replace the React Navigation app or add another navigator.

## 7. Phased Implementation Instructions

Work one phase at a time. Before each phase, read the linked owner and neighboring tests; do not rescan the entire repository. Add a failing targeted regression first where feasible, then implement the smallest change. Run that check immediately after editing. Do not bundle cosmetic cleanup into behavioral commits.

### Phase A: Fix Ownership Defects and Establish Regressions

Owners: coordinator, navigation controller, reverse helper, interactive hook, provider waiter lifecycle.

- Add the F2/F3 reproductions to Jest as assertions of correct behavior, not tests that bless the defect.
- Add owned/session-qualified completion, cancellation, and operation invalidation.
- Make navigation commit at-most-once and handle dispatch exceptions and prevented/no-op actions.
- Add readiness contract tests for both platforms, then implement F6.
- Add disposal and supersession tests without arbitrary sleep-based assertions.

Exit: old work cannot change new session state; cancelled prep never reappears; back cannot pop twice; readiness is explicit and symmetric; ordinary navigation remains usable on failure.

### Phase B: Clarify Core Ownership and Neutral Exports

Owners: provider, contexts, screen base, package exports, navigation hook/controller.

- Keep the provider-owned model; consolidate shared operation ownership without rewriting measurement or rendering algorithms.
- Separate neutral screen rendering/readiness from navigator lifecycle hooks.
- Add neutral exports for shared-demo consumers and keep root and Expo behavior intact.
- Add tests for multiple hook callers under one provider and isolation between independent providers.
- Ensure a provider-owned lock serializes multiple hook instances; per-hook locks alone are insufficient.
- Preserve library API compatibility or explicitly identify/deprecate changes.

Exit: neutral import/declaration graphs contain no navigator package; all callers in a provider share operation ownership; actions remain stable; one host per provider; screen unmount cleans up without disrupting unrelated screens. No public runtime factory or multi-root infrastructure is introduced.

### Phase C: Correct Expo and Existing React Navigation Adapters

- Move removal hooks out of neutral screen code; implement F4 using supported APIs.
- Design/test route-instance request association and lineage pruning (F5).
- Preserve current Expo SDK 56+ import isolation and clean URLs.
- Handle deep links/plain navigation without source as ordinary navigation.
- Normalize push versus navigate semantics; do not assume `navigate` always creates a destination.
- Preserve per-request reverse options consistently.

Exit: native-stack back behavior is supported, not merely mock-compatible; duplicate routes do not collide; redirects/reset/no-op navigation cannot leave hidden or blocked screens.

### Phase D: Verify Both Native Integrations

- Execute section 5 against the existing React Navigation and Expo Router apps on iOS and Android.
- Add adapter contract tests for dispatch, focus, route-instance association, and removal continuation.
- Capture native evidence for overlay presentation, input restoration, and interruption behavior.
- Validate live-mode state preservation separately from stand-in rendering and state gesture limitations explicitly.

Exit: both existing apps demonstrate forward/back, safe interruption, failure cleanup, correct overlay stacking/touches, and their stated gesture capabilities. Passing one app is not evidence that the other was verified.

### Phase E: Package Shared Demos and Migrate Both Shells

- Replace module-global example configuration with typed command values.
- Put screen scope outside shared visual components so their hooks see it.
- Package shared demos; remove whole-library forwarding wrappers.
- Keep route files small and validate params; eliminate navigation `any`/`as never` where public types can express the contract.
- Simplify Expo Metro only after checking source/built resolution and JS/native dependency identity.
- Preserve gallery, music, wallet, and live demos in both apps.

Exit: two primary apps import the same demo implementations, route wrappers contain no duplicated transition algorithms, and shared screens can be tested without side-effect configuration.

### Phase F: Public API Cleanup, Native Ack, CI, and Docs

- Address F7 and F8 with focused tests and native evidence.
- Remove confirmed unused internals; implement or deprecate unsupported configuration promises.
- Align spring types/presets with supported Reanimated versions.
- Fix CI paths and explicitly build/typecheck both apps.
- Build and pack the library, then run isolated consumer checks per entry point.
- Update README, architecture, limitations, and both example guides to describe implemented behavior and tested versions only.

Native acknowledgement work can move earlier if either app's validation exposes it as a blocker. Dead-code cleanup cannot substitute for the prior compatibility gates. After example/configuration changes, rerun the affected native scenarios rather than relying solely on Phase D's earlier results.

## 8. Acceptance Matrix

Run the meaningful scenarios on iOS and Android for both React Navigation native-stack and Expo Router native Stack. Both adapters are primary supported integrations, not legacy migration fixtures.

| Scenario | Required Evidence |
| --- | --- |
| First open / repeated open | Correct source and destination geometry; no flash/blank frame; cached metrics revalidated. |
| Controlled back after settle | One removal, correct destination, no competing navigator animation. |
| Back during forward / repeated taps | Latest ownership respected; no double-pop, stuck pending gate, or session resurrection. |
| Gesture finish / cancellation | Correct endpoint and route state; cancellation leaves detail usable; late callbacks ignored. |
| Native gesture / predictive back | Explicitly tested support or clearly documented fallback/limitation; not inferred from custom gestures. |
| Duplicate destinations / nested stacks | Per-instance lineage, readiness, element identities, and live host names. |
| Deep link / redirect / reset / replace | Ordinary navigation works without a source; no stale lineage or invisible screen. |
| Slow data / blockers / missing elements | Explicit timeout/fallback policy; restored visibility and input. |
| Navigation exception / prevented action / host failure | No repeated dispatch, stranded pending state, or unhandled error; owned cleanup. |
| Root/route unmount / app background | In-flight work invalidated as required; listeners/timers/resources released. |
| Live shared view | One real instance/state survives; host identity and state preservation verified in both apps. |
| Screen bounds / safe areas / modal / keyboard | Window coordinates align; overlay stacks correctly; inactive host never steals input. |
| Dynamic stagger list / Strict Mode | No hook-order errors or registration churn. |
| Reduced motion | Navigation and cleanup still complete correctly when animation is shortened/disabled. |
| Isolated package consumers | Expo without external React Navigation; React Navigation without Expo Router; neutral without any navigator. Validate declarations and native build dependencies too. |

Unit tests should control promises, frame callbacks, animation callbacks, and native ack tokens deterministically. Native builds and device scenarios are separately required: Jest mocks cannot prove native root stacking, view reparenting, or gesture synchronization.

## 9. Verification Completed During This Review

The following all passed against the current working tree:

```sh
yarn test --runInBand
# 11 suites, 85 tests passed
yarn typecheck
yarn lint
yarn workspace react-native-screen-choreography-example typecheck
yarn workspace screen-choreography-expo-router-example typecheck
```

Additional read-only probes transpiled the actual TypeScript owners in memory, injected deterministic boundary stubs, and confirmed:

```text
Cancelled coordinator preparation reactivated and hid two elements.
Stale reverse spring callback completed a replacement session.
Animation construction failure after pop invoked popAction twice.
iOS forward preparation called readiness wait 0 times; Android 1 time.
Root runtime graph imported @react-navigation/native; Expo graph did not.
```

For regression conversion, suspend the coordinator's target wait, call cancel, then release it and assert the session stays null. Capture the reverse helper's animation callback, replace the current session, invoke the callback, and assert the replacement remains untouched. Make animation setup throw after pop and assert exactly one pop plus owned cleanup. Exercise readiness on both platforms with a blocked promise.

No implementation files were changed for the review. No native build, simulator session, on-device visual check, or published-package consumer build was executed. The probes establish specific JS control-flow defects, not their visual manifestation on a device. This scope correction updates the handoff only; it does not represent a new test run or invalidate the recorded baseline results.

## 10. Primary Sources Checked

Use installed package types and pinned release source for implementation. Verify that supported removal hooks and types come from the intended navigator's public entry points in the chosen versions.

- [React Navigation events](https://reactnavigation.org/docs/navigation-events/): native-stack warning for direct `beforeRemove` prevention.
- [React Navigation preventing back](https://reactnavigation.org/docs/preventing-going-back/): supported removal-hook approach.
- [Expo migration from React Navigation](https://docs.expo.dev/router/migrate/from-react-navigation/): SDK 56+ public import boundaries.
- [Expo monorepo guidance](https://docs.expo.dev/guides/monorepos/): standard Metro support, workspace packages, duplicate native dependency concerns.
- [Reanimated compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/): RN and Worklets tuples; latest-patch caveat.

## 11. Start Here, 5.6 SOL

Read the repository instructions and sections 1, 2, and 7 of this handoff. The targets are React Navigation native-stack and Expo Router, exactly as used by the two current apps. State which phase you are implementing and its acceptance checks. Start with Phase A's cancellation regression. Preserve existing user edits and public behavior outside the targeted change. Keep the provider-owned architecture and existing adapters; do not build another navigation backend. After each phase, report exact changed files, executed checks, remaining native verification, and any compatibility limitation. Do not mark compatibility verified until both apps pass the required native gates. Ask before replacing an explicit requirement with a limited fallback or depending on private navigator/native internals.