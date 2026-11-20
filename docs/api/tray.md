---
title: Tray API
description: Options and navigation methods for dynamic trays.
---

# Tray API

Import from `react-native-screen-choreography` or `react-native-screen-choreography/expo-router`. See [Build a dynamic tray](../guide/dynamic-trays.md) for setup and examples.

## `createTrayNavigator`

Call `createTrayNavigator<Routes>()` outside render. Register its `Navigator` alongside a return screen in a parent stack using `layout={trayStackLayout}`. Declare pages with its `Screen` and `Group` components. Each descriptor renders a React Navigation screen, with route keys, params, focus, actions and listeners in the parent app's navigation tree. Use the matching `/expo-router/tray` entry inside Expo Router.

## `trayStackLayout`

Pass this function to the parent navigator’s `layout` prop. It renders the app and its tray routes as siblings. The screen underneath accepts new taps and scrolls as soon as the sheet and its backdrop disappear. The closing spring finishes in the retained sheet. Put regular screens that need native headers, gestures or transitions in the app’s nested navigator.

## `TrayNavigatorProps`

The navigator accepts React Navigation options including `initialRouteName`, `screenOptions` and `screenListeners`, plus the following presentation settings.

| Prop                   | Default         | Purpose                                                                            |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `children`             | Required        | Screen or Group declarations, including fragments.                                 |
| `appearance`           | `'floating'`    | Inset `'floating'` card or bottom-attached `'sheet'`.                              |
| `anchor`               | `'bottom'`      | Keep screen content aligned to the `'top'` or `'bottom'` while resizing.           |
| `topInset`             | `0`             | Space above the tray; content inset for full-screen views.                         |
| `bottomInset`          | `0`             | Space below floating cards or bottom padding inside sheets and full-screen views.  |
| `horizontalInset`      | `16`            | Side spacing for floating cards.                                                   |
| `keyboardInset`        | `12`            | Space between floating cards and the open keyboard.                                |
| `backgroundColor`      | `'#ffffff'`     | Card background.                                                                   |
| `textColor`            | `'#18181b'`     | Header title and icons.                                                            |
| `renderHeader`         | Built-in header | Replace the header and its buttons; receives `TrayHeaderProps`.                    |
| `renderContentHeader`  | —               | Render persistent content below the navigation header.                             |
| `handleVisible`        | `true`          | Show the drag indicator above the header.                                          |
| `dismissDisabled`      | `false`         | Block drag, backdrop, Close, and root Back dismissal.                              |
| `animation`            | Timing, 240 ms  | Resize and crossfade settings.                                                     |
| `fullScreenTransition` | `'fade'`        | `'fade'` or `'slide'` between full-screen screens.                                 |
| `onWillPresent`        | —               | Called when a new tray presentation begins.                                        |
| `onPresent`            | —               | Called once after the native sheet first settles open.                             |
| `onNavigate`           | —               | Called with the destination when the current screen changes within a presentation. |
| `onWillDismiss`        | —               | Called when closing begins, including a drag committed to dismissal.               |
| `onDismiss`            | —               | Called after the sheet finishes closing.                                           |

Set `dismissDisabled` to block backdrop, drag, Close, and Android Back at the root while saving. Inner Back and programmatic dismissal remain available. Custom headers receive the flag and apply it to their Close control.

Lifecycle callbacks receive `TrayLifecycleDetails`, except `onDismiss`, which takes no arguments. They run on the JavaScript thread after React commits the accepted state changes. The `onWill…` callbacks report the start of an operation; they cannot delay or prevent native motion. `onPresent` and `onDismiss` wait for native settlement, including with Reduce Motion enabled.

`onWillPresent` receives the initial screen; `onPresent` receives the screen the sheet settled on, before queued navigation runs. `onNavigate` receives the destination of a push, replacement, or Back, without waiting for its animation to finish. It does not fire for the initial screen of a presentation. `onWillDismiss` receives the screen being dismissed.

Set `fullScreenTransition="slide"` for a 32-point sideways movement alongside the page crossfade: forward moves the incoming page from the right and the outgoing page to the left; Back reverses this. Both screens must use `presentation: 'fullScreen'`. Moves involving content-sized screens and shared-element transitions keep their crossfade. The `animation` setting controls the slide timing too.

`onWillPresent` and `onPresent` describe a whole-tray presentation. Navigating inside the sheet or resizing it does not fire them again. If dismissal interrupts opening before it settles, `onPresent` does not fire.

`onWillDismiss` covers sheet dismissal, Back at the root, the Close button, the backdrop, and a drag released toward closed. A drag released back to open does not fire it. If a committed close is interrupted by dragging back open, `onDismiss` does not fire; another close attempt can fire `onWillDismiss` again. Use `onDismiss` for work that requires the tray to be gone.

