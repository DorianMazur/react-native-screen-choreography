import { Image, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import Animated, { makeMutable } from 'react-native-reanimated';
import {
  GalleryHero,
  type GalleryHeroState,
} from '../../examples/shared/gallery/GalleryHero';
import { interpolateHero } from '../../examples/shared/gallery/galleryHeroGeometry';
import type { Photo } from '../../examples/shared/gallery/data';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: {
    Image: 'Animated.Image',
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
}));
jest.mock('../../examples/shared/AppChrome', () => ({ AppIcon: 'CameraIcon' }));

test.each(['forward', 'backward'] as const)(
  'one live hero retains its image and labels through %s frames',
  async (direction) => {
    const source = { uri: 'aurora.jpg', width: 1200, height: 800 };
    const photo = {
      image: source,
      title: 'Aurora',
      location: 'Tromsø, Norway',
    } as Photo;
    const resolve = jest
      .spyOn(Image, 'resolveAssetSource')
      .mockReturnValue({ ...source, scale: 1 });
    const collapsed = { width: 160, height: 222, expansion: 0 };
    const expanded = { width: 390, height: 390, expansion: 1 };
    const state: GalleryHeroState = {
      kind: 'gallery-hero',
      frame: makeMutable(collapsed),
      rest: makeMutable(collapsed),
      motion: makeMutable<GalleryHeroState['motion']['value']>({
        active: false,
        from: collapsed,
        to: expanded,
        backward: false,
      }),
    };
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(<GalleryHero photo={photo} state={state} />);
      });
      const image = tree.root.findByType(Animated.Image);
      const labels = tree.root.findAllByType(Animated.Text);
      for (const step of [0, 0.1, 0.5, 0.9, 1]) {
        const t = direction === 'forward' ? step : 1 - step;
        state.frame.value = interpolateHero(collapsed, expanded, t);
        await act(async () => {
          tree.update(<GalleryHero photo={photo} state={state} />);
        });
        expect(tree.root.findByType(Animated.Image)).toBe(image);
        expect(tree.root.findAllByType(Animated.Text)).toEqual(labels);
        expect(labels.map((node) => node.props.children)).toEqual([
          'Aurora',
          'Tromsø, Norway',
        ]);
        for (const node of labels)
          expect(StyleSheet.flatten(node.props.style).opacity).toBeUndefined();
        const imageStyle = StyleSheet.flatten(image.props.style);
        expect(imageStyle.width).toBe(800);
        expect(imageStyle.height).toBeCloseTo((800 * 800) / 1200);
        const layers = tree.root.findAllByType(Animated.View);
        const clip = StyleSheet.flatten(layers[0]!.props.style);
        const scrim = StyleSheet.flatten(layers[1]!.props.style);
        const [offset, scaleX, scaleY] = scrim.transform;
        expect(clip.width).toBe(state.frame.value.width);
        expect(clip.height).toBe(state.frame.value.height);
        expect(scrim.width * scaleX.scaleX).toBeCloseTo(clip.width);
        expect(offset.translateY + scrim.height * scaleY.scaleY).toBeCloseTo(
          clip.height
        );
        const [x, y, scale] = imageStyle.transform;
        expect(x.translateX).toBeLessThanOrEqual(0);
        expect(y.translateY).toBeLessThanOrEqual(0);
        expect(
          y.translateY + imageStyle.height * scale.scale
        ).toBeGreaterThanOrEqual(clip.height);
      }
    } finally {
      await act(async () => tree?.unmount());
      resolve.mockRestore();
    }
  }
);
