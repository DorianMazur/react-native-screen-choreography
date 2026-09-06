import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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
    '%s fades at fixed detail coordinates above the background',
    async (direction) => {
      const Renderer = musicHeaderTransition.renderer!;
      const expanded = {
        content: 'Now playing',
        style: {},
        metrics: { x: 0, y: 0, pageX: 0, pageY: 62, width: 393, height: 56 },
      };
      const collapsed = {
        content: null,
        style: {},
        metrics: { x: 0, y: 0, pageX: 16, pageY: 360, width: 361, height: 1 },
      };
      for (const value of [0, 0.3, 0.6, 0.8, 1]) {
        const props = {
          id: 'header',
          groupId: 'track.test',
          direction,
          progress: { value },
          source: direction === 'forward' ? collapsed : expanded,
          target: direction === 'forward' ? expanded : collapsed,
          zIndex: musicHeaderTransition.zIndex,
        } as SharedElementTransitionRendererProps;
        let tree!: ReactTestRenderer;
        await act(async () => {
          tree = create(<Renderer {...props} />);
        });
        try {
          const layer = tree.toJSON() as {
            props: { style: object };
            children: unknown;
          };
          const style = StyleSheet.flatten(layer.props.style);
          expect(style).toMatchObject({
            left: 0,
            top: 62,
            width: 393,
            height: 56,
            zIndex: 3,
          });
          expect(style.opacity).toBeCloseTo(Math.max(0, (value - 0.6) / 0.4));
          expect(layer.children).toEqual(['Now playing']);
        } finally {
          await act(async () => tree.unmount());
        }
      }
    }
  );
});
