import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { useState } from 'react';
import { Button, Text } from 'react-native';
import { fireEvent, render, renderHook } from '@testing-library/react-native';
import * as choreography from 'react-native-screen-choreography';
import * as core from 'react-native-screen-choreography/core';
import * as expo from 'react-native-screen-choreography/expo-router';

// Exercise the same setup a consuming app uses, including package exports.
jest.mock('react-native-screen-choreography', () =>
  require('react-native-screen-choreography/mock')
);
jest.mock('react-native-screen-choreography/core', () =>
  require('react-native-screen-choreography/mock/core')
);
jest.mock('react-native-screen-choreography/expo-router', () =>
  require('react-native-screen-choreography/mock/expo-router')
);

// None of these runtimes or optional navigators may initialize through a mock.
jest.mock('react-native-reanimated', () => {
  throw new Error('The choreography mock loaded Reanimated');
});
jest.mock('react-native-worklets', () => {
  throw new Error('The choreography mock loaded Worklets');
});
jest.mock('react-native-teleport', () => {
  throw new Error('The choreography mock loaded Teleport');
});
jest.mock('@react-navigation/native', () => {
  throw new Error('The choreography mock loaded React Navigation');
});
jest.mock('expo-router', () => {
  throw new Error('The choreography mock loaded Expo Router');
});

function runtimeExports(entry: string): string[] {
  const path = resolve(__dirname, `${entry}.ts`);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  return source.statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) return [];
    if (!statement.exportClause) return runtimeExports('core');
    if (!ts.isNamedExports(statement.exportClause)) return [];
    return statement.exportClause.elements
      .filter((item) => !item.isTypeOnly)
      .map((item) => item.name.text);
  });
}

test.each([
  ['index', choreography],
  ['core', core],
  ['expo-router', expo],
] as const)('%s mock covers its public runtime exports', (entry, mock) => {
  expect(Object.keys(mock).sort()).toEqual(runtimeExports(entry).sort());
});

test('renders one stateful owner, empty targets, and visible companion content', () => {
  const card = core.defineTransition({
    shared: { card: { kind: 'surface' } },
    enter: { body: {} },
    exit: { summary: {} },
    motion: { duration: 250 },
  });
  let presentation!: ReturnType<typeof core.useSharedElementPresentation>;
  function Counter() {
    const [count, setCount] = useState(0);
    presentation = core.useSharedElementPresentation();
    return (
      <Button title={`Count ${count}`} onPress={() => setCount(count + 1)} />
    );
  }
  function Companion() {
    const visible = core.useLatchedReveal();
    const hidden = core.useLatchedReveal({ visibleWhenInactive: false });
    const style = core.useRevealStyle();
    const { acquire } = core.useChoreographyBlocker();
    acquire()();
    expect(style).toMatchObject({ opacity: 1 });
    return visible && !hidden ? <Text>Companion</Text> : null;
  }
  const tree = (label: string) => (
    <core.ChoreographyProvider>
      <choreography.ChoreographyScreen screenId="list">
        <card.Element
          name="card"
          groupId="one"
          metadata={{ label }}
          style={{ width: 80 }}
        >
          <Counter />
        </card.Element>
        <card.Enter name="body">
          <Companion />
        </card.Enter>
        <card.Exit name="summary">
          <Text>Summary</Text>
        </card.Exit>
      </choreography.ChoreographyScreen>
      <choreography.ChoreographyScreen screenId="detail">
        <card.Element.Target name="card" groupId="one" />
      </choreography.ChoreographyScreen>
    </core.ChoreographyProvider>
  );
  const result = render(tree('first'));
  fireEvent.press(result.getByText('Count 0'));
  result.rerender(tree('second'));
  expect(result.getAllByText('Count 1')).toHaveLength(1);
  expect(result.getByText('Companion')).toBeTruthy();
  expect(result.getByText('Summary')).toBeTruthy();
  expect(presentation).toMatchObject({
    transitioning: false,
    settled: 'collapsed',
    direction: null,
    collapsed: {
      metrics: null,
      metadata: { label: 'second' },
      style: { width: 80 },
    },
    expanded: { metrics: null },
  });
  expect(card.navigationOptions).toEqual({ duration: 250 });
});

test('idle progress is stable within a provider and isolated between providers', () => {
  const first = renderHook(core.useChoreographyProgress, {
    wrapper: core.ChoreographyProvider,
  });
  const second = renderHook(core.useChoreographyProgress, {
    wrapper: core.ChoreographyProvider,
  });
  const progress = first.result.current.progress;
  expect(first.result.current).toMatchObject({
    isActive: false,
    isPendingTarget: false,
    role: 'inactive',
    phase: 'idle',
    direction: null,
    sessionId: null,
    groupId: null,
    backdropStyle: { opacity: 0 },
  });
  progress.set(0.5);
  first.rerender({});
  expect(first.result.current.progress).toBe(progress);
  expect(progress.get()).toBe(0.5);
  expect(second.result.current.progress.value).toBe(0);
  expect(first.result.current.settleTransition()).toBeUndefined();
});

test('navigation forwards arguments to the latest navigator without choreography options', async () => {
  const first = { navigate: jest.fn(), goBack: jest.fn() };
  const second = { navigate: jest.fn(), goBack: jest.fn() };
  const { result, rerender } = renderHook(
    (coreNavigation) => choreography.useChoreographyNavigation(coreNavigation),
    { initialProps: first }
  );
  const commands = result.current;
  const params = { id: 'item-1' };
  await commands.navigate('Detail', params, {
    transitionConfig: { group: 'item-1' },
  });
  expect(first.navigate).toHaveBeenCalledWith('Detail', params);
  rerender(second);
  expect(result.current).toBe(commands);
  await commands.goBack();
  expect(second.goBack).toHaveBeenCalledTimes(1);
  expect(first.goBack).not.toHaveBeenCalled();
});

test('Expo commands forward only href and support Back', async () => {
  const router = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
  const { result } = renderHook(() =>
    expo.useChoreographyRouter(router, 'list')
  );
  const href = { pathname: '/detail', params: { id: '1' } };
  const request = {
    href,
    targetScreenId: 'detail',
    transitionConfig: { group: 'one' },
  };
  await result.current.push(request);
  await result.current.navigate(request);
  await result.current.back();
  expect(router.push).toHaveBeenCalledWith(href);
  expect(router.navigate).toHaveBeenCalledWith(href);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('interactive preparation is unavailable without native transitions', async () => {
  const { result } = renderHook(choreography.useInteractiveTransition);
  expect(await result.current.beginBack()).toBeNull();
  expect(result.current.isActive).toBe(false);
  result.current.setProgress(0.3);
  expect(result.current.progress.value).toBe(0.3);
});
