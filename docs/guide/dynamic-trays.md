---
title: Dynamic trays
description: Build a bottom sheet that resizes as you move between views.
---

# Build a dynamic tray

A tray holds several views inside one bottom sheet. Moving between them resizes the sheet and crossfades the content. Back restores the previous view, including form values and scroll position.

The optional `/tray` entry uses Software Mansion's native bottom sheet. It works alongside your app's navigation without adding another navigation library.

## Install

Follow the [base installation](./installation.md), then add the tray dependencies:

```sh
npm install @swmansion/react-native-bottom-sheet@0.16.2 react-native-keyboard-controller@^1.22.7
```

These packages are required only for trays. Apps using the main, `/core`, or `/expo-router` entry without trays don't need either one.

Install iOS pods and rebuild the native app. Expo requires a development build.

## Define your screens

Create the tray and screen components outside render. This example lets someone write a note, preview it, and go Back to edit it:

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

Place the provider in your root layout or around the feature that uses it, outside `ChoreographyScreen` wrappers. Declare the screens in `Tray.Stack`:

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

Wrap the tray provider with `KeyboardProvider` so the sheet moves with the keyboard. This example also uses `SafeAreaProvider` for the screen insets. Reuse these providers if your app already has them; no `BottomSheetProvider` is needed.

```tsx
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <NoteTrayProvider>
          <OpenNoteButton />
        </NoteTrayProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
```

In an existing app, place your navigation or Expo Router layout where `OpenNoteButton` appears above.

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

Use `useTrayState` when your UI needs to react to tray state:

```tsx
const isPresented = Tray.useTrayState((state) => state.isPresented);
```

You can also select `state.route` or `state.depth`. Components update only when their selected value changes; `useTray()` alone doesn't subscribe to changes.

Close, tapping the backdrop, and dragging down dismiss the whole tray. Android Back closes the keyboard first, then goes back through the stack. Use `onDismiss` on `Tray.Stack` to run work after the sheet has closed.

## Expand to full screen

Give a screen more room with `presentation: 'fullScreen'`:

```tsx
<Tray.Screen
  name="preview"
  component={Preview}
  options={{ title: 'Preview', presentation: 'fullScreen' }}
/>
```

The sheet expands to fill the available window, keeping the supplied safe-area insets inside it. Returning to a normal screen shrinks it back to that screen's content.

Full-screen sizing is chosen per screen. Dragging down still dismisses the tray.

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

The default is 240 ms with cubic ease-out. These settings control transitions between screens, including shared elements and resizing, and respect system Reduce Motion. Opening and dismissal use the native sheet's motion; keyboard movement follows the system keyboard.

## Forms and scrolling

Use normal React Native inputs and scroll views. The tray moves with the keyboard. For scrolling forms, use `keyboardShouldPersistTaps="handled"` so buttons work while typing.

Navigating between screens dismisses the keyboard. Back preserves the form values and scroll position, but doesn't automatically focus an input again. Call the input's `focus()` only when your flow needs it.

A root `ScrollView` fits within the available height. For short, content-sized screens, avoid `flex: 1` on a non-scrollable root.

Previous screens stay mounted for Back, so their effects and subscriptions remain active. Closing the tray resets its screens. Keep drafts outside the tray if they should survive reopening.

## Multiple trays

Call `createTray` for each flow, such as a wallet or search filters. Each provider has its own stack and hook scope. You can keep several providers in the root layout or place them around individual features.

Present one tray at a time. To open another after closing, use the first tray's `onDismiss` callback.

## Share an element between tray screens

For a flow such as choosing a recipient and reviewing a payment, an avatar can move between screens. Define a [transition recipe](./transitions.md) outside render:

```tsx
import { defineTransition } from 'react-native-screen-choreography/core';

const recipient = defineTransition({
  shared: { avatar: { kind: 'bounds', radius: [21, 36] } },
});
```

Wrap the avatar on the source screen:

```tsx
<recipient.Element
  name="avatar"
  groupId={`recipient:${person.id}`}
  style={{ width: 42, height: 42 }}
>
  <Avatar person={person} />
</recipient.Element>
```

Place its destination on the review screen, using the same name and group:

```tsx
<recipient.Element.Target
  name="avatar"
  groupId={`recipient:${route.params.person.id}`}
  style={{ width: 72, height: 72 }}
/>
```

Pass the group when pushing your declared `review` screen:

```tsx
tray.push('review', { person }, { groupId: `recipient:${person.id}` });
```

Back reverses the transition automatically. The stack's `animation` controls its timing. Keep the source element mounted and use a distinct group for each item; the destination displays the same avatar, so it doesn't need another child.

Shared elements must belong to the same tray. If a matching element is unavailable, the screens use the normal crossfade. No extra choreography provider is needed.

See the [wallet tray demo](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/tray/TrayDemo.tsx) for a full-screen recipient list and retained forms, or the [API reference](../api/tray.md) for all options.
