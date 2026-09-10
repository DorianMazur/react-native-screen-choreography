import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedElementTransitionRendererProps } from '../types';
import {
  createDeclarativeRenderer,
  crossfade,
  fade,
  image,
  surface,
  text,
} from './declarativeRecipes';
import { resolveFollowAnchor, sampleTrack } from './declarativeGeometry';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView' },
  useAnimatedStyle: jest.fn((compute: () => unknown) => compute()),
  interpolateColor: (value: number, _range: number[], colors: string[]) =>
    value <= 0 ? colors[0] : value >= 1 ? colors[1] : 'interpolated-color',
}));

const collapsed: SharedElementTransitionRendererProps['source'] = {
  screenId: 'list',
  metrics: { pageX: 20, pageY: 200, width: 100, height: 20 },
  content: (
    <Text testID="collapsed" style={{ fontSize: 14 }}>
      Balance
    </Text>
  ),
};
const expanded: SharedElementTransitionRendererProps['target'] = {
  screenId: 'detail',
  metrics: { pageX: 40, pageY: 100, width: 200, height: 40 },
  content: (
    <Text testID="expanded" style={{ fontSize: 28 }}>
      Account balance
    </Text>
  ),
};

function props(
  progress = 0,
  backward = false
): SharedElementTransitionRendererProps {
  return {
    id: 'balance',
    groupId: 'account',
    direction: backward ? 'backward' : 'forward',
    progress: {
      value: progress,
    } as SharedElementTransitionRendererProps['progress'],
    source: backward ? expanded : collapsed,
    target: backward ? collapsed : expanded,
    zIndex: 2,
  };
}

const animatedType = 'AnimatedView' as React.ElementType;
function findContentLayer(tree: ReactTestRenderer, id: string) {
  const layer = tree.root
    .findAllByType(animatedType)
    .find(
      (node) =>
        React.isValidElement<{ testID?: string }>(node.props.children) &&
        node.props.children.props.testID === id
    );
  if (!layer) throw new Error(`Missing content layer ${id}`);
  return layer;
}
function contentStyle(tree: ReactTestRenderer, id: string) {
  return StyleSheet.flatten(findContentLayer(tree, id).props.style);
}

