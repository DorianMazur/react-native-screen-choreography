import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
  const [isVisible, setIsVisible] = useState(layoutHeight > 0);
  const visibility = useSharedValue(isVisible);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const updateVisibility = useCallback((visible: boolean) => {
    if (mounted.current) setIsVisible(visible);
  }, []);
  const updateLayoutHeight = useCallback((next: number) => {
    if (mounted.current) setLayoutHeight(next);
  }, []);
  const showKeyboard = () => {
    'worklet';
    if (!visibility.value) {
      visibility.value = true;
      scheduleOnRN(updateVisibility, true);
    }
  };
  const updateKeyboard = (nextHeight: number, nextProgress: number) => {
    'worklet';
    height.value = Math.max(0, nextHeight);
    progress.value = Math.max(0, Math.min(1, nextProgress));
  };
  const updateVisible = () => {
    'worklet';
    const visible = height.value > 0;
    if (visible !== visibility.value) {
      visibility.value = visible;
      scheduleOnRN(updateVisibility, visible);
    }
  };

  useKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        // Disable hidden companion content as opening starts, not after the
        // first visible frame. Keep it disabled throughout closing.
        if (event.height > 0) showKeyboard();
        if (event.height < height.value)
          scheduleOnRN(updateLayoutHeight, Math.max(0, event.height));
      },
      onMove: (event) => {
        'worklet';
        updateKeyboard(event.height, event.progress);
        if (height.value > 0) showKeyboard();
      },
      onInteractive: (event) => {
        'worklet';
        updateKeyboard(event.height, event.progress);
        updateVisible();
      },
      onEnd: (event) => {
        'worklet';
        updateKeyboard(event.height, event.progress);
        updateVisible();
        scheduleOnRN(updateLayoutHeight, height.value);
      },
    },
    [height, progress, visibility, updateVisibility, updateLayoutHeight]
  );

  return { height, progress, isVisible, layoutHeight };
}
