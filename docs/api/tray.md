---
title: Tray API
description: Options and navigation methods for dynamic trays.
---

# Tray API

Import from `react-native-screen-choreography/tray`. See [Build a dynamic tray](../guide/dynamic-trays.md) for setup and examples.

## `createTray`

`createTray<Routes>()` returns `{ Provider, Stack, Screen, useTray }`. Call it outside render. Each provider owns an independent stack; `useTray()` finds the nearest provider from the same factory and throws if none exists.

Mount the provider in your root layout or around a feature, outside `ChoreographyScreen`. It manages its own native sheet provider. Present one tray at a time.

## `TrayProviderProps`

`children` contains your app content and exactly one direct `Tray.Stack`. Fragments are supported. Custom components that return a stack declaration are not supported.

## `TrayStackProps`

| Prop              | Default        | Purpose                                                     |
| ----------------- | -------------- | ----------------------------------------------------------- |
| `children`        | Required       | Direct `Tray.Screen` declarations; fragments are supported. |
| `appearance`      | `'floating'`   | Inset `'floating'` card or bottom-attached `'sheet'`.       |
| `topInset`        | `0`            | Space above the tray; inside padding for full-screen views. |
| `bottomInset`     | `0`            | Bottom safe area; floating cards add 12 points of spacing.  |
| `horizontalInset` | `16`           | Side spacing for floating cards.                            |
| `backgroundColor` | `'#ffffff'`    | Card background.                                            |
| `textColor`       | `'#18181b'`    | Header title and icons.                                     |
| `renderBackIcon`  | Chevron        | Render the Back icon for this stack.                        |
| `renderCloseIcon` | ×              | Render the Close icon for this stack.                       |
| `animation`       | Timing, 240 ms | Resize and crossfade settings.                              |
| `onDismiss`       | —              | Called after the sheet finishes closing.                    |

Declare at least one screen, using `Stack` and `Screen` from the same factory. Unmounting the provider closes the tray directly without calling `onDismiss`.

## `TrayHeaderIconProps`

Both icon renderers receive `{ color, size }`. `color` is the stack's `textColor` and `size` is 24 points. Return an image, SVG, or another icon component.

The stack supplies the accessible 44-point button and its action. Back is hidden at the root. Omitting a renderer keeps the default icon.

## `TrayAnimationConfig`

Choose one animation for resizing, full-screen expansion, and page crossfades:

```tsx
animation={{ type: 'timing', duration: 300 }}
animation={{ type: 'spring', stiffness: 300, damping: 30 }}
```

| Setting            | Default        | Meaning                                                  |
| ------------------ | -------------- | -------------------------------------------------------- |
| Timing `duration`  | `240`          | Milliseconds; `0` changes immediately.                   |
| Timing `easing`    | Cubic ease-out | A Reanimated easing function.                            |
| Spring `stiffness` | `300`          | Higher values pull more strongly toward the destination. |
| Spring `damping`   | `30`           | Higher values reduce bounce.                             |

Duration must be finite and nonnegative. Spring values must be finite and positive. Updated settings apply to the next animation. System Reduce Motion is respected.

Opening, dragging, and dismissal use Software Mansion's native motion and are not configured here.

## `TrayScreenDeclarationProps`

`TrayScreenDeclarationProps<Routes, Name>` describes a `Tray.Screen`:

- `name`: a name from `Routes`, unique within the stack.
- `component`: a component accepting `TrayScreenProps<Routes, Name>`. Define it outside render.
- `options`: optional `TrayScreenOptions`.

Declare every destination you intend to open; navigating to an undeclared name throws. Keep a screen's declaration and component unchanged while it is in the stack, finishing an exit, or waiting to open. Options can change without resetting its state.

## `TrayScreenOptions`

| Option         | Default     | Meaning                                   |
| -------------- | ----------- | ----------------------------------------- |
| `title`        | Screen name | Text shown in the header.                 |
| `presentation` | `'tray'`    | Content-sized `'tray'` or `'fullScreen'`. |

Full-screen views fill the available window with no outside spacing or rounded corners. `topInset` and `bottomInset` become inside padding, and content fills the remaining height. Keyboard avoidance still applies.

## `TrayNavigation`

Returned by `useTray()` and passed to screens as `tray`:

| Member                  | Behavior                                          |
| ----------------------- | ------------------------------------------------- |
| `present(name, params)` | Open a fresh root, replacing any current stack.   |
| `push(name, params)`    | Add a screen.                                     |
| `replace(name, params)` | Replace the current screen.                       |
| `back()`                | Return to the previous screen; close at the root. |
| `popToRoot()`           | Return to the first screen.                       |
| `dismiss()`             | Close the whole tray.                             |
| `route`                 | Current route, or `undefined` when closed.        |
| `depth`                 | Number of screens in the stack.                   |
| `isPresented`           | True while opening, open, or closing.             |

Parameters are optional only when the route type includes `undefined`. Methods return `void`.

Rapid navigation requests run in order. Dismissal clears pending navigation. A `present()` during closing waits until the sheet closes; the latest request wins. Other commands do nothing while closed or closing.

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
