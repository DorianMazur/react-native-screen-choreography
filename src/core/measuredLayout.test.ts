import type { View } from 'react-native';
import { measure, type AnimatedRef } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  requestMeasuredLayout,
  type MeasuredLayoutEntry,
} from './measuredLayout';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  measure: jest.fn(),
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: jest.fn(),
  scheduleOnRN: jest.fn(),
}));

const bounds = { pageX: 5, pageY: 20, width: 100, height: 60 };
let entries: MeasuredLayoutEntry[];
let uiTasks: (() => void)[];
let rnTasks: (() => void)[];
let frames: Parameters<typeof requestAnimationFrame>[0][];
let cancellers: Set<() => void>;

function entry(id: string): MeasuredLayoutEntry {
  const node = { id } as unknown as View;
  const measurementRef = Object.assign(() => node, {
    current: node,
  }) as unknown as AnimatedRef<View>;
  return { id, ref: { current: node }, measurementRef };
}

function flushUI() {
  uiTasks.splice(0).forEach((task) => task());
}

function flushRN() {
  rnTasks.splice(0).forEach((task) => task());
}

function nextFrame() {
  frames.splice(0).forEach((callback) => callback(Date.now()));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  entries = [entry('source'), entry('target')];
  uiTasks = [];
  rnTasks = [];
  frames = [];
  cancellers = new Set();
  jest.mocked(scheduleOnUI).mockImplementation((worklet, ...args) => {
    uiTasks.push(() => worklet(...args));
  });
  jest.mocked(scheduleOnRN).mockImplementation((callback, ...args) => {
    rnTasks.push(() => callback(...args));
  });
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  jest.mocked(measure).mockImplementation(() => ({ ...bounds, x: 0, y: 0 }));
});