describe('declarative recipes', () => {
  let tree: ReactTestRenderer | undefined;
  afterEach(async () => {
    await act(async () => tree?.unmount());
    tree = undefined;
    jest.clearAllMocks();
  });

  test.each(['fade', 'text', 'image'] as const)(
    '%s preserves endpoint padding without reapplying screen placement on Back',
    async (kind) => {
      const Renderer = createDeclarativeRenderer(
        kind === 'fade'
          ? { enter: fade() }
          : { shared: kind === 'text' ? text() : image() }
      );
      const input = props(1, true);
      input.source = {
        ...input.source,
        style: {
          marginHorizontal: 24,
          paddingVertical: 24,
          borderBottomWidth: 1,
          borderBottomColor: '#fff',
          flexDirection: 'row',
          gap: 8,
          width: '100%',
          minHeight: 200,
          flex: 1,
          top: 30,
        },
      };
      await act(async () => {
        tree = create(<Renderer {...input} />);
      });
      expect(contentStyle(tree!, 'expanded')).toMatchObject({
        paddingVertical: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#fff',
        flexDirection: 'row',
        gap: 8,
        width: 200,
        height: 40,
        top: 0,
        opacity: 1,
      });
      expect(contentStyle(tree!, 'expanded')).not.toHaveProperty(
        'marginHorizontal'
      );
      expect(contentStyle(tree!, 'expanded')).not.toHaveProperty('minHeight');
      expect(contentStyle(tree!, 'expanded')).not.toHaveProperty('flex');
    }
  );

  test.each([0, 0.475, 1])(
    'text retraces identical geometry at expansion %s in either direction',
    async (progress) => {
      const Renderer = createDeclarativeRenderer({ shared: text() });
      await act(async () => {
        tree = create(<Renderer {...props(progress)} />);
      });
      const forward = [
        contentStyle(tree!, 'collapsed'),
        contentStyle(tree!, 'expanded'),
      ];
      await act(async () => {
        tree!.update(<Renderer {...props(progress, true)} />);
      });
      expect([
        contentStyle(tree!, 'collapsed'),
        contentStyle(tree!, 'expanded'),
      ]).toEqual(forward);
      if (progress === 0) {
        expect(forward[0]).toMatchObject({
          opacity: 1,
          transform: [{ translateX: 20 }, { translateY: 200 }, { scale: 1 }],
        });
        expect(forward[1].opacity).toBe(0);
      }
      if (progress === 1) {
        expect(forward[1]).toMatchObject({
          opacity: 1,
          transform: [{ translateX: 40 }, { translateY: 100 }, { scale: 1 }],
        });
        expect(forward[0].opacity).toBe(0);
      }
    }
  );

  test('text keeps both endpoint layouts and typography fixed throughout the transition', async () => {
    const Renderer = createDeclarativeRenderer({ shared: text() });
    for (const progress of [0, 0.475, 1]) {
      await act(async () => {
        if (tree) tree.update(<Renderer {...props(progress)} />);
        else tree = create(<Renderer {...props(progress)} />);
      });
      expect(contentStyle(tree!, 'collapsed')).toMatchObject({
        width: 100,
        height: 20,
      });
      expect(contentStyle(tree!, 'expanded')).toMatchObject({
        width: 200,
        height: 40,
      });
      expect(
        findContentLayer(tree!, 'collapsed').props.children.props.style
      ).toEqual({ fontSize: 14 });
      expect(
        findContentLayer(tree!, 'expanded').props.children.props.style
      ).toEqual({ fontSize: 28 });
    }
    for (const result of jest.mocked(useAnimatedStyle).mock.results) {
      const animated = result.value;
      for (const property of [
        'fontSize',
        'lineHeight',
        'width',
        'height',
        'left',
        'top',
        'marginTop',
      ]) {
        expect(animated).not.toHaveProperty(property);
      }
    }
  });

  test.each([false, true])(
    'single-image morph keeps one crop through direction backward=%s',
    async (backward) => {
      const source = { uri: 'photo.jpg', width: 1200, height: 800 };
      const Renderer = createDeclarativeRenderer({
        shared: image({
          mode: 'morph',
          radius: [16, 0],
          overlay: (
            <View
              testID="scrim"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '55%',
              }}
            />
          ),
        }),
      });
      const small = {
        ...collapsed,
        metrics: { pageX: 24, pageY: 210, width: 150, height: 210 },
        content: <Image source={source} resizeMode="cover" />,
      };
      const large = {
        ...expanded,
        metrics: { pageX: 0, pageY: 70, width: 390, height: 390 },
        content: <Image source={source} resizeMode="cover" />,
      };
      for (const progress of [1, 0.99, 0.5, 0.01, 0, 0.5, 1]) {
        const input = {
          ...props(progress, backward),
          source: backward ? large : small,
          target: backward ? small : large,
        };
        await act(async () => {
          if (tree) tree.update(<Renderer {...input} />);
          else tree = create(<Renderer {...input} />);
        });
        const images = tree!.root.findAllByType(Image);
        expect(images).toHaveLength(1);
        expect(images[0]!.props.source).toEqual(source);
        expect(images[0]!.props.fadeDuration).toBe(0);
        const layers = tree!.root.findAllByType(animatedType);
        const clip = StyleSheet.flatten(layers[0]!.props.style);
        expect(layers).toHaveLength(1);
        const scrim = tree!.root.findByProps({ testID: 'scrim' });
        expect(layers[0]!.children).toContain(scrim);
        expect(scrim.props.style).toMatchObject({
          bottom: 0,
          left: 0,
          right: 0,
          height: '55%',
        });
        expect(images[0]!.props.resizeMode).toBe('cover');
        const width = 150 + 240 * progress;
        const height = 210 + 180 * progress;
        expect(clip.width).toBeCloseTo(width);
        expect(clip.height).toBeCloseTo(height);
        expect(clip.left).toBeCloseTo(24 * (1 - progress));
        expect(clip.top).toBeCloseTo(210 - 140 * progress);
        expect(clip.opacity ?? 1).toBe(1);
        expect(clip.transform).toBeUndefined();
      }
    }
  );

  test('image preserves exact endpoint crops and uses uniform cover inside the moving clip', async () => {
    const Renderer = createDeclarativeRenderer({
      shared: image({ radius: [12, 0] }),
    });
    const source = {
      ...collapsed,
      metrics: { pageX: 10, pageY: 20, width: 100, height: 100 },
      content: <View testID="collapsed" />,
    };
    const target = {
      ...expanded,
      metrics: { pageX: 30, pageY: 60, width: 200, height: 100 },
      content: <View testID="expanded" />,
    };
    for (const progress of [0, 0.5, 1]) {
      const next = { ...props(progress), source, target };
      await act(async () => {
        if (tree) tree.update(<Renderer {...next} />);
        else tree = create(<Renderer {...next} />);
      });
      const clip = StyleSheet.flatten(
        tree!.root.findAllByType(animatedType)[0]!.props.style
      );
      expect(clip).toMatchObject({
        width: 100 + 100 * progress,
        height: 100,
        borderRadius: 12 * (1 - progress),
      });
      expect(contentStyle(tree!, 'collapsed')).toMatchObject({
        width: 100,
        height: 100,
      });
      expect(contentStyle(tree!, 'expanded')).toMatchObject({
        width: 200,
        height: 100,
      });
      // Two half-opacity images composite to only 75% coverage and visibly
      // dim the photo. The lower crop must stay opaque under the incoming crop.
      const lower = contentStyle(tree!, 'collapsed').opacity;
      const upper = contentStyle(tree!, 'expanded').opacity;
      expect(upper + lower * (1 - upper)).toBe(1);
      if (progress === 0 || progress === 1) {
        const visible = contentStyle(
          tree!,
          progress === 0 ? 'collapsed' : 'expanded'
        );
        expect(visible.transform).toEqual([
          { translateX: 0 },
          { translateY: 0 },
          { scale: 1 },
        ]);
        expect(visible.opacity).toBe(1);
      } else {
        expect(contentStyle(tree!, 'collapsed').transform).toEqual([
          { translateX: 0 },
          { translateY: -25 },
          { scale: 1.5 },
        ]);
        expect(contentStyle(tree!, 'expanded').transform).toEqual([
          { translateX: -25 },
          { translateY: 0 },
          { scale: 1 },
        ]);
      }
    }
  });

  test('enter and exit follow the first valid anchor while preserving endpoint dimensions', async () => {
    const Renderer = createDeclarativeRenderer({
      enter: fade({ during: [0.4, 0.8], follow: ['missing', 'card'] }),
      exit: fade({ during: [0.2, 0.6], follow: 'card' }),
    });
    const anchor = {
      collapsed: { pageX: 10, pageY: 180, width: 300, height: 100 },
      expanded: { pageX: 30, pageY: 20, width: 350, height: 600 },
    };
    await act(async () => {
      tree = create(<Renderer {...props(0.5)} anchors={{ card: anchor }} />);
    });
    expect(contentStyle(tree!, 'collapsed')).toMatchObject({
      width: 100,
      height: 20,
      transform: [{ translateX: 30 }, { translateY: 120 }],
    });
    expect(contentStyle(tree!, 'expanded')).toMatchObject({
      width: 200,
      height: 40,
      transform: [{ translateX: 30 }, { translateY: 180 }],
    });
    expect(contentStyle(tree!, 'collapsed').opacity).toBeCloseTo(0.25);
    expect(contentStyle(tree!, 'expanded').opacity).toBeCloseTo(0.25);
    const forward = contentStyle(tree!, 'expanded');
    await act(async () => {
      tree!.update(
        <Renderer {...props(0.5, true)} anchors={{ card: anchor }} />
      );
    });
    expect(contentStyle(tree!, 'expanded')).toEqual(forward);
  });

  test('one-sided fades render only present content and work without an anchor', async () => {
    const Renderer = createDeclarativeRenderer({
      enter: fade({ follow: ['missing'] }),
      exit: fade(),
    });
    const absent = { ...collapsed, present: false, content: null };
    await act(async () => {
      tree = create(<Renderer {...props(1)} source={absent} />);
    });
    expect(tree!.root.findAllByType(animatedType)).toHaveLength(1);
    expect(contentStyle(tree!, 'expanded')).toMatchObject({
      width: 200,
      height: 40,
      opacity: 1,
      transform: [{ translateX: 40 }, { translateY: 100 }],
    });
    await act(async () => {
      tree!.update(<Renderer {...props(1, true)} target={absent} />);
    });
    expect(tree!.root.findAllByType(animatedType)).toHaveLength(1);
    expect(contentStyle(tree!, 'expanded').opacity).toBe(1);
  });

  test('surface backdrop fills the overlay outside the moving clip and fades independently', async () => {
    const Renderer = createDeclarativeRenderer({
      shared: surface({
        opacity: { input: [0, 1], output: [1, 0] },
        backdrop: {
          content: <View testID="blur" />,
          opacity: { input: [0, 1], output: [0, 1] },
        },
      }),
    });
    await act(async () => {
      tree = create(<Renderer {...props(1)} />);
    });
    expect(contentStyle(tree!, 'blur')).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 1,
    });
    expect(contentStyle(tree!, 'blur')).not.toHaveProperty('transform');
    expect(contentStyle(tree!, 'blur')).not.toHaveProperty('width');
    expect(contentStyle(tree!, 'blur')).not.toHaveProperty('height');
    const backdropComponent = findContentLayer(tree!, 'blur').parent!;
    const frame = tree!.root
      .findAllByType(animatedType)
      .find((node) => StyleSheet.flatten(node.props.style).width === 200)!;
    expect(frame.parent).toBe(backdropComponent.parent);
    let parent = findContentLayer(tree!, 'blur').parent;
    while (parent) {
      if (parent.type === animatedType) {
        expect(StyleSheet.flatten(parent.props.style).opacity ?? 1).toBe(1);
        expect(StyleSheet.flatten(parent.props.style).overflow).not.toBe(
          'hidden'
        );
      }
      parent = parent.parent;
    }
    const surfaceStyles = tree!.root
      .findAllByType(animatedType)
      .map((node) => StyleSheet.flatten(node.props.style));
    expect(surfaceStyles).toContainEqual(
      expect.objectContaining({ backgroundColor: 'transparent', opacity: 0 })
    );
  });

  test('collapsed shadow stays constant through expansion without interpolating shadow parameters', async () => {
    const Renderer = createDeclarativeRenderer({
      shared: surface({
        shadow: 'collapsed',
        opacity: { input: [0, 1], output: [0.8, 0.8] },
      }),
    });
    const source = {
      ...collapsed,
      style: {
        backgroundColor: '#fff',
        boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 8, color: '#000' }],
      },
    };
    const target = {
      ...expanded,
      style: {
        backgroundColor: '#fff',
        boxShadow: [{ offsetX: 0, offsetY: 12, blurRadius: 24, color: '#000' }],
      },
    };
    for (const progress of [0, 0.5, 1]) {
      await act(async () => {
        const element = (
          <Renderer {...props(progress)} source={source} target={target} />
        );
        if (tree) tree.update(element);
        else tree = create(element);
      });
      const shadows = tree!.root
        .findAllByType(animatedType)
        .map((node) => StyleSheet.flatten(node.props.style))
        .filter((style) => style.boxShadow);
      expect(shadows).toHaveLength(1);
      expect(shadows[0]).toMatchObject({
        opacity: 0.8,
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 4,
            blurRadius: 8,
            spreadDistance: 0,
            color: '#000',
          },
        ],
      });
    }
    for (const result of jest.mocked(useAnimatedStyle).mock.results)
      expect(result.value).not.toHaveProperty('boxShadow');
  });

  test('custom crossfade windows remain reversible and clamp overshoot', async () => {
    const Renderer = createDeclarativeRenderer({
      shared: crossfade({ exitDuring: [0.1, 0.2], enterDuring: [0.7, 0.9] }),
    });
    await act(async () => {
      tree = create(<Renderer {...props(0.5)} />);
    });
    expect(contentStyle(tree!, 'collapsed').opacity).toBe(0);
    expect(contentStyle(tree!, 'expanded').opacity).toBe(0);
    await act(async () => {
      tree!.update(<Renderer {...props(1.2)} />);
    });
    expect(contentStyle(tree!, 'expanded')).toMatchObject({
      opacity: 1,
      transform: [{ translateX: 40 }, { translateY: 100 }, { scale: 1 }],
    });
  });
});

