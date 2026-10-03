const path = require('path');
const vm = require('vm');
const { transformFileSync } = require('@babel/core');
const React = require('react');
const { act, create } = require('react-test-renderer');
const {
  ChoreographyActionsContext,
  ChoreographyContext,
} = require('../core/ChoreographyContext');
const { ScreenIdContext } = require('../core/screenIdContext');
const {
  useSharedElementPresentation,
} = require('../core/SharedElementPresentation');

jest.mock('react-native-teleport', () => ({
  Portal: 'Portal',
  PortalHost: 'PortalHost',
}));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  useDerivedValue: (updater) => {
    const { useRef } = jest.requireActual('react');
    const latest = useRef(updater);
    latest.current = updater;
    return useRef({
      get value() {
        return latest.current();
      },
      get closure() {
        return latest.current.__closure;
      },
    }).current;
  },
}));

// Compile the real component with Worklets: Reanimated subscribes to captured
// shared values even when the updater returns early without reading them.
const { code } = transformFileSync(
  path.resolve(__dirname, 'SharedElement.tsx'),
  {
    configFile: false,
    babelrc: false,
    plugins: [
      ['@babel/plugin-transform-typescript', { isTSX: true }],
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs',
      'react-native-worklets/plugin',
    ],
  }
);
const compiled = { exports: {} };
vm.runInNewContext(code, {
  require,
  module: compiled,
  exports: compiled.exports,
  global: { Error },
});
const { SharedElement } = compiled.exports;

function captures(value, input) {
  if (value === input) return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((child) => captures(child, input));
}

test('only paired frames subscribe to progress among 300 mounted owners', async () => {
  const progress = { value: 0 };
  const presentations = [];
  const renderContent = jest.fn();
  function Content({ index }) {
    presentations[index] = useSharedElementPresentation();
    renderContent();
    return null;
  }
  const owners = Array.from({ length: 300 }, (_, index) => (
    <SharedElement key={index} id="card" groupId={`group-${index}`}>
      <Content index={index} />
    </SharedElement>
  ));
  const actions = {
    registerElement: jest.fn(),
    unregisterElement: jest.fn(),
    getSettledScreenId: () => 'list',
    subscribeToScreenRemoval: () => () => {},
  };
  const session = {
    id: 'session',
    groupId: 'group-0',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    state: 'preparing',
    direction: 'forward',
    progress,
    pairs: [
      {
        id: 'card',
        source: { screenId: 'list' },
        target: { screenId: 'detail' },
        sourceMetrics: { pageX: 0, pageY: 0, width: 100, height: 50 },
        targetMetrics: { pageX: 0, pageY: 0, width: 300, height: 200 },
        sourcePresentation: {},
        targetPresentation: {},
      },
    ],
  };
  const render = (activeSession) => (
    <ChoreographyActionsContext.Provider value={actions}>
      <ChoreographyContext.Provider value={{ activeSession, progress }}>
        <ScreenIdContext.Provider value="list">
          {owners}
        </ScreenIdContext.Provider>
      </ChoreographyContext.Provider>
    </ChoreographyActionsContext.Provider>
  );
  const subscribed = () =>
    presentations.filter((p) => captures(p.frame.closure, progress));
  let tree;
  try {
    await act(async () => {
      tree = create(render(null));
    });
    expect(subscribed()).toHaveLength(0);
    await act(async () => tree.update(render(session)));
    expect(subscribed()).toEqual([presentations[0]]);
    expect(presentations[0].frame.value).toEqual({ width: 100, height: 50 });
    await act(async () => tree.update(render({ ...session, state: 'active' })));
    expect(subscribed()).toEqual([presentations[0]]);
    renderContent.mockClear();
    for (const [value, width, height] of [
      [-0.2, 100, 50],
      [0.5, 200, 125],
      [1.2, 300, 200],
    ]) {
      progress.value = value;
      expect(presentations[0].frame.value).toEqual({ width, height });
    }
    expect(renderContent).not.toHaveBeenCalled();
    await act(async () => tree.update(render(null)));
    expect(subscribed()).toHaveLength(0);
    expect(presentations.every((p) => p.frame.value === null)).toBe(true);
    await act(async () =>
      tree.update(render({ ...session, state: 'active', reducedMotion: true }))
    );
    expect(subscribed()).toHaveLength(0);
  } finally {
    await act(async () => tree?.unmount());
  }
});
