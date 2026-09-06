import React from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChoreographyScreenBase } from '../src/components/ChoreographyScreenBase';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../src/core/ChoreographyContext';
import { PROGRESS_RANGES } from '../src/core/constants';
import { useStaggeredReveal } from '../src/hooks/useChoreographyProgress';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { View: 'AnimatedView' },
}));

function GallerySections() {
  const { getItemStyle } = useStaggeredReveal(3, { stagger: 0.06 });
  const notesStyle = getItemStyle(0);
  const exposureStyle = getItemStyle(1);
  const actionsStyle = getItemStyle(2);
  return (
    <>
      <Animated.View style={notesStyle} />
      <Animated.View style={exposureStyle} />
      <Animated.View style={actionsStyle} />
    </>
  );
}

describe('Screen and companion choreography', () => {
  test('Gallery sections retrace the forward sequence before the background fades on Back', async () => {
    let tree!: ReactTestRenderer;
    const snapshots = new Map<
      number,
      { background: number; content: number[] }
    >();
    await act(async () => {
      tree = create(<></>);
    });

    try {
      for (const direction of ['forward', 'backward'] as const) {
        const values = [0, 0.1, 0.2, 0.4, 0.7, 0.76, 0.82, 0.9, 1];
        if (direction === 'backward') values.reverse();
        for (const value of values) {
          const progress = { value };
          const context = {
            progress,
            pendingTargetScreenId: null,
            activeSession: {
              id: 'gallery-session',
              groupId: 'photo.aurora',
              sourceScreenId: direction === 'forward' ? 'List' : 'Detail',
              targetScreenId: direction === 'forward' ? 'Detail' : 'List',
              direction,
              state: 'active',
              pairs: [],
              progress,
            },
          } as unknown as ChoreographyContextType;
          await act(async () => {
            tree.update(
              <ChoreographyContext.Provider value={context}>
                <ChoreographyScreenBase screenId="Detail">
                  <GallerySections />
                </ChoreographyScreenBase>
              </ChoreographyContext.Provider>
            );
          });
          const layers = tree.root.findAllByType(
            'AnimatedView' as React.ElementType
          );
          expect(layers).toHaveLength(4);
          const background = StyleSheet.flatten(layers[0]!.props.style).opacity;
          const content = layers
            .slice(1)
            .map(
              (layer) =>
                background * StyleSheet.flatten(layer.props.style).opacity
            );

          if (value <= PROGRESS_RANGES.contentReveal.start) {
            expect(content).toEqual([0, 0, 0]);
          } else {
            expect(background).toBe(1);
            expect(content.some((opacity) => opacity > 0)).toBe(true);
          }
          if (value === 1) expect(content).toEqual([1, 1, 1]);
          if (direction === 'forward')
            snapshots.set(value, { background, content });
          else expect({ background, content }).toEqual(snapshots.get(value));
        }
      }
    } finally {
      await act(async () => tree.unmount());
    }
  });
});
