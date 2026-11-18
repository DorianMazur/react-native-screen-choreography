import {
  debugLog,
  debugTrace,
  debugWarn,
  isDebugEnabled,
  setDebugCoalesce,
  setDebugEnabled,
  setDebugLevel,
} from './logger';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  setDebugEnabled(true);
});
afterEach(() => {
  setDebugEnabled(false);
  setDebugCoalesce(true);
  jest.restoreAllMocks();
});

test('filters messages at the configured level before formatting them', () => {
  const format = jest.fn(() => 'frame measurement');
  expect(isDebugEnabled()).toBe(true);
  debugTrace(format);
  expect(format).not.toHaveBeenCalled();
  debugWarn('missing element');
  expect(console.log).toHaveBeenCalledTimes(1);
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('[Choreography] missing element')
  );

  setDebugLevel('trace');
  debugTrace(format);
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('frame measurement')
  );
  setDebugEnabled(false);
  expect(isDebugEnabled()).toBe(false);
  debugLog(format);
  debugTrace(format);
  debugWarn(format);
  expect(format).toHaveBeenCalledTimes(1);
  expect(console.log).toHaveBeenCalledTimes(2);
});

test('prints the first of each run of identical messages', () => {
  for (const message of ['begin', 'begin', 'end', 'begin']) debugLog(message);
  expect(jest.mocked(console.log).mock.calls).toEqual([
    [expect.stringContaining('[Choreography] begin')],
    [expect.stringContaining('[Choreography] end')],
    [expect.stringContaining('[Choreography] begin')],
  ]);
});

test('prints each repeated message when coalescing is disabled', () => {
  setDebugCoalesce(false);
  debugLog('frame');
  debugLog('frame');
  expect(console.log).toHaveBeenCalledTimes(2);
  expect(console.log).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('frame')
  );
});
