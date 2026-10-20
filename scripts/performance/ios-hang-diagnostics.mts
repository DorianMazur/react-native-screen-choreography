import { execFile, spawn } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Readable, Writable } from 'node:stream';

const execute = promisify(execFile);
const bundleId = 'screenchoreography.example';

export function validateBreadcrumbCoverage(log: string, cycles: number) {
  const processes = new Map<string, Set<string>>();
  for (const line of log.split('\n')) {
    const match = line.match(
      /ScreenChoreographyExample\[(\d+):[^\]]+\].*\[dev\.screenchoreography\.hang:native\] enter presented .* identity=(\S+)$/
    );
    if (!match) continue;
    const sessions = processes.get(match[1]!) ?? new Set<string>();
    sessions.add(match[2]!); // Readiness replay must not inflate coverage.
    processes.set(match[1]!, sessions);
  }
  if (
    processes.size !== 3 ||
    [...processes.values()].some((sessions) => sessions.size !== cycles * 2)
  )
    throw new Error(
      `Incomplete native breadcrumb coverage: expected 3 app launches with ${cycles * 2} presented sessions each; found [${[...processes.values()].map((sessions) => sessions.size).join(', ')}]`
    );
}

export function parseCheckpoint(line: string) {
  const marker = 'CHOREOGRAPHY_STEP ';
  const start = line.indexOf(marker);
  if (start < 0) return null;
  try {
    const value = JSON.parse(line.slice(start + marker.length));
    if (
      !['gallery', 'trips', 'wallet'].includes(value.scenario) ||
      !Number.isSafeInteger(value.roundTrip) ||
      value.roundTrip < 0 ||
      value.roundTrip > 99 ||
      typeof value.action !== 'string' ||
      value.action.length > 160
    )
      return null;
    return {
      scenario: value.scenario as string,
      roundTrip: value.roundTrip as number,
      action: value.action as string,
    };
  } catch {
    return null;
  }
}

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

export async function collectFailureDiagnostics(
  udid: string,
  output: string,
  run: Execute
) {
  // Run only after XCTest fails. Neither command needs the app's JS/UI thread.
  const directory = path.join(output, 'diagnostics');
  mkdirSync(directory, { recursive: true });
  for (const [filename, args] of [
    [
      'xcresult-summary.json',
      [
        'xcresulttool',
        'get',
        'test-results',
        'summary',
        '--path',
        path.join(output, 'tests.xcresult'),
        '--compact',
      ],
    ],
    [
      'app-errors.log',
      [
        'simctl',
        'spawn',
        udid,
        'log',
        'show',
        '--style',
        'compact',
        '--last',
        '1h',
        '--predicate',
        'process == "ScreenChoreographyExample" AND (messageType == error OR messageType == fault)',
      ],
    ],
  ] as const) {
    try {
      const result = await run('xcrun', [...args]);
      writeFileSync(path.join(directory, filename), result.stdout);
      if (result.stderr)
        appendFileSync(path.join(directory, 'export.log'), result.stderr);
    } catch (error) {
      appendFileSync(
        path.join(directory, 'export.log'),
        `${filename}: ${String(error)}\n`
      );
    }
  }
}

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
  captureAttempt = captureHang,
  failureDiagnostics = collectFailureDiagnostics
) {
  const log = path.join(output, 'tests.log');
  writeFileSync(log, '');
  const abort = new AbortController();
  const child = spawn('xcodebuild', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let capture: Promise<void> | undefined;
  let lastStep: ReturnType<typeof parseCheckpoint> = null;
  const failedSteps: {
    testCase: string;
    step: ReturnType<typeof parseCheckpoint>;
  }[] = [];
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
        const checkpoint = parseCheckpoint(line);
        if (checkpoint) {
          lastStep = checkpoint;
          mkdirSync(path.join(output, 'diagnostics'), { recursive: true });
          writeFileSync(
            path.join(output, 'diagnostics/last-step.json'),
            JSON.stringify(
              { ...checkpoint, observedAt: new Date().toISOString() },
              null,
              2
            )
          );
        }
        if (/Test Case .+ (?:failed|crashed)\b/.test(line)) {
          failedSteps.push({ testCase: line, step: lastStep });
          mkdirSync(path.join(output, 'diagnostics'), { recursive: true });
          writeFileSync(
            path.join(output, 'diagnostics/failed-steps.json'),
            JSON.stringify(failedSteps, null, 2)
          );
        }
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
    if (status && !interrupted) {
      mkdirSync(path.join(output, 'diagnostics'), { recursive: true });
      writeFileSync(
        path.join(output, 'diagnostics/failure.json'),
        JSON.stringify(
          {
            testExitCode: status,
            lastStep,
            failedSteps,
            samplingAttempted: !!capture,
          },
          null,
          2
        )
      );
      console.error('XCTest failed:', { testExitCode: status, lastStep });
      await failureDiagnostics(udid, output, run).catch((error) => {
        console.error('Failure evidence export failed:', error);
      });
    }
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
  if (process.argv[2] === '--check-breadcrumbs') {
    const output = process.argv[3]!;
    const metadataPath = path.join(output, 'metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    try {
      validateBreadcrumbCoverage(
        readFileSync(
          path.join(output, 'diagnostics/native-breadcrumbs.log'),
          'utf8'
        ),
        Number(process.argv[4])
      );
    } catch (error) {
      metadata.diagnosticErrors = [String(error)];
    }
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  } else {
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
}
