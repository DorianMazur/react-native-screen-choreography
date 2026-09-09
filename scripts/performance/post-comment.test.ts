import type { InputRecord } from './types.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMENT_MARKER,
  isCurrentPullRequest,
  readArtifactSummary,
  renderComment,
} from './post-comment.mts';

const run = {
  id: 42,
  run_attempt: 2,
  conclusion: 'success',
  head_sha: 'abc',
  html_url: 'https://github.com/example/library/actions/runs/42',
};

test('matches only an open PR in this repository at the measured head', () => {
  const pr = {
    state: 'open',
    head: { sha: 'abc' },
    base: { repo: { full_name: 'example/library' } },
  };
  assert.equal(isCurrentPullRequest(pr, run, 'example/library'), true);
  assert.equal(
    isCurrentPullRequest(
      { ...pr, head: { sha: 'new' } },
      run,
      'example/library'
    ),
    false
  );
  assert.equal(
    isCurrentPullRequest({ ...pr, state: 'closed' }, run, 'example/library'),
    false
  );
  assert.equal(isCurrentPullRequest(pr, run, 'other/library'), false);
});

test('renders a compact update with explicit missing/failed collection and profiling units', () => {
  const body = renderComment(run, {
    'performance-summary-android-native-release': {
      schemaVersion: 1,
      platform: 'android',
      mode: 'native-release',
      valid: true,
      metrics: {
        'live.forward.requestToSessionActiveMs': {
          count: 10,
          median: 31.4567,
          p95: null,
        },
      },
    },
    'performance-summary-android-react-profile': {
      schemaVersion: 1,
      platform: 'android',
      mode: 'react-profile',
      valid: false,
      errors: ['missing data @everyone <script> | `bad`'],
    },
  });
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.match(body, /31\.457/);
  assert.match(body, /Collection failed/);
  assert.doesNotMatch(body, /No validated summary/);
  assert.doesNotMatch(body, /### ios-/);
  assert.match(body, /Release: \*\*passed\*\* · React profile: \*\*failed\*\*/);
  assert.equal(body.includes('@everyone'), false);
  assert.equal(body.includes('<script>'), false);
});

test('never presents mismatched or nonnumeric metric data as a valid timing', () => {
  const body = renderComment(run, {
    'performance-summary-android-react-profile': {
      schemaVersion: 1,
      platform: 'android',
      mode: 'native-release',
      valid: true,
    },
    'performance-summary-android-native-release': {
      schemaVersion: 1,
      platform: 'android',
      mode: 'native-release',
      valid: true,
      metrics: {
        'bad.requestToSessionActiveMs': { count: 1, median: 'fast', p95: null },
      },
    },
  });
  assert.match(body, /mismatched report/);
  assert.match(body, /No compatible baseline/);
  assert.equal(body.includes('| fast |'), false);
});

test('keeps the headline table small and profiling collapsed', () => {
  const reports: Record<string, InputRecord> = {};
  for (const mode of ['native-release', 'react-profile'])
    reports[`performance-summary-android-${mode}`] = {
      schemaVersion: 1,
      platform: 'android',
      mode,
      valid: true,
      metrics: { 'live.react.renderWorkPerRunMs': { count: 3, median: 12 } },
    };
  const body = renderComment(run, reports);
  assert.match(body, /<details><summary>React profiling/);
  assert.equal(
    body.split('\n').filter((line) => /^\| (ordinary|live)/.test(line)).length,
    10
  );
  assert.doesNotMatch(body, /P95|requestToProbeHandlerMs/);
  const visible = body.replace(/<details>[\s\S]*?<\/details>/g, '');
  assert.doesNotMatch(visible, /\| Metric/);
  assert.ok(visible.length < 650);
  assert.equal((body.match(/<details>/g) ?? []).length, 2);
  assert.equal((body.match(/<\/details>/g) ?? []).length, 2);
});

test('malformed, unavailable, or mismatched artifacts fail only their own lane', async () => {
  for (const load of [
    async () => JSON.parse('{truncated'),
    async () => {
      throw new Error(
        'Artifact must contain exactly one recognized summary.json'
      );
    },
    async () => {
      throw new Error('GitHub API returned 404 for artifact download');
    },
    async () => ({
      schemaVersion: 1,
      platform: 'ios',
      mode: 'native-release',
      valid: true,
    }),
  ]) {
    const failed = await readArtifactSummary(
      'performance-summary-android-native-release',
      load
    );
    assert.equal(failed.platform, 'android');
    assert.equal(failed.mode, 'native-release');
    assert.equal(failed.valid, false);
    assert.equal(failed.errors.length, 1);
    const successful = await readArtifactSummary(
      'performance-summary-android-react-profile',
      async () => ({
        schemaVersion: 1,
        platform: 'android',
        mode: 'react-profile',
        valid: true,
        metrics: {
          'live.react.renderWorkPerRunMs': {
            count: 10,
            median: 42,
            p95: null,
          },
        },
      })
    );
    const body = renderComment(
      { ...run, conclusion: 'failure' },
      {
        'performance-summary-android-native-release': failed,
        'performance-summary-android-react-profile': successful,
      }
    );
    assert.match(body, /Run: \*\*failure\*\*/);
    assert.match(body, /Collection failed/);
    assert.match(body, /live · React render work \(ms\/run\) \| — \| 42/);
  }
});

test('artifact failures remain bounded and escaped without accepting unknown lanes', async () => {
  const summary = await readArtifactSummary(
    'performance-summary-android-react-profile',
    async () => {
      throw new Error('@everyone <script> | '.repeat(1000));
    }
  );
  assert.ok(summary.errors[0].length < 550);
  const body = renderComment(run, {
    'performance-summary-android-react-profile': summary,
  });
  assert.equal(body.includes('@everyone'), false);
  assert.equal(body.includes('<script>'), false);
  await assert.rejects(
    readArtifactSummary('untrusted-file', async () => ({})),
    /Unexpected/
  );
});

test('reports missing Android artifacts without expecting iOS collection', () => {
  const body = renderComment(run, {});
  assert.equal(body.match(/No validated summary/g)?.length, 2);
  assert.doesNotMatch(body, /### ios-/);
});
