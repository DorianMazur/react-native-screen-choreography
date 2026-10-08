import { StrictMode, Suspense, useEffect, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useStableCallback } from './useStableCallback';

let tree: ReactTestRenderer | undefined;

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

test('a retained command forwards arguments and the latest async result', async () => {
  const firstResult = Promise.resolve('first');
  const secondResult = Promise.resolve('second');
  const first = jest.fn((_name: string, _id: number) => firstResult);
  const second = jest.fn((_name: string, _id: number) => secondResult);
  type Callback = (name: string, id: number) => Promise<string>;
  let command!: Callback;
  function Harness({ callback }: { callback: Callback }) {
    command = useStableCallback(callback);
    return null;
  }

  await act(async () => {
    tree = create(<Harness callback={first} />);
  });
  const retained = command;
  expect(retained('detail', 1)).toBe(firstResult);
  await act(async () => tree!.update(<Harness callback={second} />));

  expect(command).toBe(retained);
  expect(retained('updated-detail', 2)).toBe(secondResult);
  expect(second).toHaveBeenCalledWith('updated-detail', 2);
  expect(first).toHaveBeenCalledTimes(1);
});

test.each([
  ['passive effect', useEffect],
  ['layout effect', useLayoutEffect],
] as const)(
  'publishes the committed binding before a child %s calls it',
  async (_name, useChildEffect) => {
    const called = jest.fn();
    function Child({
      command,
      value,
    }: {
      command: () => number;
      value: number;
    }) {
      useChildEffect(() => {
        called(value, command());
      }, [command, value]);
      return null;
    }
    function Harness({ value }: { value: number }) {
      const command = useStableCallback(() => value);
      return <Child command={command} value={value} />;
    }

    await act(async () => {
      tree = create(<Harness value={1} />);
    });
    await act(async () => tree!.update(<Harness value={2} />));
    expect(called.mock.calls).toEqual([
      [1, 1],
      [2, 2],
    ]);
  }
);

test('a suspended render does not replace the last committed command', async () => {
  const pending = new Promise<void>(() => {});
  let command!: () => number;
  function Harness({ value, suspend }: { value: number; suspend?: boolean }) {
    command = useStableCallback(() => value);
    if (suspend) throw pending;
    return null;
  }

  await act(async () => {
    tree = create(
      <Suspense fallback={null}>
        <Harness value={1} />
      </Suspense>
    );
  });
  const retained = command;
  await act(async () =>
    tree!.update(
      <Suspense fallback={null}>
        <Harness value={2} suspend />
      </Suspense>
    )
  );

  expect(retained()).toBe(1);
  await act(async () =>
    tree!.update(
      <Suspense fallback={null}>
        <Harness value={3} />
      </Suspense>
    )
  );
  expect(command).toBe(retained);
  expect(retained()).toBe(3);
});

test('Strict Mode replay preserves identity and forwards thrown errors', async () => {
  const error = new Error('navigation failed');
  let command!: () => number;
  function Harness({ fail }: { fail: boolean }) {
    command = useStableCallback(() => {
      if (fail) throw error;
      return 1;
    });
    return null;
  }
  await act(async () => {
    tree = create(
      <StrictMode>
        <Harness fail={false} />
      </StrictMode>
    );
  });
  const retained = command;
  expect(retained()).toBe(1);
  await act(async () =>
    tree!.update(
      <StrictMode>
        <Harness fail />
      </StrictMode>
    )
  );
  expect(command).toBe(retained);
  expect(retained).toThrow(error);
});
