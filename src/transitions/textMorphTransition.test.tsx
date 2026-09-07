import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import { textMorphTransition } from './textMorphTransition';
import type { SharedElementTransitionSide } from '../types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>(
    '../../__mocks__/react-native-reanimated'
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
});
