---
title: Tray API
description: Options and navigation methods for dynamic trays.
---

# Tray API

Import from `react-native-screen-choreography/tray`. See [Build a dynamic tray](../guide/dynamic-trays.md) for setup and examples.

## `createTray`

`createTray<Routes>()` returns `{ Provider, Stack, Screen, useTray, useTrayState }`. Call it outside render. Each provider owns an independent stack; both hooks find the nearest provider from the same factory and throw if none exists.

Mount the provider in your root layout or around a feature, outside `ChoreographyScreen`. It requires an app-level `KeyboardProvider` from `react-native-keyboard-controller` and manages its own native sheet provider. Present one tray at a time.

## `TrayProviderProps`

`children` contains your app content and exactly one direct `Tray.Stack`. Fragments are supported. Custom components that return a stack declaration are not supported.

## `TrayStackProps`

| Prop              | Default         | Purpose                                                                 |
| ----------------- | --------------- | ----------------------------------------------------------------------- |
| `children`        | Required        | Direct `Tray.Screen` declarations; fragments are supported.             |
| `appearance`      | `'floating'`    | Inset `'floating'` card or bottom-attached `'sheet'`.                   |
| `topInset`        | `0`             | Space above the tray; content inset for full-screen views.              |
| `bottomInset`     | `0`             | Bottom safe area; floating cards add 12 points of spacing.              |
| `horizontalInset` | `16`            | Side spacing for floating cards.                                        |
| `backgroundColor` | `'#ffffff'`     | Card background.                                                        |
| `textColor`       | `'#18181b'`     | Header title and icons.                                                 |
| `renderHeader`    | Built-in header | Replace the header and its buttons; receives `TrayHeaderProps<Routes>`. |
| `handleVisible`   | `true`          | Show the drag indicator above the header.                               |
| `renderBackIcon`  | Chevron         | Render the Back icon for this stack.                                    |
| `renderCloseIcon` | ×               | Render the Close icon for this stack.                                   |
| `animation`       | Timing, 240 ms  | Resize and crossfade settings.                                          |
| `onDismiss`       | —               | Called after the sheet finishes closing.                                |

Declare at least one screen, using `Stack` and `Screen` from the same factory. Unmounting the provider closes the tray directly without calling `onDismiss`.

`TrayStackProps<Routes>` types the header's route and navigation actions. Screen options can override `renderHeader` and `handleVisible`. Hiding the handle removes its spacing and leaves dragging enabled.

## `TrayHeaderProps`

`TrayHeaderProps<Routes, Name>` describes the active screen's custom header. Omit `Name` for a stack renderer; `route` is then a discriminated union of all routes.

| Member      | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| `route`     | Current route, including its key, name, and typed params. |
| `tray`      | Stable `TrayNavigation<Routes>` actions.                  |
| `title`     | Screen title, falling back to the screen name.            |
| `canGoBack` | Whether another screen exists below this one.             |
| `color`     | The stack's `textColor`.                                  |

Return your header element from `renderHeader`, or return `null` to omit the header. The handle is controlled separately. The tray measures the header's natural height and includes it in card sizing, full-screen content space, and shared-transition geometry. Use padding or an explicit height for your design; avoid `flex: 1` on the header root.

Only the current custom header is mounted, and it remounts when the route key changes. It owns its buttons, accessibility labels, and any animation of its content. The tray continues to animate card resizing. Render a component such as `(props) => <MyHeader {...props} />` to use hooks inside your header.

See [Use a custom header](../guide/dynamic-trays.md#use-a-custom-header).

## `TrayHeaderIconProps`

Both icon renderers receive `{ color, size }`. `color` is the stack's `textColor` and `size` is 24 points. Return an image, SVG, or another icon component.

The stack supplies the accessible 44-point button and its action. Back is hidden at the root. Omitting a renderer keeps the default icon. These options apply only to the built-in header; a custom header owns its buttons.

## `TrayAnimationConfig`

Choose one animation for resizing, full-screen expansion, header transitions, and page crossfades:

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
| `renderHeader`  | Stack renderer | Replace this screen's header; receives `TrayHeaderProps<Routes, Name>`. Return `null` for no header. |
| `handleVisible` | Stack setting  | Show or hide the drag indicator for this screen.                                                     |

Full-screen views fill the available window with no outside spacing or rounded corners. `topInset` and `bottomInset` become inside padding, and content fills the remaining height. Keyboard avoidance still applies.

## `TrayNavigation`

Returned by `useTray()` and passed to screens as `tray`. The object and its methods stay stable for the provider's lifetime. Using them does not subscribe a component to stack changes.

| Member                         | Behavior                                           |
| ------------------------------ | -------------------------------------------------- |
| `present(name, params)`        | Open a fresh root, replacing any current stack.    |
| `push(name, params, options?)` | Add a screen, optionally with a shared transition. |
| `replace(name, params)`        | Replace the current screen.                        |
| `back()`                       | Return to the previous screen; close at the root.  |
| `popToRoot()`                  | Return to the first screen.                        |
| `dismiss()`                    | Close the whole tray.                              |

Parameters are optional only when the route type includes `undefined`. Methods return `void` and dismiss the keyboard without restoring input focus on Back.

Rapid navigation requests run in order. Dismissal clears pending navigation. A `present()` during closing waits until the sheet closes; the latest request wins. Other commands do nothing while closed or closing.

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

The selector receives `TrayState<Routes>`. A stack update rerenders the consumer only if the selected value changes according to `Object.is`. Prefer selecting a field or primitive; returning a new object or array counts as a change. To observe every state change, select `(state) => state`.

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
