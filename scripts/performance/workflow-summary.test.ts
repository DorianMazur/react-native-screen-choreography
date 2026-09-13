import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineTarget } from './workflow-summary.mts';
import { markdown } from './report.mts';
import type { InputRecord } from './types.ts';

test('workflow baseline uses PR base or previous push tip, never an arbitrary latest run', () => {
  const base = { sha: 'a'.repeat(40), ref: 'main' };
  assert.deepEqual(baselineTarget({ pull_request: { base } }), { base });
  assert.deepEqual(
    baselineTarget({ before: base.sha, ref: 'refs/heads/main' }),
    { base }
  );
  assert.equal(
    baselineTarget({ before: '0'.repeat(40), ref: 'refs/heads/main' }),
    undefined
  );
  assert.equal(baselineTarget({}), undefined);
});

test('standalone markdown renders compatible baseline and deltas alongside diagnostics', () => {
  const base: InputRecord = {
    schemaVersion: 1,
    fixtureVersion: 5,
    measurementDefinitionVersion: 4,
    platform: 'android',
    mode: 'native-release',
    valid: true,
    errors: [],
    metadata: {
      deviceModel: 'pixel',
      osVersion: '15',
      apiLevel: 35,
      emulator: true,
      abi: 'x86_64',
      timingCycles: 20,
      reactNativeVersion: '0.83',
      reanimatedVersion: '4',
      nodeVersion: '24',
    },
    metrics: {
      'gallery.forward.requestToSessionActiveMs': { count: 20, median: 100 },
      'gallery.backward.requestToSessionActiveMs': { count: 20, median: 50 },
    },
  };
  const current = structuredClone(base);
  current.metrics['gallery.backward.requestToSessionActiveMs'].median = 40;
  const body = markdown(
    current as Parameters<typeof markdown>[0],
    base,
    'Base: test'
  );
  assert.match(body, /Base: test/);
  assert.match(body, /50 \| 40 \| -10 ms/);
  assert.doesNotMatch(body, /frames over deadline|React render/);
  base.fixtureVersion = 4;
  assert.match(
    markdown(
      current as Parameters<typeof markdown>[0],
      base,
      'Incompatible baseline'
    ),
    /— \| 40 \| —/
  );
});
