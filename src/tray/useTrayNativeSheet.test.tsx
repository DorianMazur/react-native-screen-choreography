import { useState } from 'react';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { act, render } from '@testing-library/react-native';
import type { ModalBottomSheetProps } from '@swmansion/react-native-bottom-sheet';
import { useTrayNativeSheet } from './useTrayNativeSheet';

type NativeProps = ComponentProps<
  Parameters<NonNullable<ModalBottomSheetProps['wrapNativeView']>>[0]
>;

function NativeSheet(props: NativeProps) {
  return <View {...props} />;
}

function fixture() {
  function Fixture() {
    const sheet = useTrayNativeSheet();
    const [Wrapped] = useState(() => sheet.wrapNativeView(NativeSheet));
    const rejectClose: NativeProps['onIndexChange'] = (event) => {
      if (event.nativeEvent.index === 0) sheet.reopen();
    };
    return (
      <Wrapped
        modal
        index={1}
        detents={[
          { value: 0, kind: 'points', programmatic: true },
          { value: 0, kind: 'content', programmatic: false },
        ]}
        onIndexChange={rejectClose}
        onSettle={rejectClose}
      />
    );
  }
  const renderer = render(<Fixture />);
  const native = () =>
    renderer.UNSAFE_getByType(NativeSheet).props as NativeProps;
  const emit = (event: 'onIndexChange' | 'onSettle', index: number) => {
    native()[event]?.({ nativeEvent: { index } } as Parameters<
      NonNullable<NativeProps[typeof event]>
    >[0]);
  };
  return { native, emit };
}

test.each([
  { outcome: 'settles at another open detent', settledIndex: 1 },
  { outcome: 'never settles', settledIndex: undefined },
])('retries a blocked close after recovery $outcome', ({ settledIndex }) => {
  const { native, emit } = fixture();
  act(() => emit('onIndexChange', 0));
  const requestedIndex = native().index;
  if (settledIndex !== undefined) {
    act(() => emit('onSettle', settledIndex));
  }
  act(() => emit('onIndexChange', 0));
  expect(native().index).not.toBe(requestedIndex);
  expect(native().detents[native().index]?.kind).toBe('content');
});

test('coalesces a blocked snap and settlement but retries a later closed settlement', () => {
  const { native, emit } = fixture();
  const initialIndex = native().index;
  act(() => {
    emit('onIndexChange', 0);
    emit('onSettle', 0);
  });
  const requestedIndex = native().index;
  expect(requestedIndex).not.toBe(initialIndex);
  expect(native().detents[requestedIndex]?.kind).toBe('content');

  act(() => emit('onSettle', 0));
  expect(native().index).not.toBe(requestedIndex);
  expect(native().detents[native().index]?.kind).toBe('content');
});