describe('declarative numeric contracts', () => {
  test('follows the first usable geometry, ignoring missing or degenerate anchors', () => {
    const valid = { collapsed: collapsed.metrics, expanded: expanded.metrics };
    const invalid = {
      collapsed: { ...collapsed.metrics, width: 0 },
      expanded: expanded.metrics,
    };
    expect(
      resolveFollowAnchor(['missing', 'invalid', 'valid'], { invalid, valid })
    ).toBe(valid);
    expect(resolveFollowAnchor(['missing'], {})).toBeUndefined();
  });

  test('samples multipoint opacity tracks piecewise and clamps beyond endpoints', () => {
    const track = { input: [0, 0.1, 0.9, 1], output: [0, 1, 1, 0] };
    expect(
      [-1, 0.05, 0.5, 0.95, 2].map((value) => sampleTrack(value, track))
    ).toEqual([0, 0.5, 1, expect.closeTo(0.5), 0]);
  });

  test('rejects invalid configuration before navigation and copies mutable arrays', () => {
    expect(() => fade({ during: [0.8, 0.2] })).toThrow('increasing');
    expect(() => surface({ radius: [0, Number.NaN] })).toThrow('finite');
    expect(() =>
      surface({ opacity: { input: [0, 0], output: [0, 1] } })
    ).toThrow('increasing');
    expect(() => text({ zIndex: Infinity })).toThrow('finite');
    const input = [0, 1];
    const output = [0, 1];
    const recipe = surface({ opacity: { input, output } });
    input[0] = 0.8;
    output[1] = 0;
    expect(recipe.opacity).toEqual({ input: [0, 1], output: [0, 1] });
  });
});
