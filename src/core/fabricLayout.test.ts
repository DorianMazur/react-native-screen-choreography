import {
  captureFabricLayout,
  prepareFabricLayout,
  requestFabricLayout,
} from './fabricLayout';
import NativePreparation from '../native/NativeChoreographyPreparation';
jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: { install: jest.fn() },
}));
const globals = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographyRequestFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};
let notifyMount: () => void;
let reader: jest.Mock;
let unsubscribe: jest.Mock;
const metrics = { pageX: 0, pageY: 20, width: 100, height: 50 };
const screenRef = { current: { tag: 1 } };
let entries: {
  id: string;
  ref: { current: { tag: number } };
  screenRef: typeof screenRef;
}[];
beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(require('react-native'), 'findNodeHandle')
    .mockImplementation((node: any) => node.tag);
  entries = [
    { id: 'a', ref: { current: { tag: 2 } }, screenRef },
    { id: 'b', ref: { current: { tag: 3 } }, screenRef },
  ];
  reader = jest.fn((validate?: boolean) =>
    validate === true ? true : validate === false ? undefined : null
  );
  unsubscribe = jest.fn();
  globals.__screenChoreographyRequestFabricLayout = jest.fn(() => reader);
  globals.__screenChoreographySubscribeFabricMount = jest.fn((callback) => {
    notifyMount = callback;
    return unsubscribe;
  });
  globals.__screenChoreographyCaptureFabricLayout = jest.fn(() => [
    metrics,
    metrics,
  ]);
});
afterEach(() => {
  delete globals.__screenChoreographyCaptureFabricLayout;
  delete globals.__screenChoreographyRequestFabricLayout;
  delete globals.__screenChoreographySubscribeFabricMount;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('captures a complete batch aligned with entries and tracks node identity independently of recycled tags', () => {
  const result = captureFabricLayout(entries)!;
  expect(result.metrics).toEqual([metrics, metrics]);
  expect(globals.__screenChoreographyCaptureFabricLayout).toHaveBeenCalledWith(
    [1, 1],
    [2, 3]
  );
  expect(result.isCurrent()).toBe(true);
  entries[0]!.ref.current = { tag: 2 };
  expect(result.isCurrent()).toBe(false);
});
test.each([
  null,
  [],
  [metrics],
  [metrics, { ...metrics, width: 0 }],
  [metrics, { ...metrics, pageY: NaN }],
])('rejects incomplete or invalid native batches: %j', (batch) => {
  globals.__screenChoreographyCaptureFabricLayout!.mockReturnValue(batch);
  expect(captureFabricLayout(entries)).toBeNull();
});
test('rejects invalid refs and duplicate identities', () => {
  entries[0]!.ref.current.tag = NaN;
  expect(captureFabricLayout(entries)).toBeNull();
  entries[0]!.ref.current.tag = 2;
  entries[1]!.id = 'a';
  expect(captureFabricLayout(entries)).toBeNull();
});
test('missing native bindings do not call a JS measurement fallback', async () => {
  delete globals.__screenChoreographyCaptureFabricLayout;
  expect(captureFabricLayout(entries)).toBeNull();
  expect(NativePreparation!.install).toHaveBeenCalled();
  expect(
    await requestFabricLayout({
      entries,
      isCurrent: () => true,
      cancellers: new Set(),
    })
  ).toBeNull();
});

test('one native request waits for mount events, with no timed polling or repeated capture requests', async () => {
  const cancellers = new Set<() => void>();
  const pending = requestFabricLayout({
    entries,
    isCurrent: () => true,
    cancellers,
  });
  const calls = reader.mock.calls.length;
  await jest.advanceTimersByTimeAsync(160);
  expect(reader).toHaveBeenCalledTimes(calls);
  reader.mockImplementation((validate?: boolean) =>
    validate === true
      ? true
      : validate === false
        ? undefined
        : [metrics, metrics]
  );
  notifyMount();
  const snapshot = await pending;
  expect(snapshot?.metrics).toEqual([metrics, metrics]);
  expect(snapshot?.validateNative?.()).toBe(true);
  expect(globals.__screenChoreographyRequestFabricLayout).toHaveBeenCalledTimes(
    1
  );
  expect(
    globals.__screenChoreographyCaptureFabricLayout
  ).not.toHaveBeenCalled();
  expect(reader).not.toHaveBeenCalledWith(false);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(cancellers.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('returns an already mounted native batch synchronously and releases waiters', () => {
  reader.mockImplementation((validate?: boolean) =>
    validate === true
      ? true
      : validate === false
        ? undefined
        : [metrics, metrics]
  );
  const cancellers = new Set<() => void>();
  const snapshot = prepareFabricLayout({
    entries,
    isCurrent: () => true,
    cancellers,
  });
  expect(snapshot).not.toBeInstanceOf(Promise);
  expect(snapshot).toMatchObject({
    metrics: [
      { pageX: 0, pageY: 20, width: 100, height: 50 },
      { pageX: 0, pageY: 20, width: 100, height: 50 },
    ],
  });
  expect(cancellers.size).toBe(0);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
test.each([
  'cancel',
  'timeout',
  'ownership',
  'native-identity',
  'recycled-ref',
] as const)(
  '%s releases the native request and ignores late mounts',
  async (reason) => {
    let current = true;
    const cancellers = new Set<() => void>();
    const pending = requestFabricLayout({
      entries,
      isCurrent: () => current,
      cancellers,
    });
    if (reason === 'cancel') [...cancellers][0]!();
    if (reason === 'ownership') current = false;
    if (reason === 'native-identity') reader.mockReturnValue(false);
    if (reason === 'recycled-ref') entries[0]!.ref.current = { tag: 2 };
    notifyMount();
    await jest.runAllTimersAsync();
    expect(await pending).toBeNull();
    expect(reader).toHaveBeenCalledWith(false);
    const count = reader.mock.calls.length;
    notifyMount();
    expect(reader).toHaveBeenCalledTimes(count);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  }
);
test.each(
  [
    [],
    [metrics],
    [metrics, { ...metrics, width: 0 }],
    [metrics, { ...metrics, pageX: Infinity }],
  ].map((batch) => [batch])
)('rejects invalid requested geometry %j', async (batch) => {
  reader.mockImplementation((validate?: boolean) =>
    validate === true ? true : validate === false ? undefined : batch
  );
  expect(
    await requestFabricLayout({
      entries,
      isCurrent: () => true,
      cancellers: new Set(),
    })
  ).toBeNull();
});

test.each(['request', 'read', 'validate', 'cancel'] as const)(
  'native %s failure settles the request and releases JS waiters',
  async (stage) => {
    if (stage === 'request')
      globals.__screenChoreographyRequestFabricLayout!.mockImplementation(
        () => {
          throw new Error('runtime disposed');
        }
      );
    else
      reader.mockImplementation((flag?: boolean) => {
        if (
          (stage === 'validate' && flag === true) ||
          (stage === 'read' && flag === undefined) ||
          (stage === 'cancel' && flag === false)
        )
          throw new Error('runtime disposed');
        return flag === true ? true : null;
      });
    const cancellers = new Set<() => void>();
    const pending = requestFabricLayout({
      entries,
      isCurrent: () => true,
      cancellers,
    });
    await jest.runAllTimersAsync();
    expect(await pending).toBeNull();
    expect(cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  }
);
