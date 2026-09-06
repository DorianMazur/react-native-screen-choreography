import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import { makeStretchTransition } from '../src/transitions/makeStretchTransition';
import { makeSurfaceTransition } from '../src/transitions/makeSurfaceTransition';
import { textMorphTransition } from '../src/transitions/textMorphTransition';
import type { SharedElementTransitionSide } from '../src/types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>(
    '../__mocks__/react-native-reanimated'
  ),
  __esModule: true,
  default: { View: 'AnimatedView', Text: 'AnimatedText' },
  useDerivedValue: (compute: () => number) => ({ value: compute() }),
  interpolateColor: (value: number, _range: number[], colors: string[]) =>
    value <= 0 ? colors[0] : value >= 1 ? colors[1] : 'interpolated-color',
}));

const collapsed: SharedElementTransitionSide = {
  screenId: 'list',
  metrics: { pageX: 12, pageY: 220, width: 40, height: 40 },
  content: <View testID="collapsed-icon" />,
};
const expanded: SharedElementTransitionSide = {
  screenId: 'detail',
  metrics: { pageX: 24, pageY: 80, width: 80, height: 80 },
  content: <View testID="expanded-icon" />,
};

describe('Transition recipes', () => {
  test.each([
    [<View key="wrapper" />, 'direct Text'],
    [<Text key="different">Other text</Text>, 'identical text'],
    [
      <Text key="nested">
        <Text>Same text</Text>
      </Text>,
      'plain text',
    ],
    [
      <Text key="line-height" style={{ lineHeight: 24 }}>
        Same text
      </Text>,
      'lineHeight on both',
    ],
    [
      <Text key="font" style={{ fontWeight: 'bold' }}>
        Same text
      </Text>,
      'matching fontWeight',
    ],
  ])(
    'rejects unsupported text input with guidance (%s)',
    async (content, message) => {
      const Renderer = textMorphTransition.renderer;
      await expect(async () => {
        await act(async () => {
          create(
            <Renderer
              id="text"
              groupId="test"
              direction="forward"
              progress={makeMutable(0)}
              source={{ ...collapsed, content: <Text>Same text</Text> }}
              target={{ ...expanded, content }}
              zIndex={2}
            />
          );
        });
      }).rejects.toThrow(message as string);
    }
  );

  test.each(['forward', 'backward'] as const)(
    '%s stretches one expanded representation and retraces its geometry',
    async (direction) => {
      const Renderer = makeStretchTransition({
        sourceBorderRadius: 4,
        targetBorderRadius: 12,
      }).renderer;
      for (const value of [0, 0.01, 0.5, 0.99, 1]) {
        let tree!: ReactTestRenderer;
        await act(async () => {
          tree = create(
            <Renderer
              id="icon"
              groupId="test"
              direction={direction}
              progress={makeMutable(value)}
              source={direction === 'forward' ? collapsed : expanded}
              target={direction === 'forward' ? expanded : collapsed}
              zIndex={7}
            />
          );
        });
        try {
          const layers = tree.root.findAllByType(
            'AnimatedView' as React.ElementType
          );
          expect(layers).toHaveLength(2);
          const frame = StyleSheet.flatten(layers[0]!.props.style);
          const content = StyleSheet.flatten(layers[1]!.props.style);
          expect(frame.left).toBeCloseTo(12 + 12 * value);
          expect(frame.top).toBeCloseTo(220 - 140 * value);
          expect(frame.width).toBeCloseTo(40 + 40 * value);
          expect(frame.borderRadius).toBeCloseTo(4 + 8 * value);
          expect(frame.zIndex).toBe(7);
          expect(content.transform).toHaveLength(2);
          expect(content.transform[0].scaleX).toBeCloseTo(0.5 + 0.5 * value);
          expect(content.transform[1].scaleY).toBeCloseTo(0.5 + 0.5 * value);
          expect(layers[1]!.props.children).toBe(expanded.content);
          expect(content.opacity).toBeUndefined();
        } finally {
          await act(async () => tree.unmount());
        }
      }
    }
  );

  test.each(['forward', 'backward'] as const)(
    '%s surface preserves endpoint colors, radii, and renderer stacking',
    async (direction) => {
      const Renderer = makeSurfaceTransition(
        { backgroundColor: '#112233', borderRadius: 4 },
        { backgroundColor: '#445566', borderRadius: 12 }
      ).renderer;
      for (const value of [0, 0.5, 1]) {
        let tree!: ReactTestRenderer;
        await act(async () => {
          tree = create(
            <Renderer
              id="surface"
              groupId="test"
              direction={direction}
              progress={makeMutable(value)}
              source={direction === 'forward' ? collapsed : expanded}
              target={direction === 'forward' ? expanded : collapsed}
              zIndex={5}
            />
          );
        });
        try {
          const layers = tree.root.findAllByType(
            'AnimatedView' as React.ElementType
          );
          const frame = StyleSheet.flatten(layers[0]!.props.style);
          const surface = StyleSheet.flatten(layers[1]!.props.style);
          expect(frame.zIndex).toBe(5);
          expect(surface.borderRadius).toBeCloseTo(4 + 8 * value);
          expect(surface.backgroundColor).toBe(
            value === 0
              ? '#112233'
              : value === 1
                ? '#445566'
                : 'interpolated-color'
          );
        } finally {
          await act(async () => tree.unmount());
        }
      }
    }
  );

  test.each(['forward', 'backward'] as const)(
    '%s text interpolates explicit line heights without scaling its box',
    async (direction) => {
      const Renderer = textMorphTransition.renderer;
      const smallText = {
        ...collapsed,
        content: (
          <Text style={{ fontSize: 12, lineHeight: 18 }}>Same text</Text>
        ),
      };
      const largeText = {
        ...expanded,
        content: (
          <Text style={{ fontSize: 24, lineHeight: 30 }}>Same text</Text>
        ),
      };
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(
          <Renderer
            id="text"
            groupId="test"
            direction={direction}
            progress={makeMutable(0.5)}
            source={direction === 'forward' ? smallText : largeText}
            target={direction === 'forward' ? largeText : smallText}
            zIndex={2}
          />
        );
      });
      try {
        const text = tree.root.findByType('AnimatedText' as React.ElementType);
        const style = StyleSheet.flatten(text.props.style);
        expect(style.fontSize).toBe(18);
        expect(style.lineHeight).toBe(24);
        expect(style.transform).toBeUndefined();
        expect(style.opacity).toBeUndefined();
      } finally {
        await act(async () => tree.unmount());
      }
    }
  );
});
