import assert from 'node:assert/strict';
import test from 'node:test';
import { trayFixture } from './tray-fixture.mts';
import { validateTrayLifecycle } from './validate-tray-lifecycle.mts';
import { validateLifecycle } from './validate-lifecycle.mts';
import { summarize } from './report.mts';
import type { InputRecord } from './types.ts';

for (const scenario of ['tray-wallet', 'tray-gallery'] as const) {
  test(`${scenario}: retains all 20 cycles with motion, native presentation and input for every step`, () => {
    const report = trayFixture(scenario, 20);
    assert.equal(report.valid, true, report.errors.join());
    validateLifecycle(report);
    const metrics = validateTrayLifecycle(report);
    assert.equal(report.journeys.length, 40);
    assert.equal(report.payloadMounts, 20);
    assert.equal(report.payloadUnmounts, 20);
    for (const samples of Object.values(metrics))
      assert.equal(samples.length, 20);
    const summary = summarize([{ file: `${scenario}.json`, data: report }], {
      platform: 'android',
      mode: 'native-release',
      metadata: { lifecycleValidation: 2, timingCycles: 20 },
    });
    assert.deepEqual(
      summary.errors.filter((error) => !error.startsWith('Missing valid ')),
      []
    );
    assert.equal(summary.metrics[`${scenario}.forward.tapToMotion`]?.count, 20);
    assert.equal(
      summary.metrics[`${scenario}.step-1.requestToSettledMs`]?.count,
      20
    );
  });
}

test('an incomplete lifecycle report preserves the fixture rejection reason', () => {
  const data = trayFixture('tray-wallet');
  data.samples = data.samples.filter(
    (sample: InputRecord) => sample.kind !== 'session-active'
  );
  data.valid = false;
  data.errors = ['tray-shared-probe-rejected'];
  const summary = summarize([{ file: 'failed-tray.json', data }], {
    platform: 'android',
    mode: 'native-release',
    metadata: { lifecycleValidation: 2, timingCycles: 1 },
  });
  assert.ok(
    summary.errors.some(
      (error) =>
        error.includes('Missing or duplicate lifecycle events') &&
        error.includes('tray-shared-probe-rejected')
    )
  );
  assert.deepEqual(summary.metrics, {});
});

const corruptions: Record<string, (data: InputRecord) => void> = {
  'missing breadcrumbs': (data) => {
    data.samples = [];
  },
  'missing native open': (data) => {
    data.samples.find(
      (event: InputRecord) =>
        event.kind === 'tray-dispatch' && event.action.type === 'settled'
    ).action.index = 0;
  },
  'stale transition callback': (data) => {
    data.samples.find(
      (event: InputRecord) =>
        event.kind === 'tray-dispatch' && event.action.type === 'transitionEnd'
    ).action.id--;
  },
  'source capture mismatch': (data) => {
    data.samples.find(
      (event: InputRecord) =>
        event.kind === 'tray-dispatch' && event.action.type === 'prepared'
    ).action.id--;
  },
  'wrong destination': (data) => {
    data.trayTracing.steps[1].route = 'review';
  },
  'wrong retained stack': (data) => {
    // Keep every raw snapshot consistent, so history continuity alone passes.
    const rename = (value: any): void => {
      if (!value || typeof value !== 'object') return;
      if (value.name === 'actions') value.name = 'unexpected-root';
      Object.values(value).forEach(rename);
    };
    rename(data.samples);
  },
  'early probe': (data) => {
    data.trayTracing.steps[1].probeMs = data.trayTracing.steps[1].requestMs;
  },
  'missing motion': (data) => {
    data.trayTracing.steps[1].motion = null;
  },
  'UI completion after stack release': (data) => {
    data.trayTracing.steps[1].motion.motionEndMs =
      data.trayTracing.steps[1].settledMs + 1;
  },
  'missing shared handoff': (data) => {
    data.journeys[0].motion.handoffMs = data.trayTracing.steps[3].settledMs + 1;
  },
  'content remount': (data) => {
    data.samples.find(
      (event: InputRecord) => event.kind === 'tray-content-unmounted'
    ).kind = 'tray-content-mounted';
  },
  'missing release': (data) => {
    data.samples.findLast(
      (event: InputRecord) => event.kind === 'tray-content-unmounted'
    ).kind = 'unexpected';
  },
  'wrong sheet session': (data) => {
    data.trayTracing.steps[0].session++;
  },
  'missing final cycle': (data) => {
    data.trayTracing.steps.pop();
  },
  'wrong native probe': (data) => {
    data.native.inputAcknowledgements[0].probe = 'list';
  },
  'native touch absent': (data) => {
    data.native.touches.pop();
  },
};
for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`tray validation rejects ${name} even when the producer claims success`, () => {
    const data = trayFixture('tray-wallet');
    corrupt(data);
    data.valid = true;
    data.errors = [];
    const summary = summarize([{ file: 'wallet-tray.json', data }], {
      platform: 'android',
      mode: 'native-release',
      metadata: { lifecycleValidation: 2, timingCycles: 1 },
    });
    assert.ok(
      summary.errors.some((error) => error.startsWith('wallet-tray.json:')),
      summary.errors.join()
    );
    assert.equal(Object.keys(summary.metrics).length, 0);
  });
}
