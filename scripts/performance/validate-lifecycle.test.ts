import assert from 'node:assert/strict';
import test from 'node:test';
import { BenchmarkCollector } from '../../examples/react-navigation/src/performance/collector.ts';
import { validateLifecycle } from './validate-lifecycle.mts';
import type { InputRecord } from './types.ts';

function fixture(): InputRecord {
  let now = 0;
  const collector = new BenchmarkCollector(
    'lifecycle-test',
    'wallet',
    () => ++now
  );
  for (const direction of ['forward', 'backward'] as const) {
    collector.request(direction);
    collector.sessionActive(direction, direction, 1);
    collector.sessionEnd(direction);
    collector.probe(direction === 'forward' ? 'detail' : 'list');
  }
  return {
    ...collector.report(),
    fixtureVersion: 6,
    preparationTracing: { requested: true },
    renderCounting: { version: 1 },
    motionTracing: { version: 2 },
    presentationTracing: {},
  };
}

test('lifecycle validation accepts the collector sequence and identifies broken journeys', () => {
  assert.doesNotThrow(() => validateLifecycle(fixture()));
  for (const corrupt of [
    (data: InputRecord) => {
      delete data.journeys[0].sessionEndJsMs;
    },
    (data: InputRecord) => {
      data.journeys[1].sessionId = data.journeys[0].sessionId;
    },
    (data: InputRecord) => {
      data.journeys[1].requestJsMs = 0;
    },
    (data: InputRecord) => {
      data.journeys[0].sessionActiveToEndMs = 1000;
    },
    (data: InputRecord) => {
      data.samples[1].pairCount = 0;
    },
    (data: InputRecord) => {
      data.samples[2].sessionId = 'stale';
    },
    (data: InputRecord) => {
      data.samples[3].screen = 'list';
    },
    (data: InputRecord) => {
      data.samples.reverse();
    },
  ]) {
    const data = fixture();
    corrupt(data);
    assert.throws(
      () => validateLifecycle(data),
      /wallet round trip 1 (forward|backward):/
    );
  }
});

test('missing or duplicate lifecycle evidence cannot silently disable validation', () => {
  for (const corrupt of [
    (data: InputRecord) => {
      delete data.samples;
    },
    (data: InputRecord) => {
      data.samples.pop();
    },
    (data: InputRecord) => {
      data.samples.push(data.samples[1]);
    },
    (data: InputRecord) => {
      delete data.presentationTracing;
    },
    (data: InputRecord) => {
      data.preparationTracing.requested = false;
    },
    (data: InputRecord) => {
      delete data.motionTracing;
    },
    (data: InputRecord) => {
      delete data.renderCounting;
    },
  ]) {
    const data = fixture();
    corrupt(data);
    assert.throws(() => validateLifecycle(data), /[Mm]issing|duplicate/);
  }
});
