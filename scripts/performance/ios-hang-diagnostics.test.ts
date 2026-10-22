import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  appPid,
  captureHang,
  collectFailureDiagnostics,
  isHangRetry,
  parseCheckpoint,
  runTests,
  verifyExecutable,
  validateBreadcrumbCoverage,
} from './ios-hang-diagnostics.mts';

const udid = 'A655CAAF-8F02-43E5-B75A-42AF09FE0C5B';
const retry = 'Checking existence of `"benchmark-list-settled" Any` (retry 1)';
const executable = `/Users/runner/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Bundle/Application/ABC/ScreenChoreographyExample.app/ScreenChoreographyExample`;

const checkpoint = {
  scenario: 'wallet',
  roundTrip: 17,
  action: 'wait:benchmark-list-settled',
};

test('breadcrumb coverage rejects the original late-run cutoff and ignores replays', () => {
  const lines = [1, 2, 3].flatMap((pid) =>
    Array.from(
      { length: 40 },
      (_, index) =>
        `ScreenChoreographyExample[${pid}:ab] [dev.screenchoreography.hang:native] enter presented scope=${index} identity=session_${index + 1}`
    )
  );
  assert.doesNotThrow(() => validateBreadcrumbCoverage(lines.join('\n'), 20));
  assert.doesNotThrow(() =>
    validateBreadcrumbCoverage([...lines, lines[0]].join('\n'), 20)
  );
  assert.throws(
    () => validateBreadcrumbCoverage(lines.slice(0, -9).join('\n'), 20),
    /40, 40, 31/
  );
  assert.throws(
    () => validateBreadcrumbCoverage('', 20),
    /Incomplete native breadcrumb coverage/
  );
});

test('checkpoint parser rejects unrelated output and malformed context', () => {
  assert.deepEqual(
    parseCheckpoint(`CHOREOGRAPHY_STEP ${JSON.stringify(checkpoint)}`),
    checkpoint
  );
  assert.equal(parseCheckpoint('normal XCTest output'), null);
  assert.equal(parseCheckpoint('CHOREOGRAPHY_STEP {'), null);
  assert.equal(parseCheckpoint('CHOREOGRAPHY_STEP null'), null);
  assert.equal(
    parseCheckpoint(
      'CHOREOGRAPHY_STEP {"scenario":"wallet","roundTrip":-1,"action":"wait"}'
    ),
    null
  );
});

test('failure export preserves XCTest crash summary when simulator log export fails', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'ios crash evidence '));
  try {
    await collectFailureDiagnostics(udid, output, async (_file, args) => {
      if (args[0] === 'xcresulttool')
        return {
          stdout: '{"testFailures":[{"failureText":"App crashed"}]}',
          stderr: '',
        };
      assert.equal(args[2], udid);
      throw new Error('simulator unavailable');
    });
    assert.match(
      readFileSync(
        path.join(output, 'diagnostics/xcresult-summary.json'),
        'utf8'
      ),
      /App crashed/
    );
    assert.match(
      readFileSync(path.join(output, 'diagnostics/export.log'), 'utf8'),
      /simulator unavailable/
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('samples only benchmark query retries, not normal waits or build retries', () => {
  assert.equal(isHangRetry(retry), true);
  assert.equal(
    isHangRetry('Waiting 15.0s for "benchmark-list-settled" Any to exist'),
    false
  );
  assert.equal(
    isHangRetry('Checking existence of `"benchmark-list-settled" Any`'),
    false
  );
  assert.equal(
    isHangRetry('Checking existence of "Other app" (retry 1)'),
    false
  );
  assert.equal(isHangRetry('Downloading dependency (retry 1)'), false);
});

test('resolves one live app in the simulator and rejects ambiguous or unrelated PIDs', () => {
  assert.equal(
    appPid(
      'PID Status Label\n- 0 UIKitApplication:screenchoreography.example[old]\n123 0 UIKitApplication:screenchoreography.example[live]\n456 0 UIKitApplication:other[app]'
    ),
    123
  );
  assert.throws(() =>
    appPid('- 0 UIKitApplication:screenchoreography.example[dead]')
  );
  assert.throws(() =>
    appPid(
      '123 0 UIKitApplication:screenchoreography.example[a]\n456 0 UIKitApplication:screenchoreography.example[b]'
    )
  );
  verifyExecutable(executable, udid);
  assert.throws(() => verifyExecutable(executable, 'different-simulator'));
  assert.throws(() => verifyExecutable(executable + '-Runner', udid));
});

test('persists diagnostic provenance before sampling and retains permission failures', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'ios hang '));
  const calls: string[][] = [];
  try {
    await captureHang(udid, output, retry, async (file, args) => {
      calls.push([file, ...args]);
      assert.ok(existsSync(path.join(output, 'diagnostics/hang-trigger.json')));
      if (file === '/usr/bin/xcrun')
        return {
          stdout: '123 0 UIKitApplication:screenchoreography.example[live]',
          stderr: '',
        };
      if (file === '/bin/ps') return { stdout: executable, stderr: '' };
      throw new Error('sample: permission denied');
    });
    assert.deepEqual(calls[0], [
      '/usr/bin/xcrun',
      'simctl',
      'spawn',
      udid,
      'launchctl',
      'list',
    ]);
    assert.deepEqual(calls[2], [
      '/usr/bin/sample',
      '123',
      '5',
      '-mayDie',
      '-file',
      path.join(output, 'diagnostics/hang-sample.txt'),
    ]);
    assert.match(
      readFileSync(path.join(output, 'diagnostics/sample.log'), 'utf8'),
      /permission denied/
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('does not sample a stale PID now belonging to another simulator', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'ios hang '));
  let sampled = false;
  try {
    await captureHang(udid, output, retry, async (file) => {
      if (file === '/usr/bin/xcrun')
        return {
          stdout: '123 0 UIKitApplication:screenchoreography.example[live]',
          stderr: '',
        };
      if (file === '/bin/ps')
        return { stdout: executable.replace(udid, 'other'), stderr: '' };
      sampled = true;
      return { stdout: '', stderr: '' };
    });
    assert.equal(sampled, false);
    assert.match(
      readFileSync(path.join(output, 'diagnostics/sample.log'), 'utf8'),
      /does not belong/
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('streams split retries, captures once, and preserves XCTest failure and successful output', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'ios watcher '));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `${output}:${originalPath}`;
    writeFileSync(
      path.join(output, 'xcodebuild'),
      `#!/bin/bash\nprintf '%s\\n' 'CHOREOGRAPHY_STEP ${JSON.stringify(checkpoint)}'\nprintf '%s' 'Checking existence of '\nsleep 0.05\nprintf '%s\\n' '\`"benchmark-list-settled" Any\` (retry 1)'\nprintf '%s\\n' 'Checking existence of \`"benchmark-list-settled" Any\` (retry 2)' >&2\nexit 65\n`,
      { mode: 0o755 }
    );
    let captures = 0;
    const capture = async () => {
      captures++;
      const saved = JSON.parse(
        readFileSync(path.join(output, 'diagnostics/last-step.json'), 'utf8')
      );
      assert.equal(saved.roundTrip, 17);
    };
    assert.equal(
      await runTests(
        udid,
        output,
        ['test-without-building'],
        capture,
        async () => {
          throw new Error('evidence unavailable');
        }
      ),
      65
    );
    assert.equal(captures, 1);
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(output, 'diagnostics/failure.json'), 'utf8')
      ),
      {
        testExitCode: 65,
        lastStep: checkpoint,
        failedSteps: [],
        samplingAttempted: true,
      }
    );
    assert.match(
      readFileSync(path.join(output, 'tests.log'), 'utf8'),
      /retry 1/
    );
    writeFileSync(
      path.join(output, 'xcodebuild'),
      '#!/bin/bash\necho "Test passed"\n',
      { mode: 0o755 }
    );
    assert.equal(
      await runTests(udid, output, ['test-without-building'], capture),
      0
    );
    assert.equal(captures, 1);
    assert.equal(
      readFileSync(path.join(output, 'tests.log'), 'utf8'),
      'Test passed\n'
    );
  } finally {
    process.env.PATH = originalPath;
    rmSync(output, { recursive: true, force: true });
  }
});

