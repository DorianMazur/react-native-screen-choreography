import { findNodeHandle, Platform } from 'react-native';
import type { LayoutPreparationResult } from '../native/NativeChoreographyPreparation';
import type { ElementMetrics } from '../types';
import { measureElementsBatched, type BatchMeasureEntry } from './measurement';
import {
  hasNativePreparation,
  prepareNativeTargets,
} from './nativePreparation';

jest.mock('react-native', () => ({
  findNodeHandle: jest.fn(
    (node: { nativeTag: number } | null) => node?.nativeTag ?? null
  ),
  Platform: { OS: 'android' },
}));
jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: { awaitLayout: jest.fn(), cancel: jest.fn() },
}));
jest.mock('./measurement', () => ({ measureElementsBatched: jest.fn() }));

interface NativeMock {
  awaitLayout: jest.Mock<
    Promise<LayoutPreparationResult>,
    [string, number, readonly number[], number]
  >;
  cancel: jest.Mock<void, [string]>;
}
const moduleMock = jest.requireMock(
  '../native/NativeChoreographyPreparation'
) as { default: NativeMock | null };
const native = moduleMock.default!;
const measured = jest.mocked(measureElementsBatched);
const acknowledgment: LayoutPreparationResult = {
  ready: true,
  sampleCount: 2,
  elapsedMs: 24,
};
const metrics: ElementMetrics = {
  pageX: 12,
  pageY: 34,
  width: 100,
  height: 50,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const screenRef = { current: { nativeTag: 10 } };
  const objectRef = { current: { nativeTag: 20 } };
  let functionNode = { nativeTag: 30 };
  let current = true;
  const entries: BatchMeasureEntry[] = [
    { id: 'frame', ref: objectRef },
    { id: 'image', ref: () => functionNode },
  ];
  const cancellers = new Set<() => void>();
  return {
    screenRef,
    entries,
    cancellers,
    isCurrent: () => current,
    invalidate: () => {
      current = false;
    },
    replace: (kind: 'screen' | 'object' | 'function', sameTag = false) => {
      if (kind === 'screen')
        screenRef.current = { nativeTag: sameTag ? 10 : 11 };
      else if (kind === 'object')
        objectRef.current = { nativeTag: sameTag ? 20 : 21 };
      else functionNode = { nativeTag: sameTag ? 30 : 31 };
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  moduleMock.default = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  native.awaitLayout.mockReset().mockResolvedValue(acknowledgment);
  native.cancel.mockReset();
  measured
    .mockReset()
    .mockImplementation(
      async (entries) =>
        new Map(entries.map((entry) => [entry.id, { ...metrics }]))
    );
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('native preparation handshake', () => {
  test('waits for native acknowledgment before one batch in the existing coordinate space', async () => {
    const pending = deferred<LayoutPreparationResult>();
    native.awaitLayout.mockReturnValue(pending.promise);
    const setup = fixture();
    const preparing = prepareNativeTargets(setup);
    expect(native.awaitLayout).toHaveBeenCalledWith(
      expect.any(String),
      10,
      [20, 30],
      500
    );
    expect(measured).not.toHaveBeenCalled();
    expect(setup.cancellers.size).toBe(1);
    pending.resolve(acknowledgment);
    const result = await preparing;
    expect(measured).toHaveBeenCalledTimes(1);
    expect(measured).toHaveBeenCalledWith(setup.entries);
    expect(result?.get('image')?.metrics).toEqual(metrics);
    expect(result?.get('image')?.isCurrent?.()).toBe(true);
    expect(setup.cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(native.cancel).not.toHaveBeenCalled();
  });

  test.each(['screen', 'object', 'function'] as const)(
    'rejects the same ref resolving to a replaced %s tag after native readiness',
    async (kind) => {
      const pending = deferred<LayoutPreparationResult>();
      native.awaitLayout.mockReturnValue(pending.promise);
      const setup = fixture();
      const preparing = prepareNativeTargets(setup);
      setup.replace(kind);
      pending.resolve(acknowledgment);
      expect(await preparing).toBeNull();
      expect(measured).not.toHaveBeenCalled();
      expect(setup.cancellers.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test.each(['screen', 'object', 'function'] as const)(
    'rejects a %s tag replacement while the final measurement is pending',
    async (kind) => {
      const pending = deferred<Map<string, ElementMetrics | null>>();
      measured.mockReturnValue(pending.promise);
      const setup = fixture();
      const preparing = prepareNativeTargets(setup);
      await Promise.resolve();
      await Promise.resolve();
      expect(measured).toHaveBeenCalledTimes(1);
      setup.replace(kind);
      pending.resolve(
        new Map(setup.entries.map((entry) => [entry.id, metrics]))
      );
      expect(await preparing).toBeNull();
      expect(setup.cancellers.size).toBe(0);
    }
  );

  test('prepared measurements retain an identity guard for later pairing', async () => {
    const setup = fixture();
    const result = await prepareNativeTargets(setup);
    expect(result?.get('frame')?.isCurrent?.()).toBe(true);
    setup.replace('function');
    expect(result?.get('frame')?.isCurrent?.()).toBe(false);
  });

  test.each(['screen', 'object', 'function'] as const)(
    'rejects a replaced %s node even when its numeric tag is unchanged',
    async (kind) => {
      const pending = deferred<LayoutPreparationResult>();
      native.awaitLayout.mockReturnValue(pending.promise);
      const setup = fixture();
      const preparing = prepareNativeTargets(setup);
      setup.replace(kind, true);
      pending.resolve(acknowledgment);
      expect(await preparing).toBeNull();
      expect(measured).not.toHaveBeenCalled();
      expect(setup.cancellers.size).toBe(0);
    }
  );

  test.each(['screen', 'object', 'function'] as const)(
    'rejects a same-tag %s node replacement during measurement',
    async (kind) => {
      const pending = deferred<Map<string, ElementMetrics | null>>();
      measured.mockReturnValue(pending.promise);
      const setup = fixture();
      const preparing = prepareNativeTargets(setup);
      await Promise.resolve();
      await Promise.resolve();
      setup.replace(kind, true);
      pending.resolve(
        new Map(setup.entries.map((entry) => [entry.id, metrics]))
      );
      expect(await preparing).toBeNull();
      expect(setup.cancellers.size).toBe(0);
    }
  );

  test('cancellation resolves promptly and a late native acknowledgment cannot trigger measurement', async () => {
    const pending = deferred<LayoutPreparationResult>();
    native.awaitLayout.mockReturnValue(pending.promise);
    const setup = fixture();
    const preparing = prepareNativeTargets(setup);
    const requestId = native.awaitLayout.mock.calls[0]![0];
    setup.invalidate();
    [...setup.cancellers].forEach((cancel) => cancel());
    expect(await preparing).toBeNull();
    expect(native.cancel).toHaveBeenCalledWith(requestId);
    pending.resolve(acknowledgment);
    await Promise.resolve();
    expect(measured).not.toHaveBeenCalled();
    expect(setup.cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('cancellation during the final measurement prevents returning stale geometry', async () => {
    const pending = deferred<Map<string, ElementMetrics | null>>();
    measured.mockReturnValue(pending.promise);
    const setup = fixture();
    const preparing = prepareNativeTargets(setup);
    await Promise.resolve();
    await Promise.resolve();
    setup.invalidate();
    [...setup.cancellers].forEach((cancel) => cancel());
    pending.resolve(new Map(setup.entries.map((entry) => [entry.id, metrics])));
    expect(await preparing).toBeNull();
    expect(setup.cancellers.size).toBe(0);
  });

  test('a late native timeout after cancellation cannot fire the deadline callback', async () => {
    const pending = deferred<LayoutPreparationResult>();
    native.awaitLayout.mockReturnValue(pending.promise);
    const setup = fixture();
    const onTimeout = jest.fn();
    const preparing = prepareNativeTargets({ ...setup, onTimeout });
    setup.invalidate();
    [...setup.cancellers].forEach((cancel) => cancel());
    expect(await preparing).toBeNull();
    pending.resolve({ ready: false, sampleCount: 8, elapsedMs: 500 });
    await Promise.resolve();
    expect(onTimeout).not.toHaveBeenCalled();
    expect(measured).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('the JS deadline cancels an unresponsive module and clears preparation ownership', async () => {
    native.awaitLayout.mockReturnValue(new Promise(() => {}));
    const setup = fixture();
    const onTimeout = jest.fn();
    const preparing = prepareNativeTargets({ ...setup, onTimeout });
    jest.advanceTimersByTime(550);
    expect(await preparing).toBeNull();
    expect(native.cancel).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(measured).not.toHaveBeenCalled();
    expect(setup.cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('an exhausted native deadline is reported so the caller can avoid restarting a legacy timeout', async () => {
    native.awaitLayout.mockResolvedValue({
      ready: false,
      sampleCount: 6,
      elapsedMs: 500,
    });
    const onTimeout = jest.fn();
    const setup = fixture();
    expect(await prepareNativeTargets({ ...setup, onTimeout })).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(measured).not.toHaveBeenCalled();
    expect(setup.cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['reject', 'throw'] as const)(
    'native %s falls back with cancellation and timer cleanup',
    async (failure) => {
      if (failure === 'reject')
        native.awaitLayout.mockRejectedValue(new Error('native invalidated'));
      else
        native.awaitLayout.mockImplementation(() => {
          throw new Error('native unavailable');
        });
      native.cancel.mockImplementation(() => {
        throw new Error('already invalidated');
      });
      const setup = fixture();
      expect(await prepareNativeTargets(setup)).toBeNull();
      expect(native.cancel).toHaveBeenCalledTimes(1);
      expect(measured).not.toHaveBeenCalled();
      expect(setup.cancellers.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test('native incomplete layout does not measure or report readiness', async () => {
    native.awaitLayout.mockResolvedValue({
      ready: false,
      sampleCount: 0,
      elapsedMs: 500,
    });
    const setup = fixture();
    expect(await prepareNativeTargets(setup)).toBeNull();
    expect(measured).not.toHaveBeenCalled();
    expect(setup.cancellers.size).toBe(0);
  });
});

describe('native preparation validation and support', () => {
  test.each([
    null,
    { ...metrics, width: 0 },
    { ...metrics, height: -1 },
    { ...metrics, pageX: Number.NaN },
    { ...metrics, pageY: Infinity },
  ])('rejects incomplete or invalid measured geometry: %s', async (invalid) => {
    measured.mockResolvedValue(
      new Map([
        ['frame', metrics],
        ['image', invalid],
      ])
    );
    const setup = fixture();
    expect(await prepareNativeTargets(setup)).toBeNull();
    expect(setup.cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('missing measured targets cannot validate a partial group', async () => {
    measured.mockResolvedValue(new Map([['frame', metrics]]));
    expect(await prepareNativeTargets(fixture())).toBeNull();
  });

  test.each(['android', 'ios'] as const)(
    'an absent module keeps the legacy path on %s',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      moduleMock.default = null;
      expect(hasNativePreparation()).toBe(false);
      expect(await prepareNativeTargets(fixture())).toBeNull();
      expect(native.awaitLayout).not.toHaveBeenCalled();
      expect(measured).not.toHaveBeenCalled();
    }
  );

  test('web does not call a module even if its JavaScript mock exists', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    expect(hasNativePreparation()).toBe(false);
    expect(await prepareNativeTargets(fixture())).toBeNull();
    expect(native.awaitLayout).not.toHaveBeenCalled();
  });

  test.each([null, 0, -1, 1.5, Infinity])(
    'invalid resolved tags skip native work: %s',
    async (tag) => {
      jest.mocked(findNodeHandle).mockReturnValueOnce(tag);
      const setup = fixture();
      expect(await prepareNativeTargets(setup)).toBeNull();
      expect(native.awaitLayout).not.toHaveBeenCalled();
      expect(setup.cancellers.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test('missing screen, empty entries, and stale ownership never start a native job', async () => {
    const setup = fixture();
    expect(
      await prepareNativeTargets({ ...setup, screenRef: undefined })
    ).toBeNull();
    expect(await prepareNativeTargets({ ...setup, entries: [] })).toBeNull();
    setup.invalidate();
    expect(await prepareNativeTargets(setup)).toBeNull();
    expect(native.awaitLayout).not.toHaveBeenCalled();
    expect(setup.cancellers.size).toBe(0);
  });
});