The default `anchor="bottom"` keeps incoming and outgoing screens' bottom edges at the bottom of the card's content area as it grows or shrinks, including Back and shared transitions. The header stays at the top, and safe-area padding remains below the content. Anchoring moves each screen without changing its measured height or scroll position. Set `anchor="top"` for top alignment. See [Anchor content during resizing](../guide/dynamic-trays.md#anchor-content-during-resizing).

## `TrayLifecycleDetails`

`TrayLifecycleDetails` contains `route` (the screen's key, name, and params) and `options` (its declared `TrayScreenOptions`, with `title` and `presentation` defaults applied). It does not include the screen component or resolve inherited stack options.

## `TrayHeaderProps`

`TrayHeaderProps` describes a screen's custom header.

| Member            | Meaning                                                         |
| ----------------- | --------------------------------------------------------------- |
| `route`           | This header's route, including its key, name, and typed params. |
| `navigation`      | React Navigation object for this route.                         |
| `title`           | Screen title, falling back to the screen name.                  |
| `canGoBack`       | Whether another screen exists below this one.                   |
| `dismiss`         | Close the whole tray.                                           |
| `dismissDisabled` | Whether the custom header should disable its Close control.     |
| `color`           | The stack's `textColor`.                                        |

Return your header element from `renderHeader`, or return `null` to omit the header. The handle is controlled separately. The tray measures the header's natural height and includes it in card sizing, full-screen content space, and shared-transition geometry. Use padding or an explicit height for your design; avoid `flex: 1` on the header root.

Set the screen's `headerHeight` option to reserve a custom header's height before its first layout. Use `0` when the header renders nothing. The measured height replaces this hint; the handle's spacing is added separately.

Headers crossfade automatically on the same progress as the screen transition, including shared transitions and Back. The outgoing header keeps its React instance until the transition settles, with touch and accessibility disabled. It then unmounts; returning to that route mounts its header again. Custom headers own their buttons and accessibility labels. Render a component such as `(props) => <MyHeader {...props} />` to use hooks inside your header.

Layout and transition updates do not rerender custom header content when its renderer and props are unchanged. Local state, context, and navigation subscriptions still update normally. If the parent renders frequently, define `renderHeader` outside render or memoize it with `useCallback` and its dependencies.

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

## `TrayScreenOptions`

| Option          | Default        | Meaning                                                                                              |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| `title`         | Screen name    | Text shown in the header.                                                                            |
| `presentation`  | `'tray'`       | Content-sized `'tray'` or `'fullScreen'`.                                                            |
| `anchor`        | Stack setting  | Keep this screen's content aligned to the `'top'` or `'bottom'` while resizing.                      |
| `renderHeader`  | Stack renderer | Replace this screen's header; receives `TrayHeaderProps`. Return `null` for no header.               |
| `handleVisible` | Stack setting  | Show or hide the drag indicator for this screen.                                                     |
| `headerHeight`  | `56`           | Initial custom header height, excluding the handle, until layout measures it. Use `0` for no header. |

Full-screen views fill the available window with no outside spacing or rounded corners. `topInset` and `bottomInset` become inside padding, and content fills the remaining height. The content viewport resizes with each keyboard frame, so a flex layout can center fields and keep a footer above the keyboard. The bottom safe-area inset is replaced by the keyboard edge while typing. See [Center a form and keep its action above the keyboard](../guide/dynamic-trays.md#center-a-form-and-keep-its-action-above-the-keyboard).

## `TrayNavigationProp` and `TrayScreenProps`

`TrayScreenProps<Routes, Name>` types the usual `route` and `navigation` screen props. The navigator uses React Navigation stack actions including `push`, `replace`, `popToTop`, and `goBack`. Back from the first page closes the parent tray route. A screen's first push during its arrival is displayed once the current transition finishes. Repeated pushes from outgoing screens are ignored.

## `useTrayDismiss`

Returns a callback that closes the entire tray from a screen or header. Navigation focus returns to the parent as the backdrop finishes fading. The native spring can finish after focus returns. A cancelled drag preserves the route.

## `useTraySettled`

Returns true for the focused screen or header after native opening and page animation, including a shared-element handoff. Use this with an effect for autofocus. Standard React Navigation focus hooks also work in tray screens.

## `useTrayKeyboard`

Returns the keyboard state used by the enclosing tray. Use `height` or `progress` in a worklet and `isVisible` for touch and accessibility props. See [Forms and scrolling](../guide/dynamic-trays.md#forms-and-scrolling).

## `TrayKeyboardState`

| Member      | Type                  | Meaning                                                                         |
| ----------- | --------------------- | ------------------------------------------------------------------------------- |
| `height`    | `SharedValue<number>` | Nonnegative keyboard height in points; `0` when hidden.                         |
| `progress`  | `SharedValue<number>` | Keyboard animation progress, clamped to `0`–`1`; supports interactive movement. |
| `isVisible` | `boolean`             | True from the start of opening until the keyboard is fully hidden.              |

Treat `height` and `progress` as read-only signals. `isVisible` is suitable for `pointerEvents`, `accessibilityElementsHidden`, and `importantForAccessibility` when content fades away while typing. It is separate from animation progress, so hiding content from screen readers does not require a React update on every frame.

## `TrayContentHeaderProps`

`renderContentHeader` receives the previous and active route names (`from`, `to`) and a Reanimated `progress` value from 0 to 1. Set `contentHeaderHeight` in each participating screen’s options. The default is zero.
