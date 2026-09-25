# Runtime architecture

## Source organization

- `src/entries/core.ts` defines the shared public API. The root and Expo Router
  entries re-export it and add their navigation adapters.
- `src/components` contains the provider, screen wrapper, and shared owner/target.
- `src/core` contains registration, pairing, preparation, navigation ownership,
  overlay rendering, and screen visibility.
- `src/hooks` coordinates navigation, reverse commits, gestures, and progress.
- `src/transitions/makeTransition.tsx` adapts renderers to the retained portal host.
- `src/standin` contains `TransitionFrame`, `TransitionSurface`, and surface-style
  extraction. Despite the directory name, these wrap live content.
- `src/native`, `ios`, and `android` implement the native overlay and preparation.

The supported runtime is Fabric with Reanimated and react-native-teleport. Use
native-stack with `animation: 'none'` and transparent detail presentation so the
native navigator does not compete with shared motion.

## Ownership and registration

`SharedElement` owns one React subtree. `SharedElement.Target` contributes a
measured wrapper and an empty receiving `PortalHost`. During a transition,
react-native-teleport moves the native subtree into the overlay; at completion
it moves into the destination host or back home. The React owner and its context
remain on the original route, which must stay mounted.

Registration is stable per `(route instance, groupId, id)`. Latest-value refs
supply presentation metadata without unregistering on render. Registration
uses the stable actions context; active-session consumers use the volatile
context. Repeated instances of the same logical route remain distinct.

Each live owner selects its participating pair before a memoized payload boundary.
Pending-screen changes and unrelated groups or elements do not propagate through
the owner's presentation context. Pair replacement still updates frozen metrics,
and settlement retargets the portal during the same render/commit that removes
the overlay. This boundary does not suppress application prop changes or direct
subscriptions to the screen-wide progress context.

While content is away, the owner reserves its intrinsic measured dimensions.
This prevents empty text/icon wrappers collapsing and delaying return measurement.
The reservation is a layout-only style, separate from frozen presentation data;
explicit sizes and flex height are not replaced. A changed orientation or font
scale can still require the application to reconsider intrinsic layout.

`useSharedElementPresentation` exposes canonical collapsed/expanded endpoint
metrics, styles, metadata, shared expansion progress, the participating session's
direction (null while settled), and the settled endpoint.
Owners retain endpoint data, not whole pairs or references to popped screens.
Initial metrics are null. The owner derives `presentationProgress` from its
participation and settled endpoint: it follows the shared clock during its own
transition and holds 0 or 1 otherwise. The existing `progress` remains the global
clock, which can subsequently belong to a different group.

## Pairing and frozen presentations

The registry is keyed by route/group/element identity. Pair discovery is scoped
to the requested source group and requires both endpoints. The coordinator
captures each endpoint's style, transition, and metadata once per session.
Metadata is retained by reference; there is no deep clone or copied React content.

`makeTransition` supplies exactly one portal-host child to a custom renderer.
Renderers must keep this child mounted and render it once. `TransitionOverlay`
sorts pairs by z-index and passes their frozen presentations and metrics to the
factory adapter. It does not create image copies or crossfade duplicate content.

`TransitionFrame` interpolates window bounds and optional radius.
`TransitionSurface` adds background/radius interpolation and a static expanded
shadow layer whose opacity changes. Android shadow parameters must not animate
per frame because they recreate drawables.

## Geometry and fixed content layout

Default shared bounds and the geometry primitives position their frames with
`translateX`/`translateY`, anchored at layout `left: 0, top: 0`. Width and height
continue interpolating so retained children can reflow without scaling their
content. The default shared bounds renderer retains its existing height
expansion curve. Transform updates can still use Fabric commits and perform
native rendering work; the library does not enable Reanimated flags that bypass
those commits.

## Preparation and Fabric layout

On RN 0.81 and newer, a runtime-owned C++ binding observes completed Fabric mounts.
It retains weak mounted-root references and reads geometry without modifying
mount transactions. Each batch validates that its root matches the current commit
and mounting base, with no pending transactions, before and after reading layout.
Every endpoint is scoped to its registered screen. Non-finite, empty, missing, or
partially captured batches are rejected.

Before navigation, the coordinator captures a one-navigation source snapshot.
This preserves the departing geometry if native-stack detaches its screen.
The snapshot is checked against native node identity and consumed by the next
preparation; it is not a reusable destination cache. Without a source snapshot,
source and target are captured together from one mounted root.

