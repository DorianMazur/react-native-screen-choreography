# Runtime architecture

This page explains how the library moves live content between screens and how
its JavaScript, UI-thread, and native layers coordinate that movement. It is
intended for developers extending or debugging the library. For application
integration, start with the [quick start guide](./guide/quick-start.md).

## Runtime overview

A transition keeps one React-owned subtree alive while moving its native views
from the source screen, through an overlay, to the destination. Three layers
share the work:

- **JavaScript / TypeScript** registers endpoints, pairs elements, prepares
  screens, and coordinates navigation and content ownership.
- **Reanimated** drives shared progress and visual interpolation on the UI
  thread after preparation.
- **The native host** presents the overlay above native-stack containers and
  confirms that the transferred content is ready to appear.

The runtime uses Fabric, Reanimated, and react-native-teleport. The recommended
native-stack configuration uses `animation: 'none'` and transparent detail
presentation, giving the overlay control of the shared motion.

At a high level, a transition follows five steps:

1. Acquire navigation ownership, capture the source, and prepare the target screen.
2. Resolve matching endpoints and freeze their presentation data.
3. Attach overlay hosts, transfer retained content, and confirm presentation.
4. Drive shared progress; shared and companion views derive their visual styles.
5. Return content to its endpoint and release the overlay and navigation session.

## Content ownership and registration

`SharedElement` owns the React subtree. `SharedElement.Target` supplies a measured
wrapper and an empty receiving `PortalHost`. During a transition,
react-native-teleport moves the native subtree into the overlay; at completion
it moves into the destination host or back home. The React owner and its context
remain on the original route, so that route must stay mounted while its content
is retained elsewhere.

Registration identifies each endpoint by `(screenId, groupId, id)`, using the
adapter's resolved route-instance identity for `screenId`. This keeps repeated
instances of the same logical screen label distinct. Latest-value refs provide
current presentation metadata while registration remains stable. The provider separates lifecycle actions in
`ChoreographyActionsContext` from active-session state in `ChoreographyContext`.

Each owner selects its participating pair by its current resting screen before a
memoized presentation boundary. A destination can therefore become the source
of another transition while the original owner remains mounted. The selected
session identity keeps the owner participating if that resting screen is removed
during motion. Unrelated elements, groups, and pending screens therefore do not
update that owner's retained presentation. Application prop changes and direct
subscriptions to screen-wide progress still update normally. A participating
pair can receive refreshed bounds. Settlement retargets its portal when the
session ends; Android keeps the receiving hosts mounted until native confirms
that the transferred content has left them.

While content is away, the owner reserves its measured intrinsic dimensions.
This keeps empty text or icon wrappers from collapsing and changing their return
position. The reservation is a layout style, separate from presentation data;
explicit dimensions and flexible height retain their application-defined rules.
Orientation or font-scale changes can still require the application to adjust
its intrinsic layout.

### Retained presentation

`useSharedElementPresentation` exposes the collapsed and expanded endpoints,
including metrics, styles, and metadata. Initial metrics are null. Owners retain
this endpoint data after settlement without keeping registrations or references
to screens that have been removed.

The hook offers two clocks. `progress` is the provider's shared expansion clock,
which can later belong to another group. `presentationProgress` follows that
clock while this owner participates, then holds 0 at its collapsed endpoint or
1 at its expanded endpoint. `direction` is null while settled, and
`transitioning` becomes true when the content transfers into the overlay. On
iOS, this happens after native attachment, as described in the presentation
protocol below.

An owner remains settled at its destination only while that screen is mounted.
A fallback Back completes its session on the returned screen. If the destination
is removed through another route operation, its receiving host disappears and
the owner returns to the previous surviving destination, or home if none remain.
The destination history contains screen identities and frozen presentation data,
never registrations or native refs; removal subscriptions discard departed
hosts and reject stale callbacks. Collapsed/expanded state follows the latest
participating pair rather than distance from the original owner.

## Pairing and frozen presentations

Pair discovery is scoped to the requested source group and requires both
endpoints. The coordinator captures each endpoint's style, transition, and
metadata once per session. Metadata is retained by reference, so this is a
stable presentation boundary rather than a deep clone.

