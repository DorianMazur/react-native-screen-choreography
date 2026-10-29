---
title: Tray API
description: Options and navigation methods for dynamic trays.
---

# Tray API

Import from `react-native-screen-choreography/tray`. See [Build a dynamic tray](../guide/dynamic-trays.md) for setup and examples.

## `createTray`

`createTray<Routes>()` returns `{ Provider, Stack, Screen, useTray, useTrayState, useFocusEffect, useKeyboard }`. Call it outside render. Each provider owns an independent stack. `useTray` and `useTrayState` find the nearest provider from the same factory; `useFocusEffect` and `useKeyboard` also require one of that provider's screens or custom header components.

Mount the provider in your root layout or around a feature, outside `ChoreographyScreen`. It requires an app-level `KeyboardProvider` from `react-native-keyboard-controller` and manages its own native sheet provider. Present one tray at a time.

## `TrayProviderProps`

`children` contains your app content and exactly one direct `Tray.Stack`. Fragments are supported. Custom components that return a stack declaration are not supported.

## `TrayStackProps`

| Prop              | Default         | Purpose                                                                  |
| ----------------- | --------------- | ------------------------------------------------------------------------ |
| `children`        | Required        | Direct `Tray.Screen` declarations; fragments are supported.              |
| `appearance`      | `'floating'`    | Inset `'floating'` card or bottom-attached `'sheet'`.                    |
| `anchor`          | `'bottom'`      | Keep screen content aligned to the `'top'` or `'bottom'` while resizing. |
| `topInset`        | `0`             | Space above the tray; content inset for full-screen views.               |
| `bottomInset`     | `0`             | Bottom safe area; floating cards add 12 points of spacing.               |
| `horizontalInset` | `16`            | Side spacing for floating cards.                                         |
| `backgroundColor` | `'#ffffff'`     | Card background.                                                         |
| `textColor`       | `'#18181b'`     | Header title and icons.                                                  |
| `renderHeader`    | Built-in header | Replace the header and its buttons; receives `TrayHeaderProps<Routes>`.  |
| `handleVisible`   | `true`          | Show the drag indicator above the header.                                |
| `animation`       | Timing, 240 ms  | Resize and crossfade settings.                                           |
| `onWillPresent`   | —               | Called when a new tray presentation begins.                              |
| `onPresent`       | —               | Called once after the native sheet first settles open.                   |
| `onWillDismiss`   | —               | Called when closing begins, including a drag committed to dismissal.     |
| `onDismiss`       | —               | Called after the sheet finishes closing.                                 |

Declare at least one screen, using `Stack` and `Screen` from the same factory. Unmounting the provider closes the tray directly without calling dismissal callbacks.

Lifecycle callbacks take no arguments and run on the JavaScript thread after React commits the accepted state changes. The `onWill…` callbacks report the start of an operation; they cannot delay or prevent native motion. `onPresent` and `onDismiss` wait for native settlement, including with Reduce Motion enabled.

`onWillPresent` and `onPresent` describe a whole-tray presentation. Pushing, replacing, returning to a screen, resizing, or calling `present()` while already open does not fire them again. If dismissal interrupts opening before it settles, `onPresent` does not fire. A queued reopening fires `onDismiss` for the old presentation before `onWillPresent` for the new one.

`onWillDismiss` covers `dismiss()`, Back at the root, the Close button, the backdrop, and a drag released toward closed. A drag released back to open does not fire it. If a committed close is interrupted by dragging back open, `onDismiss` does not fire; another close attempt can fire `onWillDismiss` again. Use `onDismiss` for work that requires the tray to be gone.

`TrayStackProps<Routes>` types the header's route and navigation actions. Screen options can override `anchor`, `renderHeader`, and `handleVisible`. Hiding the handle removes its spacing and leaves dragging enabled.

