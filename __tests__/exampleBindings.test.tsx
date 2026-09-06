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
  expect(observed).toHaveLength(2);
  expect(observed[0]).not.toBe(observed[1]);
  observed[0]!.open('GalleryList');
  observed[1]!.open('MusicList');
  expect(first.open).toHaveBeenCalledWith('GalleryList');
  expect(second.open).toHaveBeenCalledWith('MusicList');
  await act(async () => tree.unmount());
});

test('navigation consumers stay stable while bindings update their commands', async () => {
  const first: ExampleNavigation = {
    open: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
  };
  const second: ExampleNavigation = {
    open: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
  };
  const gesture = { isActive: false } as ExampleInteractiveTransition;
  const render = jest.fn();
  let commands!: ExampleNavigation;
  function Consumer() {
    commands = useExampleNavigation();
    render();
    return null;
  }
  const child = <Consumer />;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ExampleBindings navigation={first} interactive={gesture}>
        {child}
      </ExampleBindings>
    );
  });
  const initialCommands = commands;
  await act(async () => {
    tree.update(
      <ExampleBindings
        navigation={second}
        interactive={{ ...gesture, isActive: true }}
      >
        {child}
      </ExampleBindings>
    );
  });
  expect(render).toHaveBeenCalledTimes(1);
  expect(commands).toBe(initialCommands);
  commands.open('GalleryList');
  await commands.navigate({
    screen: 'GalleryDetail',
    params: { photoId: 'aurora' },
  });
  await commands.goBack();
  expect(first.open).not.toHaveBeenCalled();
  expect(first.navigate).not.toHaveBeenCalled();
  expect(first.goBack).not.toHaveBeenCalled();
  expect(second.open).toHaveBeenCalledWith('GalleryList');
  expect(second.navigate).toHaveBeenCalledWith({
    screen: 'GalleryDetail',
    params: { photoId: 'aurora' },
  });
  expect(second.goBack).toHaveBeenCalled();
  await act(async () => tree.unmount());
});
