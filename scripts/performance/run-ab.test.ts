import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
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

test('A/B launcher alternates library sources, restores them and tolerates a failing base', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ab benchmark '));
  const results = mkdtempSync(path.join(tmpdir(), 'ab results '));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (name: string, body: string) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    for (const directory of ['cpp', 'ios', 'android'])
      write(`${directory}/.keep`, '');
    write('src/value', 'base');
    write('src/base-only', '');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    write('src/value', 'head');
    write('src/head-only', '');
    git('rm', '-q', 'src/base-only');
    git('add', '.');
    git('commit', '-q', '-m', 'head');

    // Stand-ins record what each run would have measured.
    write(
      'scripts/performance/run-ios.sh',
      `#!/bin/bash
side="$(cat src/value)"
echo "$(basename "$PERFORMANCE_OUTPUT") $side $(ls src | tr '\\n' ' ')\${PERFORMANCE_SCREEN_TIMING_CYCLES:-unset}/\${PERFORMANCE_TRAY_TIMING_CYCLES:-unset}" >> "$AB_LOG"
if [[ "$side" == base ]]; then exit "$BASE_EXIT_STATUS"; fi
`
    );
    write(
      'scripts/performance/ab.mts',
      `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.AB_LOG, 'report ' + process.argv.slice(2).join(' ') + '\\n');
`
    );
    copyFileSync(
      new URL('./run-ab.sh', import.meta.url),
      path.join(root, 'scripts/performance/run-ab.sh')
    );
    const run = (name: string, env: Record<string, string>) => {
      const log = path.join(results, `${name}.log`);
      const result = spawnSync(
        'bash',
        [path.join(root, 'scripts/performance/run-ab.sh'), 'ios'],
        {
          encoding: 'utf8',
          timeout: 15000,
          env: {
            ...process.env,
            AB_LOG: log,
            BASE_EXIT_STATUS: '0',
            PERFORMANCE_AB_BASE: 'HEAD^1',
            PERFORMANCE_OUTPUT: path.join(results, name),
            ...env,
          },
        }
      );
      return {
        ...result,
        log: existsSync(log)
          ? readFileSync(log, 'utf8').trim().split('\n')
          : [],
      };
    };
    const restored = () => {
      assert.equal(readFileSync(path.join(root, 'src/value'), 'utf8'), 'head');
      assert.equal(existsSync(path.join(root, 'src/base-only')), false);
      assert.equal(git('status', '--porcelain', '--', 'src'), '');
    };

    const paired = run('paired', {});
    assert.equal(paired.status, 0, paired.stderr);
    assert.deepEqual(paired.log.slice(0, 4), [
      'base-1 base base-only value 10/3',
      'head-1 head head-only value 10/3',
      'head-2 head head-only value 10/3',
      'base-2 base base-only value 10/3',
    ]);
    assert.match(
      paired.log[4]!,
      new RegExp(
        `^report --platform=ios .* --rounds=2 --base=${git('rev-parse', 'HEAD^1')}$`
      )
    );
    restored();

    // A base that fails with the current fixture is not measured again and
    // does not fail the run.
    const failingBase = run('failing-base', { BASE_EXIT_STATUS: '1' });
    assert.equal(failingBase.status, 0, failingBase.stderr);
    assert.deepEqual(
      failingBase.log.slice(0, 3).map((line) => line.split(' ')[0]),
      ['base-1', 'head-1', 'head-2']
    );
    assert.match(failingBase.log[3]!, /^report /);
    restored();

    const unchanged = run('unchanged', { PERFORMANCE_AB_BASE: 'HEAD' });
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.deepEqual(unchanged.log, [
      'unchanged head head-only value unset/unset',
    ]);

    write('src/value', 'uncommitted');
    const dirty = run('dirty', {});
    assert.equal(dirty.status, 2);
    assert.match(dirty.stderr, /Commit or stash library changes/);
    assert.equal(
      readFileSync(path.join(root, 'src/value'), 'utf8'),
      'uncommitted'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(results, { recursive: true, force: true });
  }
});
