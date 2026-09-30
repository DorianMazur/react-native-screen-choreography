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
    'gallery.forward.requestToSessionActiveMs': { count: 20, median: 30 },
    'gallery.backward.requestToSessionActiveMs': { count: 20, median: 15 },
    'gallery.forward.tapToMotion': { count: 20, median: 40 },
    'gallery.backward.tapToMotion': { count: 20, median: 25 },
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

test('comment includes preparation and motion but omits detailed startup timings', () => {
  const body = renderComment(run, { [artifact]: report });
  assert.ok(body.includes(COMMENT_MARKER));
  assert.match(body, /Android release: \*\*passed\*\*/);
  assert.match(body, /No compatible baseline/);
  assert.match(body, /open preparation \(ms\) \| — \| 30 \| —/);
  assert.match(body, /return preparation \(ms\) \| — \| 15 \| —/);
  assert.match(body, /tap to motion \(ms\) \| — \| 40 \| —/);
  assert.match(body, /back tap to motion \(ms\) \| — \| 25 \| —/);
  assert.doesNotMatch(
    body,
    /startup diagnostics|overlay-readyMs|React profil|frames over deadline/
  );
  assert.equal(
    body.split('\n').filter((line) => /^\| Gallery/.test(line)).length,
    8
  );
});

test('PR comments include rerenders but only link to temporary current-run artifacts', () => {
  const measured = structuredClone(report) as InputRecord;
  measured.metrics['gallery.forward.renders.hero.update'] = {
    count: 20,
    median: 2,
  };
  const body = renderComment(
    { ...run, repository: { full_name: 'owner/repo' } },
    { [artifact]: measured }
  );
  assert.match(body, /forward · hero · rerenders \| 20 \| — \| 2 \| —/);
  assert.match(body, /actions\/runs\/42/);
  assert.doesNotMatch(body, /Permanent report|performance-history\/runs\/42/);
});

test('all examples get separate comparison rows even when main only has Gallery', () => {
  const measured = structuredClone(report) as InputRecord;
  Object.assign(measured, {
    fixtureVersion: 5,
    measurementDefinitionVersion: 4,
    metadata: {
      deviceModel: 'pixel',
      osVersion: '15',
      apiLevel: 35,
      emulator: true,
      abi: 'arm64-v8a',
      timingCycles: 20,
      reactNativeVersion: '0.83',
      reanimatedVersion: '4',
      nodeVersion: '24',
    },
  });
  const base = structuredClone(measured);
  for (const scenario of ['trips', 'wallet']) {
    for (const direction of ['forward', 'backward']) {
      measured.metrics[`${scenario}.${direction}.tapToMotion`] = {
        count: 20,
        median: 30,
      };
      measured.metrics[`${scenario}.${direction}.renders.hero.update`] = {
        count: 20,
        median: 2,
      };
    }
  }
  const body = renderComment(
    run,
    { [artifact]: measured },
    {
      run: {
        ...run,
        repository: { full_name: 'owner/repo' },
        head_branch: 'main',
      },
      reports: { [artifact]: base },
    }
  );
  assert.match(body, /Gallery · tap to motion \(ms\) \| 40 \| 40 \| 0 ms/);
  for (const label of ['Trips', 'Wallet']) {
    assert.match(
      body,
      new RegExp(`${label} · tap to motion \\(ms\\) \\| — \\| 30 \\| —`)
    );
    assert.match(body, new RegExp(`${label} · backward · hero · rerenders`));
  }
  assert.match(body, /Optional committed-render diagnostics/);
  assert.match(body, /not a smoothness score or regression threshold/);
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

test('iOS is validated, rendered and compared independently of Android', async () => {
  const iosArtifact = 'performance-summary-ios-native-release';
  const ios = { ...structuredClone(report), platform: 'ios' };
  assert.deepEqual(
    await readArtifactSummary(iosArtifact, async () => ios),
    ios
  );
  assert.equal(
    (await readArtifactSummary(iosArtifact, async () => report)).valid,
    false
  );
  const body = renderComment(run, { [iosArtifact]: ios });
  assert.match(
    body,
    /Android release: \*\*missing\*\* · iOS release: \*\*passed\*\*/
  );
  assert.match(body, /iOS release measurements/);
  assert.match(body, /open preparation \(ms\) \| — \| 30 \| —/);
  assert.match(body, /return preparation \(ms\) \| — \| 15 \| —/);
  assert.match(body, /tap to motion \(ms\) \| — \| 40 \| —/);
});
