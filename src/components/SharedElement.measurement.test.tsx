import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyActionsContext,
  type ChoreographyActionsType,
} from '../core/ChoreographyContext';
import { ScreenIdContext } from '../core/screenIdContext';
import type { RegisteredElement } from '../types';
import { SharedElement } from './SharedElement';

jest.mock('react-native-teleport', () => ({
  Portal: 'Portal',
  PortalHost: 'PortalHost',
}));

test('registers both stable refs and reports layout without re-registering', async () => {
  const node = { id: 'native-view' };
  const registerElement = jest.fn();
  const unregisterElement = jest.fn();
  const onElementLayout = jest.fn();
  const actions = {
    registerElement,
    unregisterElement,
    onElementLayout,
  } as unknown as ChoreographyActionsType;
  const render = (width: number) => (
    <ChoreographyActionsContext.Provider value={actions}>
      <ScreenIdContext.Provider value="detail">
        <SharedElement.Target
          id="hero"
          groupId="trip"
          style={{ width, height: 100 }}
        />
      </ScreenIdContext.Provider>
    </ChoreographyActionsContext.Provider>
  );
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(render(100), { createNodeMock: () => node });
    });
    const registered = registerElement.mock.calls[0]![0] as RegisteredElement;
    const getNode = registered.ref as () => unknown;
    const measurementRef = registered.measurementRef!;
    const wrapper = () =>
      tree.root.findByType('Animated.View' as React.ElementType);
    const onLayout = wrapper().props.onLayout;
    expect(getNode()).toBe(node);
    expect(measurementRef.current).toBe(node);
    await act(async () => tree.update(render(200)));
    expect(registerElement).toHaveBeenCalledTimes(1);
    expect(unregisterElement).not.toHaveBeenCalled();
    expect(registered.ref).toBe(getNode);
    expect(registered.measurementRef).toBe(measurementRef);
    expect(wrapper().props.onLayout).toBe(onLayout);
    await act(async () => onLayout());
    expect(onElementLayout).toHaveBeenCalledWith('hero', 'detail', 'trip');
    await act(async () => tree.unmount());
    expect(getNode()).toBeNull();
    expect(unregisterElement).toHaveBeenCalledWith('hero', 'detail', 'trip');
  } finally {
    await act(async () => tree?.unmount());
  }
});
