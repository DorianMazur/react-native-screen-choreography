import type { InputRecord } from './types.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMENT_MARKER,
  isCurrentPullRequest,
  readArtifactSummary,
  renderComment,
} from './post-comment.mts';

const artifact = 'performance-summary-android-native-release';
const run = {
  id: 42,
  run_attempt: 2,
  conclusion: 'success',
  head_sha: 'abc',
  html_url: 'https://github.com/owner/repo/actions/runs/42',
};
const report = {
  schemaVersion: 1,
  platform: 'android',
  mode: 'native-release',
  valid: true,
  metrics: {
    'gallery.forward.requestToSessionActiveMs': { count: 20, median: 40 },
    'gallery.backward.requestToSessionActiveMs': { count: 20, median: 25 },
    'gallery.forward.preparation.overlay-readyMs': { count: 20, median: 100 },
  },
};

test('only the current open PR head in this repository can receive a comment', () => {
  const pr = {
    state: 'open',
    head: { sha: 'abc' },
    base: { repo: { full_name: 'owner/repo' } },
  };
  assert.equal(isCurrentPullRequest(pr, run, 'owner/repo'), true);
  assert.equal(
    isCurrentPullRequest({ ...pr, state: 'closed' }, run, 'owner/repo'),
    false
  );
  assert.equal(
    isCurrentPullRequest(pr, { ...run, head_sha: 'old' }, 'owner/repo'),
    false
  );
  assert.equal(isCurrentPullRequest(pr, run, 'other/repo'), false);
});

test('comment contains only release headline comparisons, never startup or profiling metrics', () => {
  const body = renderComment(run, { [artifact]: report });
  assert.ok(body.includes(COMMENT_MARKER));
  assert.match(body, /Release: \*\*passed\*\*/);
  assert.match(body, /No compatible baseline/);
  assert.match(body, /open preparation \(ms\) \| — \| 40 \| —/);
  assert.match(body, /return preparation \(ms\) \| — \| 25 \| —/);
  assert.doesNotMatch(
    body,
    /startup diagnostics|overlay-readyMs|React profil|frames over deadline/
  );
  assert.equal(
    body.split('\n').filter((line) => /^\| Gallery/.test(line)).length,
    2
  );
});

test('missing, mismatched and failed collections do not manufacture values', () => {
  assert.match(renderComment(run, {}), /No validated summary/);
  assert.match(
    renderComment(run, { [artifact]: { ...report, platform: 'ios' } }),
    /mismatched report/
  );
  const body = renderComment(
    { ...run, conclusion: 'failure' },
    { [artifact]: { ...report, valid: false, errors: ['bad input'] } }
  );
  assert.match(body, /Collection failed/);
  assert.doesNotMatch(body, /\| Gallery/);
});

test('artifact reading validates schema and handles bounded failures', async () => {
  assert.deepEqual(
    await readArtifactSummary(artifact, async () => report),
    report
  );
  for (const load of [
    async () => JSON.parse('{truncated'),
    async () => ({ ...report, mode: 'unknown' }),
    async () => {
      throw new Error('@everyone <script> | '.repeat(1000));
    },
  ]) {
    const failed: InputRecord = await readArtifactSummary(artifact, load);
    assert.equal(failed.valid, false);
    assert.ok(failed.errors[0].length < 550);
    const body = renderComment(run, { [artifact]: failed });
    assert.doesNotMatch(body, /@everyone|<script>/);
  }
  await assert.rejects(() =>
    readArtifactSummary('unexpected', async () => report)
  );
});
