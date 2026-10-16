---
title: Dynamic trays
description: Build a bottom sheet that resizes as you move between views.
---

# Build a dynamic tray

A tray holds several views inside one bottom sheet. Moving between them resizes the sheet and crossfades the content. Back restores the previous view, including form values and scroll position.

The optional `/tray` entry uses Software Mansion's native bottom sheet and provides its own typed stack. It works alongside your app's navigation without adding another navigation library.

## Install

Follow the [base installation](./installation.md), then add the sheet package:

```sh
npm install @swmansion/react-native-bottom-sheet@0.16.2
```

Install iOS pods and rebuild the native app. Expo requires a development build. Apps that don't use `/tray` don't need the sheet package.

## Define your screens

Create the tray and screen components outside render. The route type defines each screen's parameters:

```tsx
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import {
  createTray,
  type TrayScreenProps,
} from 'react-native-screen-choreography/tray';

type Routes = {
  note: undefined;
  preview: { text: string };
};

export const Tray = createTray<Routes>();

function Note({ tray }: TrayScreenProps<Routes, 'note'>) {
  const [text, setText] = useState('');
  return (
    <View style={{ padding: 24 }}>
      <TextInput
        accessibilityLabel="Note"
        value={text}
        onChangeText={setText}
      />
      <Button title="Preview" onPress={() => tray.push('preview', { text })} />
    </View>
  );
}

function Preview({ route }: TrayScreenProps<Routes, 'preview'>) {
  return <Text style={{ padding: 24 }}>{route.params.text}</Text>;
}
```

## Add the provider

Place the provider in your root layout or around the feature that uses it. It owns only this tray's stack. Keep it outside `ChoreographyScreen` wrappers.

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function NoteTrayProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Tray.Provider>
      {children}
      <Tray.Stack topInset={insets.top + 12} bottomInset={insets.bottom}>
        <Tray.Screen
          name="note"
          component={Note}
          options={{ title: 'Write a note' }}
        />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{ title: 'Preview' }}
        />
      </Tray.Stack>
    </Tray.Provider>
  );
}
```

This example uses your app's `SafeAreaProvider`. You can also pass numeric insets directly. There is no need to add Software Mansion's `BottomSheetProvider`.

Each provider needs one direct `Tray.Stack` containing `Tray.Screen` declarations. Fragments are supported; custom components that return declarations are not. Screens mount only when opened.

## Open, navigate, and close

Use `Tray.useTray()` anywhere inside the provider. Screens also receive the same API through their `tray` prop:

```tsx
function OpenNoteButton() {
  const tray = Tray.useTray();
  return <Button title="Write a note" onPress={() => tray.present('note')} />;
}
```

| Method                  | Behavior                                         |
| ----------------------- | ------------------------------------------------ |
| `present(name, params)` | Open a fresh stack at this screen.               |
| `push(name, params)`    | Add a screen, keeping previous screens for Back. |
| `replace(name, params)` | Replace the current screen.                      |
| `back()`                | Go back one screen, or close at the root.        |
| `popToRoot()`           | Return to the first screen.                      |
| `dismiss()`             | Close the whole tray.                            |

Route names and parameters are typed. The navigation object stays stable, so calling `useTray()` does not subscribe your component to stack changes.

When your UI needs tray state, select the value with `useTrayState`:

```tsx
const isPresented = Tray.useTrayState((state) => state.isPresented);
```

This subscription updates only when `isPresented` changes. You can also select `state.route` or `state.depth`.

Close, tapping the backdrop, and dragging down dismiss the whole tray. Android Back closes the keyboard first, then goes back through the stack. Use `onDismiss` on `Tray.Stack` to run work after the sheet has closed.

## Change the appearance and motion

Configure shared styling and icons once on `Tray.Stack`. Use `appearance="floating"` (the default) for an inset card or `appearance="sheet"` for a sheet attached to the bottom edge.

```tsx
import { Image } from 'react-native';

<Tray.Stack
  backgroundColor="#23252b"
  textColor="#f4f5f7"
  renderBackIcon={({ color, size }) => (
    <Image
      source={require('./icons/arrow-left.png')}
      style={{ width: size, height: size, tintColor: color }}
    />
  )}
  renderCloseIcon={({ color, size }) => (
    <Image
      source={require('./icons/close.png')}
      style={{ width: size, height: size, tintColor: color }}
    />
  )}
  animation={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Stack>;
```

Return just the icon; the stack supplies the button, accessibility label, and action. Omitting a renderer keeps the default icon.

For a fixed duration:

```tsx
animation={{ type: 'timing', duration: 300 }}
```

You can also pass `easing` using Reanimated's `Easing` helpers. The default is 240 ms with cubic ease-out.

These settings control resizing, full-screen expansion, and page crossfades, and respect system Reduce Motion. Opening, dragging, and dismissal use Software Mansion's native motion.

## Expand to full screen

Give a screen more room with `presentation: 'fullScreen'`:

```tsx
<Tray.Screen
  name="preview"
  component={Preview}
  options={{ title: 'Preview', presentation: 'fullScreen' }}
/>
```

The same sheet expands to fill the available window, with the supplied safe-area insets inside it. Moving to a normal screen shrinks it back to that screen's content. Going Back preserves each screen's state and scroll position.

Full-screen sizing is chosen per screen. Dragging down still dismisses the tray.

## Forms and scrolling

Use normal React Native inputs and scroll views. The tray handles keyboard avoidance. For scrolling forms, use `keyboardShouldPersistTaps="handled"` so buttons work while typing.

A root `ScrollView` is bounded by the available height. For short, content-sized screens, avoid `flex: 1` on a non-scrollable root.

Previous screens stay mounted for Back, so their effects continue running. Popped screens unmount after their transition; closing releases the whole stack. Keep state outside the tray if it should survive reopening.

Screen content is memoized separately from its animated wrapper. Unchanged screens skip renders caused by navigation and tray layout. Their own state, context, and selected tray state still update normally, including while another screen is above them.

## Multiple trays

Call `createTray` for each flow, such as a wallet or search filters. Each provider has its own stack and hook scope. You can keep several providers in the root layout or place them around individual features.

Present one tray at a time. To open another after closing, use the first tray's `onDismiss` callback.

See the [wallet tray demo](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/tray/TrayDemo.tsx) for a full-screen recipient list and retained forms, or the [API reference](../api/tray.md) for all options.
