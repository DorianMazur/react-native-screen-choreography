import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ExampleBindings,
  useExampleNavigation,
  useInteractiveTransition,
  type ExampleNavigation,
  type ExampleInteractiveTransition,
} from '../examples/shared/runtime';

jest.mock('react-native-screen-choreography/core', () => ({}), {
  virtual: true,
});
jest.mock('react-native-safe-area-context', () => ({}), { virtual: true });

test('separate bindings provide ordinary command values without global configuration', async () => {
  const first = {
    open: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as ExampleNavigation;
  const second = {
    open: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as ExampleNavigation;
  const gesture = { isActive: false } as ExampleInteractiveTransition;
  const observed: ExampleNavigation[] = [];
  function Consumer() {
    observed.push(useExampleNavigation());
    expect(useInteractiveTransition()).toBe(gesture);
    return null;
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <>
        <ExampleBindings navigation={first} interactive={gesture}>
          <Consumer />
        </ExampleBindings>
        <ExampleBindings navigation={second} interactive={gesture}>
          <Consumer />
        </ExampleBindings>
      </>
    );
  });
  expect(observed).toEqual([first, second]);
  await act(async () => tree.unmount());
});
