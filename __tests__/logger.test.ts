import {
  setDebugEnabled,
  isDebugEnabled,
  debugLog,
  getDebugLogs,
  clearDebugLogs,
} from '../src/debug/logger';

describe('Debug Logger', () => {
  afterEach(() => {
    setDebugEnabled(false);
    clearDebugLogs();
  });

  test('logs are not recorded when debug is disabled', () => {
    setDebugEnabled(false);
    debugLog('test message');
    expect(getDebugLogs()).toHaveLength(0);
  });

  test('logs are recorded when debug is enabled', () => {
    setDebugEnabled(true);
    debugLog('test message');
    const logs = getDebugLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('test message');
    expect(logs[0]).toContain('[Choreography]');
  });

  test('isDebugEnabled returns correct state', () => {
    expect(isDebugEnabled()).toBe(false);
    setDebugEnabled(true);
    expect(isDebugEnabled()).toBe(true);
  });

  test('clearDebugLogs empties the log buffer', () => {
    setDebugEnabled(true);
    debugLog('message 1');
    debugLog('message 2');
    expect(getDebugLogs()).toHaveLength(2);

    clearDebugLogs();
    expect(getDebugLogs()).toHaveLength(0);
  });

  test('getDebugLogs returns a copy', () => {
    setDebugEnabled(true);
    debugLog('message');
    const logs1 = getDebugLogs();
    const logs2 = getDebugLogs();
    expect(logs1).not.toBe(logs2);
    expect(logs1).toEqual(logs2);
  });

  test('log buffer is capped at max size', () => {
    setDebugEnabled(true);
    for (let i = 0; i < 250; i++) {
      debugLog(`message ${i}`);
    }
    const logs = getDebugLogs();
    expect(logs.length).toBeLessThanOrEqual(200);
  });
});
