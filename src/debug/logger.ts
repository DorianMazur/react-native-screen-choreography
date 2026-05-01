const DEBUG_PREFIX = '[Choreography]';
let debugEnabled = false;
const MAX_LOGS = 200;
const logs: string[] = new Array(MAX_LOGS);
let logHead = 0;
let logCount = 0;

export function setDebugEnabled(enabled: boolean) {
  debugEnabled = enabled;
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

export function debugLog(message: string | (() => string)) {
  if (!debugEnabled) return;

  const text = typeof message === 'function' ? message() : message;
  const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 12) ?? '';
  const entry = `${timestamp} ${DEBUG_PREFIX} ${text}`;

  logs[logHead] = entry;
  logHead = (logHead + 1) % MAX_LOGS;
  if (logCount < MAX_LOGS) {
    logCount++;
  }

  console.log(entry);
}

export function getDebugLogs(): string[] {
  if (logCount < MAX_LOGS) {
    return logs.slice(0, logCount);
  }
  // Oldest entries start at logHead, wrap around
  return [...logs.slice(logHead, MAX_LOGS), ...logs.slice(0, logHead)];
}

export function clearDebugLogs() {
  logHead = 0;
  logCount = 0;
}
