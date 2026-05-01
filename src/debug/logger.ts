import type { ChoreographyDebugLevel } from '../types';

const DEBUG_PREFIX = '[Choreography]';
let debugEnabled = false;
let debugLevel: ChoreographyDebugLevel = 'info';
let coalesceEnabled = true;

const MAX_LOGS = 200;
const logs: string[] = new Array(MAX_LOGS);
let logHead = 0;
let logCount = 0;

const LEVEL_PRIORITY: Record<ChoreographyDebugLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  trace: 3,
};

let lastMessage: string | null = null;
let lastEntry: string | null = null;
let lastRepeatCount = 0;

function shouldEmit(level: ChoreographyDebugLevel): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[debugLevel];
}

export function setDebugEnabled(enabled: boolean) {
  debugEnabled = enabled;
  if (enabled) {
    debugLevel = 'info';
  }
}

export function setDebugLevel(level: ChoreographyDebugLevel) {
  debugLevel = level;
}

export function setDebugCoalesce(enabled: boolean) {
  coalesceEnabled = enabled;
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

export function isTraceEnabled(): boolean {
  return debugEnabled && shouldEmit('trace');
}

function emit(level: ChoreographyDebugLevel, message: string | (() => string)) {
  if (!debugEnabled) return;
  if (!shouldEmit(level)) return;

  const text = typeof message === 'function' ? message() : message;

  if (coalesceEnabled && text === lastMessage && lastEntry) {
    lastRepeatCount += 1;
    // Update the last log entry in-place to indicate repeats. This keeps
    // the buffer bounded and the console quieter for chatty traces.
    const repeatLabel = ` (×${lastRepeatCount + 1})`;
    const previousIndex = (logHead - 1 + MAX_LOGS) % MAX_LOGS;
    const updated = `${lastEntry}${repeatLabel}`;
    logs[previousIndex] = updated;
    return;
  }

  const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 12) ?? '';
  const entry = `${timestamp} ${DEBUG_PREFIX} ${text}`;

  logs[logHead] = entry;
  logHead = (logHead + 1) % MAX_LOGS;
  if (logCount < MAX_LOGS) {
    logCount++;
  }

  lastMessage = text;
  lastEntry = entry;
  lastRepeatCount = 0;

  console.log(entry);
}

export function debugLog(message: string | (() => string)) {
  emit('info', message);
}

export function debugTrace(message: string | (() => string)) {
  emit('trace', message);
}

export function debugWarn(message: string | (() => string)) {
  emit('warn', message);
}

export function debugError(message: string | (() => string)) {
  emit('error', message);
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
  lastMessage = null;
  lastEntry = null;
  lastRepeatCount = 0;
}