`TransitionOverlay` sorts pairs by z-index and passes their frozen presentations
and current metrics to the transition adapter. `makeTransition` supplies one
library-owned portal-host child to each custom renderer. Keeping this child
mounted and rendering it exactly once preserves the single retained subtree
throughout the handoff.

`TransitionFrame` interpolates window bounds and optional radius.
`TransitionSurface` adds background and radius interpolation, plus a static
expanded shadow layer whose opacity changes. This keeps Android shadow
parameters fixed, avoiding drawable recreation on every animation frame.

## Geometry and Fabric preparation

The default shared-bounds renderer and geometry primitives anchor frames at
layout `left: 0, top: 0`, then position them with `translateX` and `translateY`.
Width and height interpolate as well, allowing retained children to reflow
without scaling their content. The default renderer uses its own height
expansion curve. Transform updates still pass through Fabric commits and native
rendering work.

On RN 0.81 and newer, a runtime-owned C++ binding observes completed Fabric
mounts. The provider initializes it before rendering descendant screens, so it
sees their first mount even when native modules are loaded lazily. The binding
keeps weak references to mounted roots and reads geometry without changing mount
transactions. A capture validates the current commit and mounting base before
and after reading layout, with no pending transactions. Endpoints are scoped to
their registered screens, and a batch succeeds only when all endpoints have
finite, nonempty geometry.

Before navigation, the coordinator captures source geometry for that navigation.
This preserves the departing bounds if native-stack detaches the screen. The
capture is tied to native node identity and consumed by the next preparation.
When no source capture is available, preparation reads source and target
together from one mounted root.

Both transition directions wait for screen readiness and matching
registrations, freeze presentations, and issue one native request. A ready
destination can share a subset of the source group without waiting for absent
elements; when no target matches yet, registration has a bounded wait. That request
binds weak node-family identities and gathers geometry from completed mounts.
JavaScript consumes the batch immediately when ready, or after a coalesced mount
notification, within a one-second deadline. Ready endpoints can publish a
session synchronously; pending mounts follow the bounded asynchronous path.
Cancellation or runtime replacement invalidates the request, and consumption
ends geometry collection. An unavailable endpoint skips animation.

During preparation and animation, coalesced mount notifications refresh target
bounds, including safe-area changes, while styles and metadata remain frozen.
Interrupted returns refresh their original source separately. The numeric
geometry feeds renderers and `useSharedElementPresentation`. Subscriptions end
on completion, cancellation, or disposal.

Fabric geometry describes the shadow tree. Native-only transforms outside that
tree are not reflected in captured bounds, so applications must keep endpoint
layout and scroll state stable during the overlay handoff.

## React rendering and native presentation

Geometry readiness and presentation readiness are separate. Captured bounds
allow the overlay to mount, but motion starts only after its receiving hosts are
attached and contain the transferred content.

### iOS preparation and activation

On iOS, a portal host can register before its window container is attached.
Preparation therefore happens in two stages:

- **Preparing.** The session is published to the transition host and paired
  owners through `PreparingSessionContext`. React mounts each renderer with a
  registered, empty receiving host. Screens keep their measuring phase, owners
  keep content at its resting endpoint, and `transitioning` remains false.
  Native attaches the transparent container and reports `attached` when every
  expected host is in the window with nonzero bounds.
- **Active.** Attachment promotes the session in one coordinator change. The
  resulting commit transfers all paired portals into the attached overlay hosts
  and makes their retained presentations `transitioning` together.

The iOS container stays transparent until content arrives. It observes Fabric
mounting transactions and checks readiness after each one, allowing the same
transaction that transfers content to reveal the container before Core Animation
commits it. A Core Animation completion check and bounded display-link retries
provide fallbacks. This confirms hierarchy readiness, rather than the instant
pixels reach the display.

### Android activation

Android mounts hosts and content in the same native transaction, so the session
activates as soon as geometry is captured. The host remains hidden until every
receiving host contains its content. Android acknowledges presentation after
the content draw traversal, using an asynchronous main-queue message to avoid
an extra frame behind a pending synchronization barrier. It validates session
and request identity, attachment, and live content before dispatching the event.

### Content readiness and animation start

