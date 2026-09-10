import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compatible, summaryTable } from './summary-table.mts';
import { selectBaselineRun } from './post-comment.mts';

function report() {
  return {
    schemaVersion: 1,
    measurementDefinitionVersion: 3,
    fixtureVersion: 4,
    valid: true,
    platform: 'android',
    mode: 'native-release',
    metadata: {
      deviceModel: 'Pixel',
      osVersion: '15',
      apiLevel: 35,
      emulator: true,
      abi: 'x86_64',
      iterations: 3,
      timingCycles: 3,
      reactNativeVersion: '0.83.0',
      reanimatedVersion: '4.2',
      nodeVersion: 'v24.13.0',
      runnerImage: 'ubuntu-1',
    },
    metrics: {
      'android.transitionFrames[gallery].deadlineOverrunPercent': {
        count: 3,
        median: 0,
      },
      'gallery.forward.requestToSessionActiveMs': { count: 1, median: 40 },
    },
  };
}

test('shows absolute deltas including zero baselines, negative timing changes', () => {
  const base = report();
  const current = report();
  current.metrics[
    'android.transitionFrames[gallery].deadlineOverrunPercent'
  ].median = 5;
  current.metrics['gallery.forward.requestToSessionActiveMs'].median = 30;
  assert.equal(compatible(current, base), true);
  const table = summaryTable(current, base);
  assert.match(table, /0 \| 5 \| \+5 pp/);
  assert.match(table, /40 \| 30 \| -10 ms/);
  assert.doesNotMatch(table, /Infinity|NaN/);
});

test('requires explicit matching environment and definition metadata', () => {
  for (const field of Object.keys(report().metadata)) {
    if (field === 'runnerImage') continue;
    const base = report();
    delete (base.metadata as Record<string, unknown>)[field];
    assert.equal(compatible(report(), base), false, field);
  }
  for (const field of [
    'fixtureVersion',
    'measurementDefinitionVersion',
    'schemaVersion',
    'mode',
    'platform',
    'valid',
  ]) {
    const base = { ...report(), [field]: 'different' };
    assert.equal(compatible(report(), base), false, field);
  }
  assert.equal(compatible(report()), false);
  assert.match(summaryTable(report()), /— \| 0 \| —/);
});

test('compares measurements across runner image versions or missing runner image metadata', () => {
  const base = report();
  const current = report();
  current.metadata.runnerImage = 'ubuntu-2';
  assert.equal(compatible(current, base), true);
  assert.match(summaryTable(current, base), /40 \| 40 \| 0 ms/);
  delete (base.metadata as Record<string, unknown>).runnerImage;
  assert.equal(compatible(current, base), true);
});

test('does not display nonnumeric metrics or compare invalid collections', () => {
  const current = report();
  current.metrics['gallery.forward.requestToSessionActiveMs'].median = NaN;
  assert.doesNotMatch(summaryTable(current), /NaN/);
  assert.equal(compatible(current, { ...report(), valid: false }), false);
});

test('selects only successful push runs for the exact PR base branch and commit', () => {
  const pr = { base: { ref: 'master', sha: 'base' } };
  const good = {
    id: 10,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'base',
    head_branch: 'master',
    repository: { full_name: 'owner/repo' },
  };
  for (const changed of [
    { event: 'pull_request' },
    { head_sha: 'older' },
    { head_branch: 'other' },
    { conclusion: 'failure' },
    { repository: { full_name: 'fork/repo' } },
  ]) {
    assert.equal(
      selectBaselineRun(
        [{ ...good, ...changed, id: 20 }, good],
        pr,
        'owner/repo'
      ),
      good
    );
  }
  assert.equal(selectBaselineRun([], pr, 'owner/repo'), undefined);
});

test('does not compare rows collected with different sample counts', () => {
  const base = report();
  base.metrics['gallery.forward.requestToSessionActiveMs'].count = 2;
  assert.match(
    summaryTable(report(), base),
    /open preparation \(ms\) \| — \| 40 \| —/
  );
});
