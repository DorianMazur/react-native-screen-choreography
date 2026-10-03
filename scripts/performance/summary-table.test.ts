import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compatible, summaryTable } from './summary-table.mts';
import type { InputRecord } from './types.ts';
import { selectBaselineRun } from './post-comment.mts';
import { metricDefinition } from './metric-definitions.mts';

function report() {
  return {
    schemaVersion: 1,
    measurementDefinitionVersion: 4,
    fixtureVersion: 5,
    valid: true,
    platform: 'android',
    mode: 'native-release',
    metadata: {
      emulatorVersion: '37.2.12.0',
      systemImage: 'android-35-revision-1',
      deviceModel: 'Pixel',
      osVersion: '15',
      apiLevel: 35,
      emulator: true,
      abi: 'x86_64',
      timingCycles: 3,
      reactNativeVersion: '0.83.0',
      reanimatedVersion: '4.2',
      nodeVersion: 'v24.13.0',
    },
    metrics: {
      'gallery.backward.tapToMotion': {
        count: 3,
        median: 0,
      },
      'gallery.forward.tapToMotion': { count: 1, median: 40 },
    },
  };
}

test('shows absolute deltas including zero baselines, negative timing changes', () => {
  const base = report();
  const current = report();
  current.metrics['gallery.backward.tapToMotion'].median = 5;
  current.metrics['gallery.forward.tapToMotion'].median = 30;
  assert.equal(compatible(current, base), true);
  const table = summaryTable(current, base);
  assert.match(table, /0 \| 5 \| \+5 ms/);
  assert.match(table, /40 \| 30 \| -10 ms/);
  assert.doesNotMatch(table, /Infinity|NaN/);
});

test('optional percentage filter uses absolute unrounded changes and includes the 1% boundary', () => {
  const key = 'gallery.forward.tapToMotion';
  for (const [previous, next, visible] of [
    [40, 40, false],
    [40, 40.39996, false],
    [40, 39.60004, false],
    [40, 40.4, true],
    [40, 39.6, true],
    [40, 41, true],
    [40, 39, true],
    [0, 0, false],
    [0, 0.1, true],
    [40, 0, true],
  ] as const) {
    const base = report();
    const current = report();
    base.metrics[key].median = previous;
    current.metrics[key].median = next;
    const filtered = summaryTable(current, base, false, 1);
    assert.equal(
      filtered.includes('| Gallery · tap to motion (ms) |'),
      visible,
      `${previous} -> ${next}`
    );
    assert.doesNotMatch(filtered, /Infinity|NaN/);
    // Full reports keep every measurement, even when the MR note filters it.
    assert.match(summaryTable(current, base), /Gallery · tap to motion/);
  }
});

test('filter retains measurements with missing or incompatible baselines', () => {
  const current = report();
  for (const base of [
    undefined,
    { ...report(), metrics: {} },
    { ...report(), valid: false },
  ]) {
    assert.match(
      summaryTable(current, base, false, 1),
      /Gallery · tap to motion \(ms\) \| — \| 40 \| —/
    );
  }
  assert.equal(
    summaryTable(current, report(), false, 1),
    'No measurements to show at the 1% change threshold.'
  );
});

