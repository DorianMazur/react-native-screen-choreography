import { Image, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import { ScreenHeader } from '../examples/shared/AppChrome';
import { NowPlayingScreen } from '../examples/shared/music/NowPlayingScreen';
import { MusicListScreen } from '../examples/shared/music/MusicListScreen';
import { musicHeaderTransition } from '../examples/shared/music/musicTransitions';
import type { SharedElementTransitionRendererProps } from '../src/types';

jest.mock('../examples/shared/runtime', () => ({
  SafeAreaView: 'SafeAreaView',
  SharedElement: 'SharedElement',
  useExampleNavigation: () => ({ goBack: jest.fn() }),
  useChoreographyProgress: () => ({
    settleTransition: jest.fn(),
  }),
}));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  useDerivedValue: (compute: () => unknown) => ({ value: compute() }),
  cancelAnimation: jest.fn(),
}));

describe('Now Playing header transition', () => {
  test('bounds the artwork inside a centered frame instead of sizing the image from the asset', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<NowPlayingScreen />);
    });
    try {
      const frame = tree.root.findByProps({ testID: 'now-playing-artwork' });
      const frameStyle = StyleSheet.flatten(frame.props.style);
      expect(frameStyle).toMatchObject({
        width: '100%',
        aspectRatio: 1.6,
        alignSelf: 'center',
        overflow: 'hidden',
      });
      const image = frame.findByType(Image);
      expect(StyleSheet.flatten(image.props.style)).toEqual({
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
      });
      expect(image.props.resizeMode).toBe('cover');
    } finally {
      await act(async () => tree.unmount());
    }
  });

  test('registers the header on both screens without removing its layout slot', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<NowPlayingScreen />);
    });

    try {
      const header = tree.root.findByProps({ id: 'header' });
      expect(header.props.transition).toBe(musicHeaderTransition);
      expect(header.findByType(ScreenHeader).props.title).toBe('Now playing');
      const groupId = header.props.groupId;

      await act(async () => tree.update(<MusicListScreen />));
      const anchors = tree.root.findAllByProps({ id: 'header' });
      expect(anchors.length).toBeGreaterThan(0);
      expect(anchors.some((anchor) => anchor.props.groupId === groupId)).toBe(
        true
      );
      for (const anchor of anchors) {
        expect(anchor.props.transition).toBe(musicHeaderTransition);
        expect(StyleSheet.flatten(anchor.props.style).height).toBe(1);
      }
    } finally {
      await act(async () => tree.unmount());
    }
  });

  test.each(['forward', 'backward'] as const)(
    '%s carries the header inside the expanding frame without a delayed fade',
    async (direction) => {
      const Renderer = musicHeaderTransition.renderer!;
      const expanded = {
        screenId: 'NowPlaying',
        content: 'Now playing',
        style: {},
        metrics: { x: 0, y: 0, pageX: 0, pageY: 62, width: 393, height: 56 },
      };
      const collapsed = {
        screenId: 'MusicList',
        content: null,
        style: {},
        metrics: { x: 0, y: 0, pageX: 16, pageY: 360, width: 361, height: 1 },
      };
      for (const value of [0, 0.3, 0.6, 0.8, 1]) {
        const props = {
          id: 'header',
          groupId: 'track.test',
          direction,
          progress: makeMutable(value),
          source: direction === 'forward' ? collapsed : expanded,
          target: direction === 'forward' ? expanded : collapsed,
          zIndex: musicHeaderTransition.zIndex ?? 0,
        } satisfies SharedElementTransitionRendererProps;
        let tree!: ReactTestRenderer;
        await act(async () => {
          tree = create(<Renderer {...props} />);
        });
        try {
          const layer = tree.toJSON();
          if (layer === null || Array.isArray(layer)) {
            throw new Error('Expected one rendered header layer');
          }
          const style = StyleSheet.flatten(layer.props.style);
          expect(style.left).toBeCloseTo(16 * (1 - value));
          expect(style.top).toBeCloseTo(360 + (62 - 360) * value);
          expect(style.width).toBeCloseTo(361 + 32 * value);
          expect(style.height).toBeCloseTo(1 + 55 * value);
          expect(style.zIndex).toBe(3);
          expect(style.overflow).toBe('hidden');
          expect(style.opacity).toBeUndefined();
          expect(layer.children).toHaveLength(1);
          const content = layer.children?.[0];
          if (content == null || typeof content === 'string') {
            throw new Error('Expected a rendered header content layer');
          }
          expect(StyleSheet.flatten(content.props.style)).toMatchObject({
            width: 393,
            height: 56,
          });
          expect(content.children).toEqual(['Now playing']);
        } finally {
          await act(async () => tree.unmount());
        }
      }
    }
  );
});
