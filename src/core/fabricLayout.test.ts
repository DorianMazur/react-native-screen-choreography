import { captureFabricLayout, waitForFabricLayout } from './fabricLayout';
import NativePreparation from '../native/NativeChoreographyPreparation';
jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: { install: jest.fn() },
}));
const globals = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
};
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
  globals.__screenChoreographyCaptureFabricLayout = jest.fn(() => [
    metrics,
    metrics,
  ]);
});
afterEach(() => {
  delete globals.__screenChoreographyCaptureFabricLayout;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('captures a complete batch and tracks node identity independently of recycled tags', () => {
  const result = captureFabricLayout(entries)!;
  expect(result.metrics.size).toBe(2);
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
    await waitForFabricLayout({
      read: () => 'ready',
      isCurrent: () => true,
      cancellers: new Set(),
    })
  ).toBeNull();
});
test('waits for a completed mount, without requiring repeated identical readings', async () => {
  const read = jest.fn().mockReturnValueOnce(null).mockReturnValue('ready');
  const cancellers = new Set<() => void>();
  const pending = waitForFabricLayout({
    read,
    isCurrent: () => true,
    cancellers,
  });
  await jest.advanceTimersByTimeAsync(16);
  expect(await pending).toBe('ready');
  expect(read).toHaveBeenCalledTimes(2);
  expect(cancellers.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
test.each(['cancel', 'timeout', 'ownership'] as const)(
  '%s releases timers and pending capture',
  async (reason) => {
    let current = true;
    const cancellers = new Set<() => void>();
    const pending = waitForFabricLayout({
      read: () => null,
      isCurrent: () => current,
      cancellers,
    });
    if (reason === 'cancel') [...cancellers][0]!();
    if (reason === 'ownership') current = false;
    await jest.runAllTimersAsync();
    expect(await pending).toBeNull();
    expect(cancellers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  }
);