Both platforms acknowledge presentation only after all expected hosts are
attached, have nonzero bounds, and contain transferred content. An empty marker
inside each public `PortalHost` identifies its native parent. A second marker,
named `<host>:content`, travels with the retained portal and confirms arrival
even for content that has no native views of its own or has zero size. Host
markers alone do not count as content. Renderer opacity is independent of
readiness, allowing a renderer to start fully faded during a reverse session.

The native host prepares from the React mount and arms content readiness after
attachment. A bounded UI-thread command retries preparation and can replay a
confirmation that arrived before its event handler was installed. Forward
motion starts on the UI thread once both the matching presentation acknowledgment
and animation configuration have arrived, in either order. A final native
identity check rejects removed or recycled endpoints. Session IDs and ownership
tokens reject stale transfers and animation starts. Reverse and interactive
navigation use the same presentation protocol with their own progress and
commit controllers.

The startup overlay-readiness deadline, UI driver, and native retries each
use one-second limits. These bound failures without delaying ready transitions.
If native presentation is already confirmed on the UI thread but its React
Native callback is delayed, the overlay safety check preserves the confirmation.
Failure traces report the last presentation phase, content readiness, and
timeout or invalidation.

After an unconfirmed forward push, content settles onto the destination without
animation. A removed destination cancels toward the source. Registration or
readiness changes revoke pending presentation and release navigation. Reduced
motion transfers content directly to its endpoint.

React mounting, portal transfer, animation configuration, and settlement still
require JavaScript. Startup load can delay motion while content stays at its
previous endpoint. Once prepared and configured, native acknowledgment can
start forward motion while JavaScript is busy.

## Overlay and screen visibility

The native overlay sits above native-stack containers. Its React layout effect
reports overlay readiness, and the native host confirms presentation. Those
signals coordinate visible content with the first overlay paint.

On dismissal, iOS keeps its window container attached while pending portal
commits settle. Android retains the overlay hosts while the settlement commit
retargets the live portals. A native pre-draw check confirms that no transferred
content remains, hides the renderer decorations, and acknowledges the session.
The UI driver can replay this confirmation if its event handler was not yet ready.
The provider then removes the empty hosts and releases the navigation handoff
lock. Delayed acknowledgments cannot release another session, and queued taps
resume after the matching acknowledgment. During this handoff the overlay retains
only renderer inputs, without endpoint registrations or native validation refs.
Both platforms finish the handoff with live content. Overlay content is excluded
from touch hit testing. On iOS,
the window container resolves the returning screen's live input view within the
same Fabric root and window, bypassing decorative opacity while preserving its
input gate. Empty shared-element owners use `box-only` to prevent Teleport from
forwarding hits to remote content. Android excludes overlay content in
`ScreenChoreographyView` because its custom `ViewGroupManager` does not apply
the JSX `pointerEvents` prop.

Screen opacity and input gating come from `screenVisibility.ts`, using
`(direction, role, phase, progress)`. Expansion progress remains 0 at the list
and 1 at the detail, including during a return. A plain outer view applies the
pending or preparing-target visibility gate before Reanimated's initial style
commit, preventing an Android mount flash. Active motion runs on an animated
inner view.

The `screenFade` prop controls active decorative opacity, with a default
expansion interval of `[0, 0.4]` or a custom increasing interval within `[0, 1]`.
`keepVisible` keeps the screen opaque. Preparation visibility and input gates
operate independently of these appearance settings.

### iOS window ownership and accessibility

`ScreenChoreographyView` remains a Fabric-owned anchor for the provider's
lifetime. Live React children mount into its window container, which is attached
only during presentation or the dismissal handoff. The anchor itself stays
under its React parent.

Dismissal retains the container across two main-queue callbacks before detaching
it; this delay is not a display-frame guarantee. Reactivation, removal, and
recycling invalidate pending callbacks. Detached or zero-sized containers and
foreground overlays detach immediately.

The container uses the anchor's actual `UIWindow`. If a full-screen native modal
temporarily detaches an ancestor, the mounted anchor can retain its last known
window association. Removing or recycling the anchor clears that association
and removes the container.

Window containers sit above controller content and below independent window
overlays, such as React Native's FPS monitor. `ChoreographyOverlay` stays above
transition containers, independently of their sessions and acknowledgments. Its
iOS foreground container uses a Fabric touch handler; Android uses a `box-none`
sibling above the transition portal. Only controls receive touches, empty space
passes through, and the foreground container does not act as an accessibility
modal.