Forward and backward preparation use the same Fabric path. Screen `ready` flags
and reference-counted blockers remain application-level gates. Pending mounts
are retried with a bounded 500ms deadline; the coordinator does not wait for
repeated identical measurements. Pairing freezes presentations, rechecks current
geometry, and activates without an asynchronous measurement between these steps.
Unavailable endpoints skip the shared transition through the navigation fallback.
Session ownership and node identity checks prevent interrupted work from activating.
Active endpoint refreshes also read Fabric layout. Coalesced native mount
notifications refresh target bounds during an active session, including safe-area
changes after the first destination mount, while preserving frozen presentations.
The subscription is released on completion, cancellation, or disposal.

There are no Reanimated `measure()`, native-ref `measureInWindow()`, native layout
sampling, or cached-target measurement paths. Fabric geometry does not describe
native-only transforms that bypass its shadow tree; applications must keep endpoint
layout and scroll state stable during the handoff to the overlay.

`onPreparationTrace` exposes source capture, target registration, Fabric preparation,
and overlay readiness timings. See `docs/performance.md` for benchmark collection.

## Overlay and screen visibility

The native overlay presents above native-stack containers. Overlay content
reports readiness in a layout effect; the native host acknowledges presentation.
Animation waits for those readiness signals, with a bounded safety path. Do not
start hiding or moving content based only on an eager session-activation callback.
The native host's dismissal protection is separate from the removed outgoing
screen capture implementation.
Both transition hosts exclude themselves and their children from touch hit testing.
On Android this is enforced in `ScreenChoreographyView`, since its custom
`ViewGroupManager` does not apply the JSX `pointerEvents` prop. This lets the
destination accept input while the overlay finishes its remaining motion.

### iOS window ownership and accessibility

`ScreenChoreographyView` stays mounted as a Fabric-owned anchor for the provider's
lifetime. Its native window container is attached only while presenting a
transition or finishing the native dismissal handoff. Live React children mount
into that container; the anchor itself never moves out of its React parent.
The host-only dismissal snapshot remains separate from those live children.

Both transition and foreground containers are non-modal accessibility containers
(`accessibilityViewIsModal = NO`, `isAccessibilityElement = NO`). Foreground
controls must not hide the underlying screen from VoiceOver. Dismissal snapshots
remain excluded from accessibility. The native window host deliberately does not
use `FullWindowOverlay`, preserving the accessibility behavior introduced in
`c3cc0f4`.

The container uses the anchor's actual `UIWindow`. If a native full-screen modal
temporarily detaches an ancestor, it can keep using that anchor's last known
window while the anchor remains mounted. Removing or recycling the anchor clears
this association and removes the container. Deferred presentation and dismissal
callbacks are invalidated across interruption and recycling.

Window ordering is explicit: controller-owned content, transition containers,
then `ChoreographyOverlay` containers. Containers are inserted directly above
the owning window's attached controller content instead of appended above all
window subviews. This preserves independent window overlays such as React
Native's FPS monitor and `FullWindowOverlay`, without naming or moving their views.

`ChoreographyOverlay` uses the same native component in foreground mode. It stays
mounted independently of transition sessions. On iOS its container has a Fabric
surface touch handler; only a hit on its children is accepted. Its empty root
passes touches through and is not an accessibility modal. On Android it is a
`box-none` sibling above the transition portal, using the shared layer constants.
Foreground hosts do not participate in transition presentation acknowledgments.

Window containers retain a weak connection to their Fabric anchor in the responder
chain, so nested native modals resolve the original presenting view controller.
An attached foreground layer keeps its position when a modal is presented above
it; rerenders and rotation cannot raise its modal placeholder over the modal.

Screen opacity and input gating are defined in `screenVisibility.ts`, from
(direction, role, phase, progress). Expansion progress is 0 at the list and 1 at
the detail, including during a return. A plain outer view applies the pending
or preparing-target visibility gate before Reanimated's initial style commit;
this avoids an Android mount flash. Active motion runs on the animated inner view.
The per-screen `screenFade` prop configures only that active decorative opacity:
it defaults to the expansion interval `[0, 0.4]` and accepts a custom increasing
interval within `[0, 1]`. The separate `keepVisible` prop overrides the fade to
keep the screen opaque. Preparation visibility and input gates remain independent
of these settings.

The provider still contains visibility-registry bookkeeping used by its lifecycle
and progress handoff. Live owners do not register duplicate-content hiding styles.
Do not treat that bookkeeping as a reason to add snapshot render paths.

## Forward and reverse lifecycle

