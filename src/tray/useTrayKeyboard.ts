import { useState } from 'react';
import {
  KeyboardController,
  useKeyboardHandler,
} from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export function useTrayKeyboard() {
  const [layoutHeight, setLayoutHeight] = useState(() =>
    KeyboardController.isVisible() ? KeyboardController.state().height : 0
  );
  const height = useSharedValue(layoutHeight);
  const progress = useSharedValue(layoutHeight > 0 ? 1 : 0);

  useKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        if (event.height < height.value)
          scheduleOnRN(setLayoutHeight, Math.max(0, event.height));
      },
      onMove: (event) => {
        'worklet';
        height.value = Math.max(0, event.height);
        progress.value = Math.max(0, Math.min(1, event.progress));
      },
      onInteractive: (event) => {
        'worklet';
        height.value = Math.max(0, event.height);
        progress.value = Math.max(0, Math.min(1, event.progress));
      },
      onEnd: (event) => {
        'worklet';
        height.value = Math.max(0, event.height);
        progress.value = Math.max(0, Math.min(1, event.progress));
        scheduleOnRN(setLayoutHeight, height.value);
      },
    },
    [height, progress]
  );

  return { height, progress, layoutHeight };
}