test('requires explicit matching environment and definition metadata', () => {
  for (const field of Object.keys(report().metadata)) {
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

test('compares across changed or missing runner images, CPUs, and renderers', () => {
  for (const field of ['runnerImage', 'hostCpu', 'graphicsRenderer']) {
    const base: InputRecord = report();
    const current: InputRecord = report();
    current.metrics['gallery.forward.tapToMotion'].median = 30;
    current.metadata[field] = 'current';
    assert.equal(compatible(current, base), true, field);
    assert.match(summaryTable(current, base), /40 \| 30 \| -10 ms/);
    base.metadata[field] = 'different';
    assert.equal(compatible(current, base), true, field);
    assert.match(summaryTable(current, base), /40 \| 30 \| -10 ms/);
    delete current.metadata[field];
    assert.equal(compatible(current, base), true, field);
    assert.match(summaryTable(current, base), /40 \| 30 \| -10 ms/);
  }
});

test('omits deltas for changed emulator versions or system images', () => {
  for (const field of ['emulatorVersion', 'systemImage']) {
    const current: InputRecord = report();
    current.metadata[field] = 'different';
    assert.equal(compatible(current, report()), false, field);
    assert.match(summaryTable(current, report()), /— \| 40 \| —/);
  }
});

test('does not display nonnumeric metrics or compare invalid collections', () => {
  const current = report();
  current.metrics['gallery.forward.tapToMotion'].median = NaN;
  assert.doesNotMatch(summaryTable(current), /NaN/);
  assert.equal(compatible(current, { ...report(), valid: false }), false);
});

test('selects the latest successful main push or manual run, never a PR or other branch', () => {
  const good = {
    id: 10,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'base',
    head_branch: 'main',
    repository: { full_name: 'owner/repo' },
  };
  for (const changed of [
    { event: 'pull_request' },
    { head_branch: 'other' },
    { conclusion: 'failure' },
    { repository: { full_name: 'fork/repo' } },
  ]) {
    assert.equal(
      selectBaselineRun([{ ...good, ...changed, id: 20 }, good], 'owner/repo'),
      good
    );
  }
  assert.equal(selectBaselineRun([], 'owner/repo'), undefined);
  const latest = { ...good, head_sha: 'newer', id: 30 };
  assert.equal(selectBaselineRun([good, latest], 'owner/repo'), latest);
  assert.equal(selectBaselineRun([good, latest], 'owner/repo', 30), good);
  const manual = { ...latest, event: 'workflow_dispatch' };
  assert.equal(selectBaselineRun([good, manual], 'owner/repo'), manual);
});

test('explicit definitions survive implementation changes and compare each metric independently', () => {
  const base: InputRecord = report();
  base.metricDefinitions = Object.fromEntries(
    Object.keys(base.metrics).map((key) => [
      key,
      metricDefinition(key, 'tracing-v2'),
    ])
  );
  const current = structuredClone(base);
  current.fixtureVersion = 99;
  current.measurementDefinitionVersion = 100;
  current.metadata.reactNativeVersion = 'next';
  current.metadata.nodeVersion = 'next';
  current.metadata.reanimatedVersion = 'next';
  assert.equal(compatible(current, base), true);
  assert.match(summaryTable(current, base), /40 \| 40 \| 0 ms/);
  current.metricDefinitions['gallery.forward.tapToMotion'].version++;
  assert.match(summaryTable(current, base), /— \| 40 \| —/);
  assert.match(summaryTable(current, base), /0 \| 0 \| 0 ms/);
  current.metadata.deviceModel = 'other';
  assert.equal(compatible(current, base), false);
});

test('unknown, changed, or missing measurement semantics never get a numeric comparison', () => {
  const base: InputRecord = report();
  base.metricDefinitions = Object.fromEntries(
    Object.keys(base.metrics).map((key) => [
      key,
      metricDefinition(key, 'tracing-v2'),
    ])
  );
  for (const field of [
    'version',
    'unit',
    'clock',
    'start',
    'end',
    'workload',
    'aggregation',
    'instrumentation',
  ]) {
    const current = structuredClone(base);
    for (const definition of Object.values(
      current.metricDefinitions
    ) as InputRecord[])
      definition[field] = 'changed';
    assert.equal(compatible(current, base), false, field);
  }
  assert.equal(compatible(base, report()), false);
});

test('does not compare rows collected with different sample counts', () => {
  const base = report();
  base.metrics['gallery.forward.tapToMotion'].count = 2;
  assert.match(
    summaryTable(report(), base),
    /tap to motion \(ms\) \| — \| 40 \| —/
  );
});

test('iOS toolchains and platforms must match for comparisons', () => {
  const current = {
    ...report(),
    platform: 'ios',
    metadata: {
      ...report().metadata,
      xcodeVersion: 'Xcode 26.2',
      apiLevel: 'not-applicable',
    },
  };
  const base = structuredClone(current);
  assert.equal(compatible(current, base), true);
  base.metadata.xcodeVersion = 'Xcode 26.1';
  assert.equal(compatible(current, base), false);
  assert.equal(compatible(current, report()), false);
});
