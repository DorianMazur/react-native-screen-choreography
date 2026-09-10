import { Image, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import Animated from 'react-native-reanimated';
import {
  GalleryLivePhoto,
  type GalleryPhotoViewport,
} from '../../examples/shared/gallery/GalleryLivePhoto';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { Image: 'Animated.Image' },
}));

test('keeps one image with fixed layout while the live viewport grows and shrinks', async () => {
  const source = { uri: 'photo.jpg', width: 1200, height: 800 };
  const resolve = jest
    .spyOn(Image, 'resolveAssetSource')
    .mockReturnValue({ ...source, scale: 1 });
  const viewport: GalleryPhotoViewport = {
    value: { width: 160, height: 220 },
  };
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(<GalleryLivePhoto source={source} viewport={viewport} />);
    });
    const node = tree.root.findByType(Animated.Image);
    for (const [width, height] of [
      [160, 220],
      [250, 300],
      [390, 390],
      [250, 300],
      [160, 220],
    ]) {
      Object.assign(viewport.value, { width: width!, height: height! });
      await act(async () => {
        tree.update(<GalleryLivePhoto source={source} viewport={viewport} />);
      });
      const style = StyleSheet.flatten(node.props.style);
      expect(tree.root.findByType(Animated.Image)).toBe(node);
      expect(node.props.source).toBe(source);
      expect(style.width).toBe(800);
      expect(style.height).toBeCloseTo((800 * 800) / 1200);
      const [x, y, scale] = style.transform;
      expect(800 * scale.scale).toBeGreaterThanOrEqual(width!);
      expect(style.height * scale.scale).toBeGreaterThanOrEqual(height!);
      expect(x.translateX).toBeCloseTo((width! - 800 * scale.scale) / 2);
      expect(y.translateY).toBeCloseTo(
        (height! - style.height * scale.scale) / 2
      );
    }
  } finally {
    await act(async () => tree?.unmount());
    resolve.mockRestore();
  }
});