afterEach(() => {
  [...cancellers].forEach((cancel) => cancel());
  flushUI();
  nextFrame();
  flushRN();
  expect(cancellers.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('measures the complete batch in one UI task and keeps ref-only snapshot validity', async () => {
  let current = true;
  const pending = requestMeasuredLayout({
    entries,
    isCurrent: () => current,
    cancellers,
  });
  expect(measure).not.toHaveBeenCalled();
  expect(uiTasks).toHaveLength(1);
  flushUI();
  expect(measure).toHaveBeenNthCalledWith(1, entries[0]!.measurementRef);
  expect(measure).toHaveBeenNthCalledWith(2, entries[1]!.measurementRef);
  expect(frames).toHaveLength(0);
  expect(rnTasks).toHaveLength(1);
  flushRN();
  const snapshot = (await pending)!;
  expect(snapshot.metrics).toEqual(
    new Map([
      ['source', bounds],
      ['target', bounds],
    ])
  );
  current = false;
  expect(snapshot.isCurrent()).toBe(true);
  (entries[0]!.ref as { current: unknown }).current = { id: 'source' };
  expect(snapshot.isCurrent()).toBe(false);
});

test.each([
  null,
  { ...bounds, width: 0 },
  { ...bounds, height: -1 },
  { ...bounds, pageX: NaN },
  { ...bounds, pageY: Infinity },
])(
  'retries the whole batch on the next UI frame for invalid geometry %j',
  async (invalid) => {
    jest
      .mocked(measure)
      .mockReturnValueOnce({ ...bounds, x: 0, y: 0 })
      .mockReturnValueOnce(invalid as ReturnType<typeof measure>);
    const pending = requestMeasuredLayout({
      entries,
      isCurrent: () => true,
      cancellers,
    });
    flushUI();
    expect(rnTasks).toHaveLength(0);
    expect(frames).toHaveLength(1);
    const latestBounds = { ...bounds, pageY: 80 };
    jest.mocked(measure).mockReturnValue({ ...latestBounds, x: 0, y: 0 });
    nextFrame();
    expect(measure).toHaveBeenCalledTimes(4);
    flushRN();
    const snapshot = (await pending)!;
    expect([...snapshot.metrics.values()]).toEqual([
      latestBounds,
      latestBounds,
    ]);
  }
);

test.each([
  'cancel',
  'generation',
  'node',
  'measurement-ref',
  'entry-ref',
] as const)(
  'rejects a queued successful result after %s changes',
  async (reason) => {
    let current = true;
    const pending = requestMeasuredLayout({
      entries,
      isCurrent: () => current,
      cancellers,
    });
    flushUI();
    if (reason === 'cancel') [...cancellers][0]!();
    if (reason === 'generation') current = false;
    if (reason === 'node')
      (entries[0]!.ref as { current: unknown }).current = { id: 'source' };
    if (reason === 'measurement-ref')
      entries[0]!.measurementRef = entry('source').measurementRef;
    if (reason === 'entry-ref')
      entries[0]!.ref = { current: entries[0]!.measurementRef.current };
    flushRN();
    expect(await pending).toBeNull();
  }
);

test('cancellation before the scheduled UI task prevents measurement', async () => {
  const pending = requestMeasuredLayout({
    entries,
    isCurrent: () => true,
    cancellers,
  });
  [...cancellers][0]!();
  flushUI();
  expect(measure).not.toHaveBeenCalled();
  expect(await pending).toBeNull();
});

test.each(['cancel', 'timeout'] as const)(
  '%s stops invalid-batch frame retries and late callbacks',
  async (reason) => {
    jest.mocked(measure).mockReturnValue(null);
    const pending = requestMeasuredLayout({
      entries,
      isCurrent: () => true,
      cancellers,
      timeoutMs: 50,
    });
    flushUI();
    expect(frames).toHaveLength(1);
    if (reason === 'cancel') [...cancellers][0]!();
    else jest.advanceTimersByTime(50);
    const calls = jest.mocked(measure).mock.calls.length;
    nextFrame();
    flushRN();
    expect(measure).toHaveBeenCalledTimes(calls);
    expect(frames).toHaveLength(0);
    expect(await pending).toBeNull();
  }
);

test('the UI deadline bounds retries even before RN timers run', async () => {
  jest.mocked(measure).mockReturnValue(null);
  const pending = requestMeasuredLayout({
    entries,
    isCurrent: () => true,
    cancellers,
    timeoutMs: 50,
  });
  flushUI();
  jest.setSystemTime(Date.now() + 50);
  nextFrame();
  flushRN();
  expect(measure).toHaveBeenCalledTimes(1);
  expect(await pending).toBeNull();
});

test('a cancelled request cannot deliver into a replacement request', async () => {
  const old = requestMeasuredLayout({
    entries,
    isCurrent: () => true,
    cancellers,
  });
  flushUI();
  [...cancellers][0]!();
  const replacement = requestMeasuredLayout({
    entries,
    isCurrent: () => true,
    cancellers,
  });
  flushRN();
  expect(cancellers.size).toBe(1);
  expect(await old).toBeNull();
  flushUI();
  flushRN();
  expect((await replacement)?.metrics.size).toBe(2);
});

test('supports stable node getter refs', async () => {
  const node = entries[0]!.measurementRef.current;
  entries[0]!.ref = () => node;
  const pending = requestMeasuredLayout({
    entries,
    isCurrent: () => true,
    cancellers,
  });
  flushUI();
  flushRN();
  expect((await pending)?.isCurrent()).toBe(true);
});

test.each(['empty', 'duplicate', 'unmounted', 'unattached', 'stale'] as const)(
  'rejects %s requests before scheduling UI work',
  async (reason) => {
    if (reason === 'empty') entries = [];
    if (reason === 'duplicate') entries[1]!.id = entries[0]!.id;
    if (reason === 'unmounted')
      (entries[0]!.ref as { current: unknown }).current = null;
    if (reason === 'unattached') entries[0]!.measurementRef.current = null;
    expect(
      await requestMeasuredLayout({
        entries,
        isCurrent: () => reason !== 'stale',
        cancellers,
      })
    ).toBeNull();
    expect(scheduleOnUI).not.toHaveBeenCalled();
  }
);

test.each(['schedule', 'measure', 'predicate'] as const)(
  'settles and cleans up a %s exception',
  async (stage) => {
    if (stage === 'schedule')
      jest.mocked(scheduleOnUI).mockImplementationOnce(() => {
        throw new Error('disposed');
      });
    if (stage === 'measure')
      jest.mocked(measure).mockImplementationOnce(() => {
        throw new Error('disposed');
      });
    let current = true;
    const pending = requestMeasuredLayout({
      entries,
      isCurrent: () => {
        if (!current) throw new Error('disposed');
        return true;
      },
      cancellers,
    });
    flushUI();
    if (stage === 'predicate') current = false;
    flushRN();
    expect(await pending).toBeNull();
  }
);