test('later successful scenarios do not overwrite a failed test checkpoint', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'ios failed steps '));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `${output}:${originalPath}`;
    writeFileSync(
      path.join(output, 'xcodebuild'),
      `#!/bin/sh
cat <<'LOG'
CHOREOGRAPHY_STEP ${JSON.stringify(checkpoint)}
Test Case 'testWallet' failed (120 seconds).
CHOREOGRAPHY_STEP {"scenario":"gallery","roundTrip":20,"action":"complete"}
Test Case 'testGallery' passed (200 seconds).
LOG
exit 65
`,
      { mode: 0o755 }
    );
    assert.equal(
      await runTests(udid, output, ['test'], undefined, async () => {}),
      65
    );
    const evidence = JSON.parse(
      readFileSync(path.join(output, 'diagnostics/failure.json'), 'utf8')
    );
    assert.equal(evidence.lastStep.scenario, 'gallery');
    assert.deepEqual(evidence.failedSteps, [
      {
        testCase: "Test Case 'testWallet' failed (120 seconds).",
        step: checkpoint,
      },
    ]);
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(output, 'diagnostics/failed-steps.json'), 'utf8')
      ),
      evidence.failedSteps
    );
  } finally {
    process.env.PATH = originalPath;
    rmSync(output, { recursive: true, force: true });
  }
});

test('cancelling the watcher terminates its XCTest child', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'ios cancellation '));
  writeFileSync(
    path.join(output, 'xcodebuild'),
    '#!/bin/sh\nexec "$TEST_NODE" -e \'console.log(process.pid); setInterval(() => {}, 1000)\'\n',
    { mode: 0o755 }
  );
  const child = spawn(
    process.execPath,
    [
      '--experimental-transform-types',
      fileURLToPath(new URL('./ios-hang-diagnostics.mts', import.meta.url)),
      udid,
      output,
      'test-without-building',
    ],
    {
      env: {
        ...process.env,
        PATH: `${output}:${process.env.PATH}`,
        TEST_NODE: process.execPath,
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );
  let fixturePid: number | undefined;
  try {
    const closed = once(child, 'close', { signal: AbortSignal.timeout(5000) });
    const [data] = await once(child.stdout, 'data', {
      signal: AbortSignal.timeout(5000),
    });
    fixturePid = Number(String(data).trim());
    assert.ok(Number.isInteger(fixturePid) && fixturePid > 0);
    child.kill('SIGTERM');
    const [code] = await closed;
    assert.notEqual(code, 0);
    assert.throws(() => process.kill(fixturePid!, 0), { code: 'ESRCH' });
  } finally {
    child.kill('SIGKILL');
    if (fixturePid) {
      try {
        process.kill(fixturePid, 'SIGKILL');
      } catch {
        /* already reaped */
      }
    }
    rmSync(output, { recursive: true, force: true });
  }
});
