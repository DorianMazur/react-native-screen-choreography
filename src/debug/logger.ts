import type { ChoreographyDebugLevel } from '../types';

const DEBUG_PREFIX = '[Choreography]';
let debugEnabled = false;
let debugLevel: ChoreographyDebugLevel = 'info';
let coalesceEnabled = true;

const LEVEL_PRIORITY: Record<ChoreographyDebugLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  trace: 3,
};

let lastMessage: string | null = null;

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

  if (coalesceEnabled && text === lastMessage) return;
  lastMessage = text;

  const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 12) ?? '';
  const entry = `${timestamp} ${DEBUG_PREFIX} ${text}`;

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
