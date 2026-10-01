import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(
  new URL('./install-android-emulator.sh', import.meta.url)
);

function fixture(failures: number) {
  const directory = mkdtempSync(path.join(tmpdir(), 'emulator installer '));
  const sdk = path.join(directory, 'sdk');
  const bin = path.join(directory, 'bin');
  mkdirSync(path.join(sdk, 'cmdline-tools/latest/bin'), { recursive: true });
  mkdirSync(path.join(sdk, 'emulator'));
  mkdirSync(bin);
  writeFileSync(path.join(sdk, 'emulator/installed'), 'existing emulator');
  writeFileSync(
    path.join(sdk, 'cmdline-tools/latest/bin/sdkmanager'),
    `#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == '--install emulator --channel=0' ]]
attempt=1
if [[ -f "$ANDROID_HOME/attempts" ]]; then
  attempt=$(( $(cat "$ANDROID_HOME/attempts") + 1 ))
  # Failed downloads from the preceding attempt must not be reused.
  [[ ! -e "$ANDROID_HOME/.temp" && ! -e "$ANDROID_HOME/.downloadIntermediates" ]]
fi
printf '%s' "$attempt" > "$ANDROID_HOME/attempts"
if [[ "$attempt" -le "$STUB_FAILURES" ]]; then
  mkdir -p "$ANDROID_HOME/.temp" "$ANDROID_HOME/.downloadIntermediates"
  printf 'Error on ZipFile unknown archive\\n' >&2
  exit 23
fi
`,
    { mode: 0o755 }
  );
  writeFileSync(
    path.join(bin, 'sleep'),
    `#!/usr/bin/env bash
[[ "$*" == 10 ]]
printf '%s\\n' "$*" >> "$ANDROID_HOME/sleeps"
`,
    { mode: 0o755 }
  );
  const run = () =>
    spawnSync('bash', [installer], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        ANDROID_HOME: sdk,
        STUB_FAILURES: String(failures),
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    });
  return {
    sdk,
    run,
    attempts: () => Number(readFileSync(path.join(sdk, 'attempts'), 'utf8')),
    sleeps: () =>
      existsSync(path.join(sdk, 'sleeps'))
        ? readFileSync(path.join(sdk, 'sleeps'), 'utf8').trim().split('\n')
        : [],
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('a current emulator succeeds on the first install without clearing caches', () => {
  const sdk = fixture(0);
  try {
    mkdirSync(path.join(sdk.sdk, '.temp'));
    const result = sdk.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(sdk.attempts(), 1);
    assert.deepEqual(sdk.sleeps(), []);
    assert.ok(existsSync(path.join(sdk.sdk, '.temp')));
  } finally {
    sdk.dispose();
  }
});

test('a corrupt emulator download is retried after clearing staging caches', () => {
  const sdk = fixture(1);
  try {
    const result = sdk.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(sdk.attempts(), 2);
    assert.deepEqual(sdk.sleeps(), ['10']);
    assert.equal(
      readFileSync(path.join(sdk.sdk, 'emulator/installed'), 'utf8'),
      'existing emulator'
    );
    assert.match(result.stderr, /retrying with a fresh download/);
  } finally {
    sdk.dispose();
  }
});

test('persistent emulator download failures stop after three attempts', () => {
  const sdk = fixture(3);
  try {
    const result = sdk.run();
    assert.equal(result.status, 23, result.stderr);
    assert.equal(sdk.attempts(), 3);
    assert.deepEqual(sdk.sleeps(), ['10', '10']);
    assert.ok(existsSync(path.join(sdk.sdk, 'emulator/installed')));
    assert.match(result.stderr, /installation failed after 3 attempts/);
  } finally {
    sdk.dispose();
  }
});
