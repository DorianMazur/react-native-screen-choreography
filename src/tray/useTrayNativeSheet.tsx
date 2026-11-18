import { useLayoutEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import type { ModalBottomSheetProps } from '@swmansion/react-native-bottom-sheet';
import Animated from 'react-native-reanimated';

type WrapNativeView = NonNullable<ModalBottomSheetProps['wrapNativeView']>;

export function useTrayNativeSheet(): {
  wrapNativeView: WrapNativeView;
  reopen: () => void;
} {
  return useMemo(() => {
    let reopen: (() => void) | undefined;
    const wrapNativeView: WrapNativeView = (Component) => {
      const NativeView = Animated.createAnimatedComponent(Component);
      return function TrayNativeSheet(props: ComponentProps<typeof Component>) {
        const [openIndex, setOpenIndex] = useState(1);
        useLayoutEffect(() => {
          reopen = () => {
            // Coalesce callbacks in one batch using the last committed index.
            // Later callbacks can retry even if native recovery was interrupted.
            setOpenIndex(openIndex === 1 ? 2 : 1);
          };
          return () => {
            reopen = undefined;
          };
        }, [openIndex]);
        return (
          <NativeView
            {...props}
            // Native ignores an unchanged index after a user snap. Alternate
            // equivalent open detents to send a fresh command without remounting
            // the sheet or its content. The extra detent is never a drag target.
            detents={[
              ...props.detents,
              { ...props.detents[1]!, programmatic: true },
            ]}
            index={props.index === 0 ? 0 : openIndex}
            onIndexChange={(event) =>
              props.onIndexChange?.({
                ...event,
                nativeEvent: {
                  index:
                    event.nativeEvent.index === 2 ? 1 : event.nativeEvent.index,
                },
              })
            }
            onSettle={(event) => {
              const index = event.nativeEvent.index;
              props.onSettle?.({
                ...event,
                nativeEvent: { index: index === 2 ? 1 : index },
              });
            }}
          />
        );
      };
    };
    return { wrapNativeView, reopen: () => reopen?.() };
  }, []);
}