The default `anchor="bottom"` keeps incoming and outgoing screens' bottom edges at the bottom of the card's content area as it grows or shrinks, including Back and shared transitions. The header stays at the top, and safe-area padding remains below the content. Anchoring moves each screen without changing its measured height or scroll position. Set `anchor="top"` for top alignment. See [Anchor content during resizing](../guide/dynamic-trays.md#anchor-content-during-resizing).

## `TrayHeaderProps`

`TrayHeaderProps<Routes, Name>` describes a screen's custom header. Omit `Name` for a stack renderer; `route` is then a discriminated union of all routes.

| Member      | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `route`     | This header's route, including its key, name, and typed params. |
| `tray`      | Stable `TrayNavigation<Routes>` actions.                        |
| `title`     | Screen title, falling back to the screen name.                  |
| `canGoBack` | Whether another screen exists below this one.                   |
| `color`     | The stack's `textColor`.                                        |

Return your header element from `renderHeader`, or return `null` to omit the header. The handle is controlled separately. The tray measures the header's natural height and includes it in card sizing, full-screen content space, and shared-transition geometry. Use padding or an explicit height for your design; avoid `flex: 1` on the header root.

Set the screen's `headerHeight` option to reserve a custom header's height before its first layout. Use `0` when the header renders nothing. The measured height replaces this hint; the handle's spacing is added separately.

Headers crossfade automatically on the same progress as the screen transition, including shared transitions and Back. The outgoing header keeps its React instance until the transition settles, with touch and accessibility disabled. It then unmounts; returning to that route mounts its header again. Custom headers own their buttons and accessibility labels. Render a component such as `(props) => <MyHeader {...props} />` to use hooks inside your header.

Layout and transition updates do not rerender custom header content when its renderer and props are unchanged. Local state, context, and `useTrayState` subscriptions still update normally. If the parent renders frequently, define `renderHeader` outside render or memoize it with `useCallback` and its dependencies.

See [Use a custom header](../guide/dynamic-trays.md#use-a-custom-header).

## `TrayAnimationConfig`

Choose one animation for resizing, full-screen expansion, header transitions, and page crossfades between screens:

```tsx
animation={{ type: 'timing', duration: 300 }}
animation={{ type: 'spring', stiffness: 300, damping: 30 }}
```

| Setting            | Default | Meaning                                                  |
| ------------------ | ------- | -------------------------------------------------------- |
| Timing `duration`  | `240`   | Milliseconds; `0` changes immediately.                   |
| Spring `stiffness` | `300`   | Higher values pull more strongly toward the destination. |
| Spring `damping`   | `30`    | Higher values reduce bounce.                             |

Timing animations use cubic ease-out. Duration must be finite and nonnegative. Spring values must be finite and positive. Updated settings apply to the next animation. System Reduce Motion is respected.

Opening, dragging, and dismissal use Software Mansion's native motion. Keyboard movement follows the system keyboard. Neither is configured here.

## `TrayScreenDeclarationProps`

`TrayScreenDeclarationProps<Routes, Name>` describes a `Tray.Screen`:

- `name`: a name from `Routes`, unique within the stack.
- `component`: a component accepting `TrayScreenProps<Routes, Name>`. Define it outside render.
- `options`: optional `TrayScreenOptions<Routes, Name>`.

Declare every destination you intend to open; navigating to an undeclared name throws. Keep declarations and components unchanged while the tray is open. Options can change without resetting screen state.

## `TrayScreenOptions`

| Option          | Default        | Meaning                                                                                              |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| `title`         | Screen name    | Text shown in the header.                                                                            |
| `presentation`  | `'tray'`       | Content-sized `'tray'` or `'fullScreen'`.                                                            |
| `anchor`        | Stack setting  | Keep this screen's content aligned to the `'top'` or `'bottom'` while resizing.                      |
| `renderHeader`  | Stack renderer | Replace this screen's header; receives `TrayHeaderProps<Routes, Name>`. Return `null` for no header. |
| `handleVisible` | Stack setting  | Show or hide the drag indicator for this screen.                                                     |
| `headerHeight`  | `56`           | Initial custom header height, excluding the handle, until layout measures it. Use `0` for no header. |

Full-screen views fill the available window with no outside spacing or rounded corners. `topInset` and `bottomInset` become inside padding, and content fills the remaining height. The content viewport resizes with each keyboard frame, so a flex layout can center fields and keep a footer above the keyboard. The bottom safe-area inset is replaced by the keyboard edge while typing. See [Center a form and keep its action above the keyboard](../guide/dynamic-trays.md#center-a-form-and-keep-its-action-above-the-keyboard).

## `TrayNavigation`

Returned by `useTray()` and passed to screens and custom headers as `tray`. Actions stay stable for that provider, screen, or header instance. Using them does not subscribe a component to stack changes.

| Member                         | Behavior                                           |
| ------------------------------ | -------------------------------------------------- |
| `present(name, params)`        | Open a fresh root, replacing any current stack.    |
| `push(name, params, options?)` | Add a screen, optionally with a shared transition. |
| `replace(name, params)`        | Replace the current screen.                        |
| `back()`                       | Return to the previous screen; close at the root.  |
| `popToRoot()`                  | Return to the first screen.                        |
| `dismiss()`                    | Close the whole tray.                              |

Parameters are optional only when the route type includes `undefined`. Methods return `void`. Navigation dismisses the keyboard without restoring input focus on Back; ignored pushes leave the keyboard alone.

`push` normally accepts requests only while open, with no preparation, transition, or pending navigation; additional pushes are ignored. Inside a screen or custom header, pushes from `useTray()` or the `tray` prop also require that owning route to be current. Actions obtained outside screens apply to the current route.

An incoming screen can receive taps before its transition finishes, including forward navigation, Back, and `popToRoot()`. Its first `push` waits for completion, including any shared-element handoff, then runs automatically. Further pushes are ignored while that request is pending. This applies to actions bound to the incoming screen or its header; outgoing screens and actions obtained outside screens cannot queue a push during a transition.

Other navigation requests can wait for an in-progress transition. Dismissal clears pending navigation. A `present()` during closing waits until the sheet closes; the latest request wins. Other commands do nothing while closed or closing.

## `TrayNavigationOptions`

Pass `{ groupId: string }` as the third argument to `push` to animate matching shared elements between the current screen and the pushed screen. The group must be nonempty. Back remembers it automatically; no options are needed on `back()`.

Use `SharedElement` and `SharedElement.Target` from `/core`, with matching IDs and the same transition. See [Share an element between tray screens](../guide/dynamic-trays.md#share-an-element-between-tray-screens).

`replace` uses a crossfade. `popToRoot` reverses a shared transition only when the root was its original source. Missing matching elements fall back to a crossfade.

## `TrayState`

Read reactive state with `Tray.useTrayState(selector)`:

```tsx
const isPresented = Tray.useTrayState((state) => state.isPresented);
const depth = Tray.useTrayState((state) => state.depth);
const route = Tray.useTrayState((state) => state.route);
```

| Member        | Behavior                                   |
| ------------- | ------------------------------------------ |
| `route`       | Current route, or `undefined` when closed. |
| `depth`       | Number of screens in the stack.            |
| `isPresented` | True while opening, open, or closing.      |

The selector receives `TrayState<Routes>`. A stack update rerenders the consumer only if the selected value changes according to `Object.is`. Prefer selecting a field or primitive; returning a new object or array counts as a change. To observe changes to any of these public fields, select `(state) => state`.

`isPresented` describes visibility across the whole session, not animation completion. Use the `Tray.Stack` lifecycle callbacks to observe opening and closing, or `useFocusEffect` for individual screen focus.

## `Tray.useFocusEffect`

Run an effect while the enclosing tray screen is the current route:

```tsx
Tray.useFocusEffect(
  useCallback(() => {
    const unsubscribe = subscribeToUpdates();
    return unsubscribe;
  }, [subscribeToUpdates])
);
```

Call it inside a screen, a descendant component, or a component returned by `renderHeader`. The hook identifies the route instance automatically. Calling it elsewhere, including the app content directly inside `Tray.Provider`, throws.

The callback runs after the focused component commits and again when Back returns to it. Its optional cleanup runs on blur, unmount, or before a changed callback runs while focused. Wrap the callback in React's `useCallback` with all of its dependencies; an inline callback restarts the effect on every focused render. Changes while blurred take effect on the next focus. Return a cleanup function or nothing, not a Promise; start asynchronous work inside the callback and cancel or ignore its results during cleanup.

By default, focus follows `state.route.key`, independently of animation completion or app foreground state. A shared push keeps the source focused during source preparation, then focuses the destination when the route changes, even if its layout is still pending. Dismissal keeps the current route focused until native sheet settlement unmounts it. Unmounting the provider cleans up immediately. Separate tray providers have independent focus.

The optional second argument accepts `TrayFocusEffectOptions`. Use `{ afterTransition: true }` for autofocus or work that requires a settled screen:

```tsx
Tray.useFocusEffect(
  useCallback(() => {
    input.current?.focus();
  }, []),
  { afterTransition: true }
);
```

With this option, the callback waits for the native sheet to settle open, screen preparation and animation to finish, shared-element handoff to finish, and queued navigation to run. It runs again after a settled return to the screen. Mounting an observer in an already settled screen also runs the callback. Keyboard movement and ordinary content resizing do not restart it.

The cleanup runs when another navigation starts, the tray starts closing, the callback or option changes, or the observer unmounts. A cancelled dismissal can run the callback again after the sheet settles open. Pending callbacks are skipped when the screen is no longer eligible. This option follows actual completion signals, including with springs or Reduce Motion; it does not use a timer.

See [Run work while a screen is focused](../guide/dynamic-trays.md#run-work-while-a-screen-is-focused).

## `TrayFocusEffectOptions`

The second argument to `Tray.useFocusEffect`:

| Option            | Default | Meaning                                                                                      |
| ----------------- | ------- | -------------------------------------------------------------------------------------------- |
| `afterTransition` | `false` | Run only while the current screen and native sheet are settled and no navigation is pending. |

Memoize the effect callback with `useCallback`; the options object may be inline.

## `Tray.useKeyboard`

`Tray.useKeyboard()` returns `TrayKeyboardState` from the keyboard driver that positions this tray. Call it inside one of the factory's screens, its descendants, or a custom header component. Calling it from app content outside the tray host throws, even if that content is under `Tray.Provider`.

```tsx
const { progress, isVisible } = Tray.useKeyboard();
const style = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
```

Use the shared values in Reanimated worklets for opacity and other companion animation. Read `isVisible` during React rendering for touch and accessibility props. The shared-value references remain stable through keyboard movement; keyboard frames do not trigger React renders. A visibility change rerenders subscribers, including retained screens that use the hook.

The tray already applies keyboard avoidance and safe-area handling. Adding the keyboard height to a full-screen page's padding or using a second keyboard-aware wrapper would apply that offset twice. Use ordinary flex layout for centered fields and a bottom footer. See [Forms and scrolling](../guide/dynamic-trays.md#forms-and-scrolling).

## `TrayKeyboardState`

| Member      | Type                  | Meaning                                                                         |
| ----------- | --------------------- | ------------------------------------------------------------------------------- |
| `height`    | `SharedValue<number>` | Nonnegative keyboard height in points; `0` when hidden.                         |
| `progress`  | `SharedValue<number>` | Keyboard animation progress, clamped to `0`–`1`; supports interactive movement. |
| `isVisible` | `boolean`             | True from the start of opening until the keyboard is fully hidden.              |

Treat `height` and `progress` as read-only signals. `isVisible` is suitable for `pointerEvents`, `accessibilityElementsHidden`, and `importantForAccessibility` when content fades away while typing. It is separate from animation progress, so hiding content from screen readers does not require a React update on every frame.

## `TrayParamList`

Maps route names to parameters, for example:

```ts
type Routes = {
  note: undefined;
  preview: { text: string };
};
```

## `TrayRoute`

`TrayRoute<Routes, Name>` contains `key`, `name`, and `params`. Each push gets a unique key, even for the same screen name. Omitting `Name` gives the union of all route types.

## `TrayScreenProps`

`TrayScreenProps<Routes, Name>` supplies the screen's `route` and `tray` navigation object. The route belongs to that screen instance, even while another screen is above it.
