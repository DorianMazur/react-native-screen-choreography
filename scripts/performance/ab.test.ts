import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeInterval, combine } from './ab.mts';
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

test('pools each side and reports whether a change stands out from the noise', () => {
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
  assert.match(table, /Change \| 99% range \|/);
  // Every current sample is faster than every base sample.
  assert.match(
    table,
    /tap to motion \(ms\) \| 43 \| 33 \| -10 ms \| -[\d.]+ to -[\d.]+ ms \|/
  );
  // Slower in one round and faster in the other: the range spans zero.
  assert.match(
    table,
    /back tap to motion \(ms\) \| 20 \| 21 \| \+1 ms \| -2 to \+4 ms \|/
  );
  // The filtered table lists only what stands out, and says what it left out.
  const filtered = summaryTable(summary, comparison.base, 1);
  assert.match(filtered, /Gallery · tap to motion/);
  assert.doesNotMatch(filtered, /back tap to motion/);
  assert.match(filtered, /Within run-to-run noise and not listed: 1\./);
  // Ranges describe only the base they were measured against.
  assert.doesNotMatch(
    summaryTable(summary, structuredClone(comparison.base)),
    /99% range/
  );
});

test('change ranges are reproducible and need samples on both sides', () => {
  const range = changeInterval([40, 42, 44, 46], [30, 32, 34, 36], forward);
  assert.deepEqual(
    range,
    changeInterval([40, 42, 44, 46], [30, 32, 34, 36], forward)
  );
  assert.ok(range![0] <= range![1] && range![1] < 0);
  assert.equal(changeInterval([40], [30, 32], forward), null);
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
  assert.match(body, /\| 43 \| 33 \| -10 ms \| -[\d.]+ to -[\d.]+ ms \|/);
  assert.doesNotMatch(body, /<img/);
});

test('a base round that failed is left out of both sides', () => {
  const partialBase = base();
  partialBase[1]!.valid = false;
  const summary = combine(head(), partialBase, {
    ...info,
    retried: ['base-2', '<img src=x>'],
  });
  assert.equal(summary.valid, true);
  assert.deepEqual(summary.samples[forward], [30, 34]);
  assert.equal(summary.metadata.screenTimingCycles, 2);
  const comparison = sameRunnerBase(summary)!;
  assert.match(comparison.note, /in 1 of 2 alternating rounds, the only ones/);
  assert.match(comparison.note, /Repeated after a failed run: base round 2\./);
  assert.match(
    summaryTable(summary, comparison.base),
    /tap to motion \(ms\) \| 42 \| 32 \| -10 ms \|/
  );
  // A round that left no base report is skipped the same way.
  assert.deepEqual(
    combine(head(), [undefined, base()[1]], info).samples[forward],
    [32, 36]
  );
});

test('a base that never passes leaves the current report intact without a comparison', () => {
  const failedBase = base().map((report) => ({ ...report, valid: false }));
  const summary = combine(head(), failedBase, info);
  assert.equal(summary.valid, true);
  assert.equal(summary.metrics[forward].count, 4);
  assert.match(summary.sameRunner.unavailable, /base sources/);
  assert.equal(sameRunnerBase(summary), undefined);
  assert.equal(sameRunnerBase(combine(head(), [], info)), undefined);
  // The comment says which of the two reasons applies.
  const comment = (report: InputRecord) =>
    renderComment(
      { id: 1, conclusion: 'success', head_sha: 'abc', html_url: 'https://x' },
      { 'performance-summary-android-native-release': report }
    );
  assert.match(comment(summary), /base sources did not pass collection/);
  assert.match(comment(head()[0]!), /library sources match the base/);
});

test('a missing current round fails collection', () => {
  const summary = combine([undefined, head()[1]], base(), info);
  assert.equal(summary.valid, false);
  assert.match(summary.errors.at(-1), /Only 1 of 2 A\/B rounds/);
  assert.equal(sameRunnerBase(summary), undefined);
  assert.equal(combine([], base(), info).valid, false);
});
