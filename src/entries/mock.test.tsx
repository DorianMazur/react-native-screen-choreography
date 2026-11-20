import { useState } from 'react';
import { Button, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as expoTray from 'react-native-screen-choreography/expo-router/tray';
import {
  createTrayNavigator,
  trayStackLayout,
  useTrayDismiss,
  useTrayKeyboard,
  useTraySettled,
  type TrayScreenProps,
} from 'react-native-screen-choreography/tray';

// Source entries resolve before a build; /mock paths use the package exports.
jest.mock('react-native-screen-choreography', () =>
  require('react-native-screen-choreography/mock')
);
jest.mock('react-native-screen-choreography/expo-router', () =>
  require('react-native-screen-choreography/mock/expo-router')
);
jest.mock('react-native-screen-choreography/tray', () =>
  require('react-native-screen-choreography/mock/tray')
);

jest.mock('react-native-screen-choreography/expo-router/tray', () =>
  require('react-native-screen-choreography/mock/expo-router/tray')
);
jest.mock('expo-router/react-navigation', () => {
  throw new Error('The tray mock loaded Expo Router navigation');
});

// Packaged mocks must work without the native runtimes or optional peers.
jest.mock('react-native-reanimated', () => {
  throw new Error('The choreography mock loaded Reanimated');
});
jest.mock('react-native-worklets', () => {
  throw new Error('The choreography mock loaded Worklets');
});
jest.mock('@react-navigation/native', () => {
  throw new Error('The choreography mock loaded React Navigation');
});
jest.mock('expo-router', () => {
  throw new Error('The choreography mock loaded Expo Router');
});
jest.mock('@swmansion/react-native-bottom-sheet', () => {
  throw new Error('The choreography mock loaded the native sheet');
});
jest.mock('react-native-keyboard-controller', () => {
  throw new Error('The choreography mock loaded the keyboard controller');
});

test.each([trayStackLayout, expoTray.trayStackLayout])(
  'the tray stack mock retains the underlying screen across dismissal',
  (layout) => {
    function Counter() {
      const [count, setCount] = useState(0);
      return (
        <Button title={`Count ${count}`} onPress={() => setCount(count + 1)} />
      );
    }
    const descriptors = {
      app: { render: () => <Counter /> },
      tray: { render: () => <Text>Sheet</Text> },
    };
    const routes = [{ key: 'app' }, { key: 'tray' }];
    const tree = (index: number) => (
      <>
        {layout({
          state: { routes: routes.slice(0, index + 1), index },
          descriptors,
        })}
      </>
    );
    const view = render(tree(0));
    fireEvent.press(view.getByText('Count 0'));
    view.rerender(tree(1));
    expect(view.getByText('Sheet')).toBeTruthy();
    view.rerender(tree(0));
    expect(view.getByText('Count 1')).toBeTruthy();
  }
);

test.each([createTrayNavigator, expoTray.createTrayNavigator])(
  'a mocked tray presents declared screens, retains local state on Back, and dismisses',
  (createNavigator) => {
    type Routes = { list: undefined; detail: { label: string } };
    const Tray = createNavigator<Routes>();
    const onDismiss = jest.fn();
    function List({ navigation }: TrayScreenProps<Routes, 'list'>) {
      const [count, setCount] = useState(0);
      return (
        <>
          <Button
            title={`Count ${count}`}
            onPress={() => setCount(count + 1)}
          />
          <Button
            title="Show detail"
            onPress={() => navigation.push('detail', { label: 'Hello' })}
          />
        </>
      );
    }
    function Detail({ route }: TrayScreenProps<Routes, 'detail'>) {
      const dismiss = useTrayDismiss();
      const { isVisible, height, progress } = useTrayKeyboard();
      expect([isVisible, height.get(), progress.value]).toEqual([false, 0, 0]);
      return (
        <Button
          title={route.params.label}
          disabled={!useTraySettled()}
          onPress={dismiss}
        />
      );
    }
    const result = render(
      <Tray.Navigator onDismiss={onDismiss}>
        <Tray.Screen name="list" component={List} />
        <Tray.Group>
          <Tray.Screen name="detail" component={Detail} />
        </Tray.Group>
      </Tray.Navigator>
    );
    fireEvent.press(result.getByText('Count 0'));
    fireEvent.press(result.getByText('Show detail'));
    expect(result.getByText('Hello')).toBeTruthy();
    fireEvent.press(result.getByLabelText('Back in tray'));
    expect(result.getByText('Count 1')).toBeTruthy();
    fireEvent.press(result.getByText('Show detail'));
    fireEvent.press(result.getByText('Hello'));
    expect(result.queryByText('Count 1')).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  }
);
