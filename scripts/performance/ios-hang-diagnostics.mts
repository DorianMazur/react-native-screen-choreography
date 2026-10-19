import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Readable, Writable } from 'node:stream';

const execute = promisify(execFile);
const bundleId = 'screenchoreography.example';

export function isHangRetry(line: string) {
  return /Checking existence of .*"benchmark-[^"]+".*\(retry \d+\)/.test(line);
}

// launchctl runs inside the owned simulator; never select an app by process name
// across the host, where another simulator may be running the same example.
export function appPid(services: string): number {
  const pids = services.split('\n').flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    return fields.length === 3 &&
      /^[1-9]\d*$/.test(fields[0]!) &&
      fields[2]!.startsWith(`UIKitApplication:${bundleId}[`)
      ? [Number(fields[0])]
      : [];
  });
  if (pids.length !== 1) throw new Error('Expected one running benchmark app');
  return pids[0]!;
}

export function verifyExecutable(executable: string, udid: string) {
  const normalized = executable.trim().toLowerCase();
  if (
    !normalized.includes(
      `/${udid.toLowerCase()}/data/containers/bundle/application/`
    ) ||
    !normalized.endsWith(
      '/screenchoreographyexample.app/screenchoreographyexample'
    )
  ) {
    throw new Error('Benchmark PID does not belong to the owned simulator app');
  }
}

type Execute = (
  file: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

export async function captureHang(
  udid: string,
  output: string,
  trigger: string,
  run: Execute
) {
  const directory = path.join(output, 'diagnostics');
  mkdirSync(directory, { recursive: true });
  // Persist before attaching, even if sampling fails or the app later recovers.
  writeFileSync(
    path.join(directory, 'hang-trigger.json'),
    JSON.stringify({ at: new Date().toISOString(), udid, trigger }, null, 2)
  );
  const log = path.join(directory, 'sample.log');
  try {
    const services = await run('/usr/bin/xcrun', [
      'simctl',
      'spawn',
      udid,
      'launchctl',
      'list',
    ]);
    const pid = appPid(services.stdout);
    const executable = await run('/bin/ps', ['-p', String(pid), '-o', 'comm=']);
    verifyExecutable(executable.stdout, udid);
    appendFileSync(log, `Sampling simulator ${udid}, app PID ${pid}\n`);
    const result = await run('/usr/bin/sample', [
      String(pid),
      '5',
      '-mayDie',
      '-file',
      path.join(directory, 'hang-sample.txt'),
    ]);
    appendFileSync(log, result.stdout + result.stderr);
  } catch (error) {
    // Diagnostics must not replace XCTest's exit status or hide collection errors.
    appendFileSync(log, `${String(error)}\n`);
  }
}

export async function runTests(
  udid: string,
  output: string,
  args: string[],
  captureAttempt = captureHang
) {
  const log = path.join(output, 'tests.log');
  writeFileSync(log, '');
  const abort = new AbortController();
  const child = spawn('xcodebuild', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let capture: Promise<void> | undefined;
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    abort.abort();
    child.kill('SIGTERM');
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const run: Execute = (file, argv) =>
    execute(file, argv, {
      encoding: 'utf8',
      timeout: file === '/usr/bin/sample' ? 15000 : 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 2 * 1024 * 1024,
      signal: abort.signal,
    });
  const observe = (stream: Readable, destination: Writable) => {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      appendFileSync(log, chunk);
      destination.write(chunk);
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop()!.slice(-16384);
      for (const line of lines) {
        if (!capture && !interrupted && isHangRetry(line)) {
          capture = captureAttempt(udid, output, line, run).catch((error) => {
            console.error('Hang diagnostics failed:', error);
            interrupted = true;
          });
        }
      }
    });
  };
  observe(child.stdout, process.stdout);
  observe(child.stderr, process.stderr);
  try {
    const status = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    });
    await capture;
    return status || (interrupted ? 1 : 0);
  } finally {
    abort.abort();
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [udid, output, ...args] = process.argv.slice(2);
  if (!udid || !output || !args.length)
    throw new Error('Expected simulator, output, and xcodebuild arguments');
  runTests(udid, output, args).then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
