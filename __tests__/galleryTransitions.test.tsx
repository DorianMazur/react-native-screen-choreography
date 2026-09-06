import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import { galleryPhotoTransition } from '../examples/shared/gallery/galleryTransitions';
import { theme } from '../examples/shared/theme';
import type { SharedElementTransitionRendererProps } from '../src/types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { View: 'AnimatedView' },
  useDerivedValue: (updater: () => number) => ({ value: updater() }),
}));

jest.mock('../examples/shared/runtime', () => ({
  StandInElement: jest.requireActual('../src/standin/StandInElement')
    .StandInElement,
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
          expect(frame.props.children).toContain(photo);
          expect(tree!.root.findAllByType(Image)).toHaveLength(1);
        } finally {
          await act(async () => tree!.unmount());
        }
      }
    }
  );
});
