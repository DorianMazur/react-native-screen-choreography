import {
  setDebugEnabled,
  setDebugLevel,
  setDebugCoalesce,
  debugLog,
  debugTrace,
  debugWarn,
  getDebugLogs,
  clearDebugLogs,
} from '../src/debug/logger';

describe('Debug logger levels and coalescing', () => {
  beforeEach(() => {
    setDebugEnabled(true);
    setDebugLevel('info');
    setDebugCoalesce(true);
    clearDebugLogs();
  });

  afterEach(() => {
    setDebugEnabled(false);
    setDebugLevel('info');
    setDebugCoalesce(true);
    clearDebugLogs();
  });

  test('trace messages are suppressed at info level', () => {
    debugTrace('frame measurement');
    expect(getDebugLogs()).toHaveLength(0);
  });

  test('trace messages are emitted at trace level', () => {
    setDebugLevel('trace');
    debugTrace('frame measurement');
    expect(getDebugLogs()).toHaveLength(1);
  });

  test('warn is always above info threshold', () => {
    setDebugLevel('info');
    debugWarn('something fishy');
    expect(getDebugLogs()).toHaveLength(1);
    expect(getDebugLogs()[0]).toContain('something fishy');
  });

  test('coalesces consecutive identical messages', () => {
    debugLog('repeat me');
    debugLog('repeat me');
    debugLog('repeat me');
    debugLog('repeat me');
    const logs = getDebugLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('repeat me');
    expect(logs[0]).toContain('×4');
  });

  test('does not coalesce different messages', () => {
    debugLog('one');
    debugLog('two');
    debugLog('one');
    expect(getDebugLogs()).toHaveLength(3);
  });

  test('coalescing can be disabled', () => {
    setDebugCoalesce(false);
    debugLog('repeat');
    debugLog('repeat');
    debugLog('repeat');
    expect(getDebugLogs()).toHaveLength(3);
  });

  test('disabled debug emits nothing', () => {
    setDebugEnabled(false);
    debugLog('hello');
    debugWarn('warn');
    debugTrace('trace');
    expect(getDebugLogs()).toHaveLength(0);
  });
});