A weak responder-chain link to the Fabric anchor lets nested modals find their
original presenting controller. Once attached, a foreground container keeps its
position so rerenders and rotation do not raise it above a modal it presented.

## Reverse transitions and interruption

After a settled forward transition, Back prepares a reverse session while the
outgoing route remains mounted. During committed settlement, a UI-thread
reaction asks `ReverseTransitionController` to remove that route when expansion
progress reaches 0.20. This threshold measures remaining expansion, starts
dismissal, and leaves retained content in the overlay until the spring finishes.
Exact animation completion also commits navigation if the early reaction has
not run. Cancelling an interactive return keeps the detail route.

On Android, each screen has derived progress for companion animations. Before
removing a route, the controller freezes its progress and pointer events, then
crosses two UI animation frames to drain queued mapper and Fabric prop updates.
The overlay and retained presentation clocks keep running. A rejected removal
resumes the screen, while ownership checks prevent an older commit from removing
another route or resuming a newer suspension.

Confirmed route removal allows a new navigation tap to finish the remaining
motion immediately instead of waiting for the spring tail. Once animation
completion and route removal are both confirmed, the provider queues the UI
input handoff and completes the session in the same JavaScript turn. The handoff
is queued before completion invalidates UI ownership, allowing portal retargeting
without another UI-to-JavaScript round trip. Android's separate native settlement
acknowledgment releases the overlay handoff lock before another shared transition
can start.

An interrupted forward transition refreshes source metrics and uses the same
return controller, with the original source as its destination. That destination
can accept queued taps before removal when interaction during transitions is
allowed. Confirmed removal wakes queued navigation, including when focus
arrives before the removal result. The remaining animation owns the overlay until
completion or a new navigation tap. Progress ownership rejects callbacks from replaced animations;
Reanimated completion or explicit navigation interruption determines settlement.

Navigation lineage records the source route instance, group, and spring.
Removal interception routes hardware and navigator Back through reverse
preparation. On Android, Back during an active opening refreshes original source
metrics and follows the in-app reversal. If Back removes the destination before
preparation finishes, the pending opening is cancelled.
`NavigationSessionController` owns navigation locks, queued requests, and replay
checks for these paths.

Forward requests can carry an optional observer. The controller retains its
identity through queue replacement, replay, and session settlement, and releases
it after one terminal event. The provider reports the settled screen and overlay
presentation acknowledgement so completion, cancellation, and fallback remain
distinct. Observers run after bookkeeping and never determine animation or native
navigation completion.

## Transition composition and companion motion

`defineTransition` compiles named bounds and surface recipes into module-stable
`makeTransition` adapters. Typed owner and target wrappers resolve the same role
while preserving the retained subtree. Recipes copy their scalar configuration
at definition time; the coordinator captures endpoint presentation data at
session start. Custom renderers remain module-scoped and keep their host mounted
throughout a session.

`useChoreographyProgress` subscribes to screen-visible session state.
`useChoreographyProgressValue` reads only the stable, screen-scoped expansion
clock, without subscribing to session state or creating an animated style.
`useChoreographyControls` provides a stable, screen-qualified settle callback.
`useLatchedReveal` mounts companion content after a progress threshold, while
`useRevealStyle` and named `Enter` / `Exit` components animate local views.
These local views use screen progress and do not participate in pair discovery
or overlay readiness. Each list item owns its hooks, with stagger intervals
inside the configured group window. Reveals use direction-specific preparation
endpoints and suppress translation under reduced motion.

Retained descendants use `useSharedElementPresentation` for their internal
motion. `useInteractiveTransition` exposes gesture-normalized progress (0 at
detail, 1 at completed return), velocity-aware settlement, and cancellation.
Connecting it to a gesture is explicit; native-stack's built-in swipe gesture
does not supply this progress automatically.

## Dynamic trays

The optional `/tray` entry combines a local stack with Software Mansion's native
bottom sheet. Each provider owns its stack and presents through
`ChoreographyOverlay`. The provider reads `Tray.Stack` and `Tray.Screen`
declarations during render; screens mount only when opened. Definitions must
remain available while used by a live view or queued command.

