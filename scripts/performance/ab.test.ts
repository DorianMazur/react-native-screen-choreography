import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combine } from './ab.mts';
import { renderComment } from './post-comment.mts';
import { distribution } from './report.mts';
import { sameRunnerBase, summaryTable } from './summary-table.mts';
import type { InputRecord } from './types.ts';

const forward = 'gallery.forward.tapToMotion';
const backward = 'gallery.backward.tapToMotion';
const info = {
  platform: 'android',
  mode: 'native-release',
  rounds: 2,
  baseRevision: '0123456789abcdef0123456789abcdef01234567',
};

function round(
  forwardSamples: number[],
  backwardSamples: number[]
): InputRecord {
  const samples = { [forward]: forwardSamples, [backward]: backwardSamples };
  return {
    schemaVersion: 1,
    measurementDefinitionVersion: 5,
    fixtureVersion: 6,
    platform: 'android',
    mode: 'native-release',
    valid: true,
    errors: [],
    sources: ['fixture.json'],
    metadata: {
      emulatorVersion: '37.2.12.0',
      systemImage: 'android-35-revision-1',
      deviceModel: 'Pixel',
      osVersion: '15',
      apiLevel: 35,
      emulator: true,
      abi: 'x86_64',
      screenTimingCycles: 2,
      trayTimingCycles: 1,
      reactNativeVersion: '0.83.0',
      reanimatedVersion: '4.3',
      nodeVersion: 'v24.13.0',
      runnerExitCode: 0,
    },
    samples,
    preparationDiagnostics: {
      'gallery.forward': { tracedJourneys: 2, overlayTimeoutJourneys: 0 },
    },
    metrics: Object.fromEntries(
      Object.entries(samples).map(([key, values]) => [
        key,
        distribution(values),
      ])
    ),
  };
}

const base = () => [round([40, 44], [20, 20]), round([42, 46], [20, 20])];
const head = () => [round([30, 34], [24, 24]), round([32, 36], [18, 18])];

test('pools each side and shows how many rounds agree with the pooled change', () => {
  const summary = combine(head(), base(), info);
  assert.equal(summary.valid, true);
  assert.deepEqual(summary.samples[forward], [30, 34, 32, 36]);
  assert.equal(summary.metrics[forward].count, 4);
  assert.equal(summary.metadata.screenTimingCycles, 4);
  assert.equal(summary.metadata.trayTimingCycles, 2);
  assert.equal(
    summary.preparationDiagnostics['gallery.forward'].tracedJourneys,
    4
  );
  assert.equal(summary.sameRunner.base.samples, undefined);

  const comparison = sameRunnerBase(summary)!;
  assert.match(comparison.note, /\(0123456\) .* 2 alternating rounds/);
  const table = summaryTable(summary, comparison.base);
  assert.match(table, /Change \| Rounds agreeing \|/);
  assert.match(table, /tap to motion \(ms\) \| 43 \| 33 \| -10 ms \| 2\/2 \|/);
  // Slower in one round and faster in the other: the pooled change is noise.
  assert.match(
    table,
    /back tap to motion \(ms\) \| 20 \| 21 \| \+1 ms \| 1\/2 \|/
  );
  // Round medians describe only the base they were measured against.
  assert.doesNotMatch(
    summaryTable(summary, structuredClone(comparison.base)),
    /Rounds agreeing/
  );
});

test('PR comments compare against the same-runner base and never render its raw fields', () => {
  const summary = combine(head(), base(), {
    ...info,
    baseRevision: '<img src=x>',
  });
  const body = renderComment(
    { id: 1, conclusion: 'success', head_sha: 'abc', html_url: 'https://x' },
    { 'performance-summary-android-native-release': summary }
  );
  assert.match(body, /Base library sources \(unknown revision\) measured/);
  assert.match(body, /\| 43 \| 33 \| -10 ms \| 2\/2 \|/);
  assert.doesNotMatch(body, /<img/);
});

test('an unmeasurable base leaves the current report intact without a comparison', () => {
  const failedBase = base();
  failedBase[1]!.valid = false;
  const summary = combine(head(), failedBase, info);
  assert.equal(summary.valid, true);
  assert.match(summary.sameRunner.unavailable, /base sources/);
  assert.equal(sameRunnerBase(summary), undefined);
  assert.equal(
    sameRunnerBase(combine(head(), base().slice(1), info)),
    undefined
  );
});

test('a missing current round fails collection', () => {
  const summary = combine(head().slice(1), base(), info);
  assert.equal(summary.valid, false);
  assert.match(summary.errors.at(-1), /Only 1 of 2 A\/B rounds/);
  assert.equal(sameRunnerBase(summary), undefined);
  assert.equal(combine([], base(), info).valid, false);
});
