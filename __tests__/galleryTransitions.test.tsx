import React from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import {
  galleryLocationTransition,
  galleryPhotoTransition,
} from '../examples/shared/gallery/galleryTransitions';
import { theme } from '../examples/shared/theme';
import type { SharedElementTransitionRendererProps } from '../src/types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>(
    '../__mocks__/react-native-reanimated'
  ),
  __esModule: true,
  default: { View: 'AnimatedView', Text: 'AnimatedText' },
  useDerivedValue: (updater: () => number) => ({ value: updater() }),
}));

jest.mock('../examples/shared/runtime', () => ({
  StandInElement: jest.requireActual<
    typeof import('../src/standin/StandInElement')
  >('../src/standin/StandInElement').StandInElement,
  ...jest.requireActual<
    typeof import('../src/transitions/makeSurfaceTransition')
  >('../src/transitions/makeSurfaceTransition'),
  ...jest.requireActual<
    typeof import('../src/transitions/makeStretchTransition')
  >('../src/transitions/makeStretchTransition'),
  ...jest.requireActual<
    typeof import('../src/transitions/textMorphTransition')
  >('../src/transitions/textMorphTransition'),
}));

const photo = (
  <Image
    source={{ uri: 'gallery-photo.jpg' }}
    resizeMode="cover"
    style={{ width: '100%', height: '100%' }}
  />
);
const list = {
  screenId: 'GalleryList',
  metrics: { pageX: 24, pageY: 240, width: 168, height: 168 / 0.72 },
  content: photo,
};
const detail = {
  screenId: 'GalleryDetail',
  metrics: { pageX: 0, pageY: 112, width: 396, height: 396 },
  content: photo,
};

describe('Gallery subtitle continuity', () => {
  const Renderer = galleryLocationTransition.renderer;
  const listSubtitle = {
    screenId: 'GalleryList',
    metrics: { pageX: 36, pageY: 430, width: 144, height: 16 },
    content: (
      <Text
        style={[{ fontFamily: theme.font }, { fontSize: 11, marginTop: 2 }]}
      >
        Tromso, Norway
      </Text>
    ),
  };
  const detailSubtitle = {
    screenId: 'GalleryDetail',
    metrics: { pageX: 24, pageY: 460, width: 348, height: 23 },
    content: (
      <Text
        style={[{ fontFamily: theme.font }, { fontSize: 15, marginTop: 4 }]}
      >
        Tromso, Norway
      </Text>
    ),
  };

  test.each(['forward', 'backward'] as const)(
    '%s interpolates one native font without crossfade or box scaling',
    async (direction) => {
      for (const value of [-0.1, 0, 0.01, 0.35, 0.5, 0.65, 0.99, 1, 1.1]) {
        let tree!: ReactTestRenderer;
        await act(async () => {
          tree = create(
            <Renderer
              id="photo.aurora.location"
              groupId="photo.aurora"
              direction={direction}
              progress={makeMutable(value)}
              source={direction === 'forward' ? listSubtitle : detailSubtitle}
              target={direction === 'forward' ? detailSubtitle : listSubtitle}
              zIndex={2}
            />
          );
        });
        try {
          const layers = tree.root.findAllByType(
            'AnimatedView' as React.ElementType
          );
          expect(layers).toHaveLength(1);
          const texts = tree.root.findAllByType(
            'AnimatedText' as React.ElementType
          );
          expect(texts).toHaveLength(1);
          expect(texts[0]!.props.children).toBe('Tromso, Norway');
          const frameStyle = StyleSheet.flatten(layers[0]!.props.style);
          const textStyle = StyleSheet.flatten(texts[0]!.props.style);
          const clampedProgress = Math.max(0, Math.min(1, value));
          expect(frameStyle.left).toBeCloseTo(36 - 12 * clampedProgress);
          expect(frameStyle.top).toBeCloseTo(430 + 30 * clampedProgress);
          expect(frameStyle.width).toBeCloseTo(144 + 204 * clampedProgress);
          expect(textStyle.fontSize).toBeCloseTo(11 + 4 * clampedProgress);
          expect(textStyle.marginTop).toBeCloseTo(2 + 2 * clampedProgress);
          expect(textStyle.fontFamily).toBe(theme.font);
          for (const style of [frameStyle, textStyle]) {
            expect(style.transform).toBeUndefined();
            expect(style.opacity ?? 1).toBe(1);
          }
        } finally {
          await act(async () => tree.unmount());
        }
      }
    }
  );
});

describe('Gallery photo crop continuity', () => {
  const Renderer = galleryPhotoTransition.renderer;

  test.each(['forward', 'backward'] as const)(
    '%s keeps a single cover image in the interpolated frame without stretching a fixed crop',
    async (direction) => {
      for (const value of [0, 0.25, 0.5, 0.75, 1]) {
        const props: SharedElementTransitionRendererProps = {
          id: 'photo.aurora.photo',
          groupId: 'photo.aurora',
          direction,
          progress: makeMutable(value),
          source: direction === 'forward' ? list : detail,
          target: direction === 'forward' ? detail : list,
          zIndex: 2,
        };
        let tree: ReactTestRenderer;
        await act(async () => {
          tree = create(<Renderer {...props} />);
        });
        try {
          const frames = tree!.root.findAllByType(
            'AnimatedView' as React.ElementType
          );
          expect(frames).toHaveLength(1);
          const frame = frames[0]!;
          const style = StyleSheet.flatten(frame.props.style);
          for (const key of ['width', 'height'] as const) {
            expect(style[key]).toBeCloseTo(
              list.metrics[key] +
                (detail.metrics[key] - list.metrics[key]) * value
            );
          }
          expect(style.left).toBeCloseTo(24 * (1 - value));
          expect(style.top).toBeCloseTo(240 + (112 - 240) * value);
          expect(style.borderRadius).toBeCloseTo(theme.radius.lg * (1 - value));
          expect(style.overflow).toBe('hidden');
          expect(style.transform).toBeUndefined();
          expect(frame.props.children).toBe(photo);
          expect(tree!.root.findAllByType(Image)).toHaveLength(1);
        } finally {
          await act(async () => tree!.unmount());
        }
      }
    }
  );
});
