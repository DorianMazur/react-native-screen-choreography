import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown } from './report.mts';
import type { InputRecord } from './types.ts';

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
      runnerImage: 'ubuntu-1',
      hostCpu: 'test-cpu',
      emulatorVersion: '37.2.12.0',
      graphicsRenderer: 'SwiftShader',
      systemImage: 'android-35-revision-1',
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
      'gallery.forward.requestToSessionActiveMs': { count: 20, median: 80 },
      'gallery.backward.requestToSessionActiveMs': { count: 20, median: 35 },
      'gallery.forward.tapToMotion': { count: 20, median: 100 },
      'gallery.backward.tapToMotion': { count: 20, median: 50 },
      'gallery.backward.preparation.coordinatorMs': {
        count: 20,
        median: 35,
        p95: 70,
      },
      'gallery.backward.preparation.overlay-readyMs': {
        count: 20,
        median: 100,
        p95: 140,
      },
    },
  };
  const current = structuredClone(base);
  current.metrics['gallery.forward.requestToSessionActiveMs'].median = 60;
  current.metrics['gallery.backward.requestToSessionActiveMs'].median = 30;
  current.metrics['gallery.backward.tapToMotion'].median = 40;
  current.metrics['gallery.backward.preparation.coordinatorMs'].median = 30;
  current.metrics['gallery.backward.preparation.overlay-readyMs'].median = 108;
  const body = markdown(
    current as Parameters<typeof markdown>[0],
    base,
    'Base: test'
  );
  assert.match(body, /Base: test/);
  assert.match(body, /open preparation \(ms\) \| 80 \| 60 \| -20 ms/);
  assert.match(body, /return preparation \(ms\) \| 35 \| 30 \| -5 ms/);
  assert.match(body, /50 \| 40 \| -10 ms/);
  assert.doesNotMatch(
    body,
    /coordinatorMs|overlay-readyMs|Optional startup diagnostics/
  );
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
