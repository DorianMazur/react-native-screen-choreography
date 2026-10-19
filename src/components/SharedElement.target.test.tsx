import { createContext, useContext, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SharedElement } from './SharedElement';
import { makeMutable } from 'react-native-reanimated';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  ChoreographyControlsContext,
  PreparingSessionContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ScreenIdContext } from '../core/screenIdContext';
import {
  useSharedElementPresentation,
  type SharedElementPresentation,
} from '../core/SharedElementPresentation';
import type { TransitionSessionData, ElementTransitionPair } from '../types';

jest.mock('react-native-teleport', () => ({
  PortalHost: 'PortalHost',
  Portal: 'Portal',
}));

const RouteContext = createContext('source');
const small = { pageX: 40, pageY: 300, width: 72, height: 72 };
const large = { pageX: 0, pageY: 24, width: 400, height: 800 };

async function harness() {
  const progress = makeMutable(0);
  const screenProgress = makeMutable(0);
  const controls = { progress: screenProgress, settleTransition: jest.fn() };
  let settledScreen = 'detail';
  let presentation!: SharedElementPresentation;
  let increment!: () => void;
  let count = 0;
  const renderContent = jest.fn();
  const releaseContent = jest.fn();
  const actions = {
    registerElement: jest.fn(),
    unregisterElement: jest.fn(),
    registerTargetContent: jest.fn(() => releaseContent),
    getSettledScreenId: () => settledScreen,
  } as unknown as ChoreographyActionsType;
  function Content({ label }: { label: string }) {
    presentation = useSharedElementPresentation();
    const [value, setValue] = useState(0);
    increment = () => setValue((v) => v + 1);
    count = value;
    renderContent(label, useContext(RouteContext));
    return null;
  }
  const content = <Content label="first" />;
  let tree: ReactTestRenderer;
  const render = async (
    session: TransitionSessionData | null,
    options: {
      group?: string;
      children?: React.ReactNode;
      pending?: string;
      child?: boolean;
    } = {}
  ) => {
    const context = {
      activeSession: session?.state === 'preparing' ? null : session,
      progress,
      pendingTargetScreenId: options.pending,
    } as unknown as ChoreographyContextType;
    const app = (
      <ChoreographyActionsContext.Provider value={actions}>
        <ChoreographyContext.Provider value={context}>
          <PreparingSessionContext.Provider
            value={session?.state === 'preparing' ? session : null}
          >
            <ChoreographyControlsContext.Provider value={controls}>
              <ScreenIdContext.Provider value="detail">
                <RouteContext.Provider value="destination">
                  <SharedElement.Target
                    id="app"
                    groupId={options.group ?? 'group'}
                  >
                    {options.child === false
                      ? null
                      : (options.children ?? content)}
                  </SharedElement.Target>
                </RouteContext.Provider>
              </ScreenIdContext.Provider>
            </ChoreographyControlsContext.Provider>
          </PreparingSessionContext.Provider>
        </ChoreographyContext.Provider>
      </ChoreographyActionsContext.Provider>
    );
    await act(async () => {
      if (tree) tree.update(app);
      else tree = create(app);
    });
  };
  const session = (
    direction: 'forward' | 'backward' = 'forward',
    size = small
  ): TransitionSessionData => {
    const backward = direction === 'backward';
    const sourceScreenId = backward ? 'detail' : 'list';
    const targetScreenId = backward ? 'list' : 'detail';
    return {
      id: direction,
      groupId: 'group',
      state: 'active',
      direction,
      progress,
      sourceScreenId,
      targetScreenId,
      pairs: [
        {
          id: 'app',
          source: { screenId: sourceScreenId },
          target: { screenId: targetScreenId },
          sourceMetrics: backward ? large : size,
          targetMetrics: backward ? size : large,
          sourcePresentation: { metadata: backward ? 'detail' : 'icon' },
          targetPresentation: { metadata: backward ? 'icon' : 'detail' },
        } as ElementTransitionPair,
      ],
    };
  };
  await render(null);
  return {
    render,
    session,
    actions,
    renderContent,
    releaseContent,
    screenProgress,
    progress,
    get presentation() {
      return presentation;
    },
    get count() {
      return count;
    },
    increment: () => act(async () => increment()),
    settle: (id: string) => {
      settledScreen = id;
    },
    unmount: () => act(async () => tree.unmount()),
    changedContent: <Content label="updated" />,
  };
}

