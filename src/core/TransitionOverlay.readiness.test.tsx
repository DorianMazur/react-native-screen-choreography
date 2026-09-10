import { StrictMode } from 'react';
import { Image } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TransitionOverlay } from './TransitionOverlay';
import {
  createDeclarativeRenderer,
  image,
} from '../transitions/declarativeRecipes';
import type { ElementTransitionPair, TransitionSessionData } from '../types';
import { ElementVisibilityRegistry } from './ElementVisibilityRegistry';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
}));

function session(id: string): TransitionSessionData {
  const transition = {
    renderer: createDeclarativeRenderer({ shared: image({ mode: 'morph' }) }),
  };
  const metrics = { pageX: 0, pageY: 0, width: 100, height: 100 };
  const presentation = {
    transition,
    content: (
      <Image
        source={{ uri: 'photo.jpg', width: 400, height: 300 }}
        resizeMode="cover"
      />
    ),
  };
  const pairs: ElementTransitionPair[] = ['photo', 'other-photo'].map(
    (name) => {
      const source = {
        id: name,
        groupId: 'group',
        screenId: 'list',
        ref: () => null,
        metrics,
        getPresentation: () => presentation,
      };
      return {
        id: name,
        source,
        target: { ...source, screenId: 'detail' },
        sourceMetrics: metrics,
        targetMetrics: metrics,
        sourcePresentation: presentation,
        targetPresentation: presentation,
        transition,
      };
    }
  );
  return {
    id,
    groupId: 'group',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    direction: 'forward',
    state: 'active',
    progress: { value: 0 } as TransitionSessionData['progress'],
    pairs,
  };
}

test.each([false, true])(
  'overlay waits for every image before handing off, StrictMode=%s',
  async (strict) => {
    const visibility = new ElementVisibilityRegistry();
    const original = visibility.get('original', false);
    const onReady = jest.fn((id: string) =>
      visibility.sync(new Set(['original']), id)
    );
    let tree!: ReactTestRenderer;
    const render = (id: string) => {
      const data = session(id);
      const overlay = (
        <TransitionOverlay
          session={data}
          progress={data.progress}
          handoff={visibility.handoff}
          onReady={onReady}
        />
      );
      return strict ? <StrictMode>{overlay}</StrictMode> : overlay;
    };
    try {
      await act(async () => {
        tree = create(render('first'));
      });
      expect(onReady).not.toHaveBeenCalled();
      expect(original.value).toBe(0);
      const firstImages = tree.root.findAllByType(Image);
      await act(async () => firstImages[0]!.props.onLoad());
      expect(onReady).not.toHaveBeenCalled();
      expect(original.value).toBe(0);
      await act(async () => firstImages[1]!.props.onLoad());
      expect(onReady).toHaveBeenCalledTimes(1);
      expect(onReady).toHaveBeenLastCalledWith('first');
      expect(original.value).toBe(1);

      const oldOnLoad = firstImages[1]!.props.onLoad;
      await act(async () => {
        visibility.clear();
        tree.update(render('second'));
      });
      await act(async () => oldOnLoad());
      expect(onReady).toHaveBeenCalledTimes(1);
      const secondImages = tree.root.findAllByType(Image);
      await act(async () =>
        secondImages.forEach((node) => node.props.onLoad())
      );
      expect(onReady).toHaveBeenCalledTimes(2);
      expect(onReady).toHaveBeenLastCalledWith('second');
    } finally {
      await act(async () => tree?.unmount());
    }
  }
);
