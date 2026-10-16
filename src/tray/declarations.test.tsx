import React from 'react';
import { readTrayDeclaration } from './declarations';
import type {
  TrayScreenDeclarationProps,
  TrayScreenProps,
  TrayStackProps,
} from './types';

type Routes = { form: undefined; preview: { label: string } };
const Stack = (_props: TrayStackProps) => null;
function Screen<N extends keyof Routes>(
  _props: TrayScreenDeclarationProps<Routes, N>
) {
  return null;
}
const Form = () => null;
const Preview = (_props: TrayScreenProps<Routes, 'preview'>) => null;
const ForeignScreen = (_props: TrayScreenDeclarationProps<Routes>) => null;
const read = (children: React.ReactNode) =>
  readTrayDeclaration<Routes>(children, Stack, Screen);

test.each([
  ['missing stack', <React.Fragment />, 'one direct Tray.Stack'],
  [
    'duplicate stacks',
    <>
      <Stack>
        <Screen name="form" component={Form} />
      </Stack>
      <Stack>
        <Screen name="form" component={Form} />
      </Stack>
    </>,
    'exactly one Tray.Stack',
  ],
  ['empty stack', <Stack>{null}</Stack>, 'at least one Tray.Screen'],
  [
    'duplicate names in fragments',
    <Stack>
      <Screen name="form" component={Form} />
      <>
        <Screen name="form" component={Form} />
      </>
    </Stack>,
    'Duplicate tray screen: form',
  ],
  [
    'another factory’s declaration',
    <Stack>
      <ForeignScreen name="form" component={Form} />
    </Stack>,
    'only accepts its own Tray.Screen',
  ],
  [
    'unsupported presentation',
    <Stack>
      <Screen
        name="form"
        component={Form}
        // @ts-expect-error Exercise validation for untyped callers.
        options={{ presentation: 'modal' }}
      />
    </Stack>,
    'presentation must be "tray" or "fullScreen"',
  ],
  [
    'ordinary content',
    <Stack>Content</Stack>,
    'only accepts its own Tray.Screen',
  ],
] as const)('rejects %s', (_name, children, message) => {
  expect(() => read(children)).toThrow(message);
});

test('accepts memoized components and keeps options independent of component identity', () => {
  const MemoForm = React.memo(Form);
  const result = read(
    <Stack appearance="sheet">
      {false}
      <Screen name="form" component={MemoForm} options={{ title: 'Draft' }} />
      <Screen
        name="preview"
        component={Preview}
        options={{ presentation: 'fullScreen' }}
      />
    </Stack>
  );
  expect(result.screens.form?.component).toBe(MemoForm);
  expect(result.screens.form?.title).toBe('Draft');
  expect(result.screens.preview?.title).toBe('preview');
  expect(result.screens.form?.presentation).toBe('tray');
  expect(result.screens.preview?.presentation).toBe('fullScreen');
  expect(result.options.appearance).toBe('sheet');
});

test.each([
  { type: 'timing' as const, duration: -1 },
  { type: 'timing' as const, duration: NaN },
  { type: 'timing' as const, duration: Infinity },
  { type: 'spring' as const, stiffness: 0 },
  { type: 'spring' as const, damping: 0 },
  { type: 'spring' as const, damping: Infinity },
])('rejects animation settings that cannot settle: %j', (animation) => {
  expect(() =>
    read(
      <Stack animation={animation}>
        <Screen name="form" component={Form} />
      </Stack>
    )
  ).toThrow(/must be (a )?finite/);
});