test('target content is route-owned, prepared before activation, and keeps its state through settlement and cancelled Back', async () => {
  const h = await harness();
  try {
    expect(h.presentation.presentationProgress.value).toBe(1);
    expect(h.presentation.frame.value).toBeNull();
    expect(h.renderContent).toHaveBeenLastCalledWith('first', 'destination');
    const forward = h.session();
    await h.render({ ...forward, state: 'preparing' });
    expect(h.presentation.transitioning).toBe(false);
    expect(h.presentation.presentationProgress.value).toBe(0);
    expect(h.presentation.collapsed.metrics).toEqual(small);
    expect(h.presentation.frame.value).toEqual({ width: 72, height: 72 });
    await h.render(forward);
    h.screenProgress.value = 0.5;
    expect(h.presentation.presentationProgress.value).toBe(0.5);
    expect(h.presentation.frame.value).toEqual({ width: 236, height: 436 });
    h.screenProgress.value = 1;
    await h.render(null);
    expect(h.presentation.presentationProgress.value).toBe(1);
    expect(h.presentation.expanded.metrics).toEqual(large);
    expect(h.presentation.frame.value).toBeNull();
    await h.increment();
    const reverse = h.session('backward', {
      ...small,
      pageY: 500,
      width: 56,
      height: 56,
    });
    await h.render(reverse);
    h.screenProgress.value = 0.1;
    expect(h.presentation.presentationProgress.value).toBe(0.1);
    expect(h.presentation.collapsed.metrics?.pageY).toBe(500);
    expect(h.presentation.expanded.metadata).toBe('detail');
    h.screenProgress.value = 1;
    await h.render(null);
    expect(h.count).toBe(1);
    expect(h.presentation.presentationProgress.value).toBe(1);
    expect(h.actions.registerElement).toHaveBeenCalledTimes(1);
    expect(h.actions.registerTargetContent).toHaveBeenCalledTimes(1);
    expect(h.releaseContent).not.toHaveBeenCalled();
  } finally {
    await h.unmount();
  }
  expect(h.releaseContent).toHaveBeenCalledTimes(1);
});

test('unrelated sessions and pending screens stay outside the presentation boundary; application updates still work', async () => {
  const h = await harness();
  try {
    h.renderContent.mockClear();
    const session = h.session();
    await h.render({ ...session, groupId: 'another' }, { pending: 'other' });
    await h.render({
      ...session,
      pairs: [{ ...session.pairs[0]!, id: 'other' }],
    });
    await h.render({
      ...session,
      pairs: [
        {
          ...session.pairs[0]!,
          source: { ...session.pairs[0]!.source, screenId: 'elsewhere' },
          target: { ...session.pairs[0]!.target, screenId: 'elsewhere2' },
        },
      ],
    });
    expect(h.renderContent).not.toHaveBeenCalled();
    h.screenProgress.value = 0.3;
    expect(h.presentation.presentationProgress.value).toBe(1);
    await h.render(null, { children: h.changedContent });
    expect(h.renderContent).toHaveBeenLastCalledWith('updated', 'destination');
    await h.increment();
    expect(h.count).toBe(1);
  } finally {
    await h.unmount();
  }
});

test('fallback, reduced motion, recycled identity, and child removal release the right presentation', async () => {
  const h = await harness();
  try {
    await h.render({ ...h.session(), state: 'preparing' });
    await h.render(null);
    expect(h.presentation.presentationProgress.value).toBe(1);
    expect(h.presentation.collapsed.metrics).toBeNull();
    await h.render({ ...h.session(), reducedMotion: true });
    expect(h.presentation.presentationProgress.value).toBe(1);
    expect(h.presentation.frame.value).toBeNull();
    await h.render(null);
    await h.render(null, { group: 'replacement' });
    expect(h.presentation.collapsed.metrics).toBeNull();
    expect(h.presentation.presentationProgress.value).toBe(1);
    expect(h.releaseContent).toHaveBeenCalledTimes(1);
    const registrations = (h.actions.registerElement as jest.Mock).mock.calls
      .length;
    await h.render(null, { group: 'replacement', child: false });
    expect(h.releaseContent).toHaveBeenCalledTimes(2);
    expect(h.actions.registerElement).toHaveBeenCalledTimes(registrations);
  } finally {
    await h.unmount();
  }
});