1. Acquire navigation ownership, measure the source, and mount/prepare the target.
2. Resolve pairs and freeze endpoint presentations.
3. Mount overlay hosts, move retained content, and await overlay presentation.
4. Drive shared progress with Reanimated; companion content derives its own styles.
5. At completion, retarget content to its endpoint and release the overlay/session.

After a settled forward transition, Back prepares a reverse session while the
outgoing route remains mounted. During committed settlement, a UI-thread reaction
asks `ReverseTransitionController` to remove the outgoing route once expansion
progress reaches 0.10. This is remaining expansion, not elapsed animation time;
the threshold starts dismissal and does not itself confirm input readiness.
Retained content stays in the overlay until the spring finishes. After confirmed
route removal, a new navigation tap can finish that remaining motion immediately;
it does not wait for the spring's settling tail. Exact animation completion also
commits navigation if the earlier reaction has not run. There is no outgoing-screen
snapshot component. Cancelling an interactive return keeps the detail route.
On Android, each screen exposes its own derived progress to companion animations.
Before dispatching removal, the controller freezes the outgoing screen's progress
and pointer events, then crosses two UI animation frames to drain queued mapper
and Fabric prop updates. The provider's overlay progress continues throughout;
retained presentation progress also remains on that clock. This prevents updates
to deleted route views without delaying removal until the spring completes.
A rejected removal resumes the screen; a superseded commit cannot remove another
route or resume a newer suspension.
Once animation completion and route removal are confirmed, the provider enqueues
the UI input handoff and completes the session in the same JavaScript turn.
Portal retargeting and navigation unlock do not wait for a UI-to-JavaScript
acknowledgment. The handoff is queued before completion invalidates UI ownership.

An interrupted active forward transition refreshes its source metrics and uses
the same return controller, with the original source as its return destination.
Confirmed removal enables that destination's input when interaction during
transitions is allowed. It also wakes queued navigation, including when focus
arrives before the removal result. The remaining animation still owns the
overlay until completion or a new navigation tap. Progress ownership
rejects callbacks from replaced animations. JavaScript timers do not force
animation completion; Reanimated's completion callback or an explicit navigation
interruption owns that decision.

Navigation lineage records source route identity, group, and requested spring.
Removal interception routes hardware and navigator Back through the same reverse
preparation. On Android, Back from a detail whose opening animation is still
active reuses the in-app Back reversal and refreshes the original source metrics
before returning. It does not remove that route underneath the forward animation.
If Back removes the Android destination before preparation finishes, the pending
opening is cancelled instead of animating an unmounted route.
`NavigationSessionController` owns locks, queued requests, and replay
checks. Keep provider cleanup independent of an outgoing route's lifetime.

## Companion motion and extensions

`useChoreographyProgress` subscribes to screen-visible session state.
`useChoreographyControls` provides a stable screen-qualified settle callback.
`useLatchedReveal` builds on shared progress. `useRevealStyle` and named `Enter`/`Exit` components scope reveals to the participating screen or an explicitly selected retained presentation. Each list item owns its hooks; stagger intervals fit within the configured group window.
`useInteractiveTransition` exposes gesture-normalized progress (0 at detail,
1 at completed return), velocity-aware settlement, and cancellation; it does not
subscribe to native-stack's built-in swipe gesture.

Add visual recipes through `makeTransition`, or derive retained child layout
through `useSharedElementPresentation`. Keep renderers module-scoped and avoid
remounting their host during a session. Do not introduce copied-content or
unpaired-element paths.

## Debugging and verification

Use the provider's boolean or `{ level, categories?, logEveryFrame? }` debug
configuration. Applying configuration must not recreate the coordinator or
registry. Use preparation traces to distinguish time before animation from
animation duration. Test rapid interruption, repeated return, layout changes,
and missing endpoint handling when modifying lifecycle code.

The two example apps share screen implementations and transition recipes. The Android performance workload mounts the actual Gallery screens;
it does not compare synthetic default/custom rendering modes.

## Declarative composition

`defineTransition` compiles named bounds/surface recipes into module-stable
`makeTransition` adapters. Typed owner/target wrappers resolve the same role
without adding another component representation. Recipes copy their scalar
configuration when defined; endpoint presentation data is still frozen by the
coordinator at session start.

Enter/exit roles render local animated views driven by screen progress. They do
not participate in pair discovery or overlay readiness. There are no unpaired
tracks or copied image/text recipes. The shared examples demonstrate how to
combine retained content, named shared roles, and local section reveals.
Reveals use direction-specific preparation endpoints and suppress translation
under reduced-motion settings. They read screen state, so retained descendants
continue to use `useSharedElementPresentation` for their own internal motion.