Software Mansion handles dragging, scrolling, the backdrop, and native sheet
settlement. Reanimated handles page crossfades and card resizing. Content measures
in a fixed destination viewport so intermediate animated heights cannot feed back
into layout. Each page's viewport and content anchor to the card's bottom through
native layout by default; top anchoring places them below the header. Bottom
alignment does not depend on estimated header heights or delayed page measurements.
The card resizes from the active page and header's measured heights. Each viewport
wraps its page's Fabric capture root, preserving page-relative shared-element
coordinates. The header stays above the moving content. Full-screen views use the
available window and keep safe-area padding
inside the card. Stack options control headers, handle visibility, and resize
motion; screens can override the header and handle. The current and outgoing
headers crossfade on the shared stack timeline. The outgoing instance remains
mounted until settlement, with touch and accessibility disabled. The active
header's local layout height sizes the card and content viewport, while
retained entries keep their header height for page-origin mapping. Shared startup
waits for the active custom header's layout. Header heights are released with their
entries and never replace Fabric endpoint capture.

Each presented tray owns an isolated choreography provider. A shared push captures
its source before committing the destination. The coordinator captures each page
origin in the same Fabric batch as its elements, then converts page-relative bounds
into the tray's source and destination positions. This accounts for the native
sheet's offset without sampling native layout. Shared progress drives the card
height, safe-area offset, and crossfade together. Back uses the group recorded on
the pushed entry; retained pages are released after the shared host settles.
On iOS, a transition host nested inside a foreground overlay presents above that
owning overlay while unrelated foreground overlays retain their ordering.

Each entry has one live React instance. Previous entries stay mounted for Back;
popped or replaced entries remain until their transition finishes. Native sheet
settlement releases the whole stack. Pushes normally require an open, idle stack.
During a return, the current screen's first bound push waits for transition
completion and any shared host handoff; later pushes are rejected. Other
navigation requests can also wait for a transition. Dismissal clears pending requests,
and reopening waits for closure. Session and transition IDs reject callbacks from
earlier operations.

Navigation actions use a stable context. The reducer runs in a provider-owned
store; the provider subscribes to the stack, while `useTrayState` subscribes to
selected public state. Screen content is memoized with its component, route, and
stable navigation factory; custom header content is memoized with its renderer and
header props.
The store records whole-tray lifecycle events in dispatch order, and the provider
delivers them after React commits. This preserves events when opening, closing,
and queued reopening are batched. Each session records its first native open
settlement separately from the requested detent, so a drag, content resize, or
duplicate acknowledgement cannot repeat `onPresent`. Closing intent emits
`onWillDismiss`; native closed settlement releases content and emits `onDismiss`.
Layout, keyboard, and transition state stay outside these boundaries. Retained
screens still receive local state, context, and subscribed store updates without
changing their effect lifecycle.

Each factory also supplies a stable route-key context around screen content and
custom header components. Their navigation actions bind pushes to that key; the
reducer atomically rejects pushes from an inactive source and duplicate requests.
The bound key distinguishes a returning screen's next action from stale callbacks
in the outgoing screen. A deferred push is checked again when replayed.
`useFocusEffect` selects whether that key matches the store's current route and
uses a React effect to balance setup and cleanup.
Focus therefore follows route changes during navigation, while dismissal retains
focus until native settlement removes the screen. Provider boundaries reset the
route scope, so nested providers cannot inherit an outer screen's identity.

## Diagnostics

The two example apps share screen implementations and transition recipes.
Provider debug logs and `onPreparationTrace` help distinguish startup work from
animation duration. Traces cover source capture, target registration, Fabric
preparation, and overlay readiness. With tracing enabled, sessions also retain
presentation startup observations: overlay publication and React commits, native
host attachment and content readiness, UI animation dispatch/start, and the JS
acknowledgement. Native timestamp collection additionally requires a build-time
opt-in and is compiled out by default. Native timestamps use their platform clock and must only be
subtracted from other native timestamps. React commit and acknowledgement
intervals can overlap; neither proves when a frame reached the display. See
[troubleshooting](./guide/troubleshooting.md#turn-on-diagnostics) for application
diagnostics, and
[contributing](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/CONTRIBUTING.md)
for the development workflow.
