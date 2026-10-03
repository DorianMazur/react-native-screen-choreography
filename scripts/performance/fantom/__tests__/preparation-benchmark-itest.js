/** @fantom_mode opt */
import '@react-native/fantom/src/setUpDefaultReactNativeEnvironment';
import * as Fantom from '@react-native/fantom';
import { ElementRegistry } from '../../../../src/core/ElementRegistry';
import {
  captureFabricLayout,
  prepareFabricLayout,
} from '../../../../src/core/fabricLayout';
import { createFixture, expectedFrames } from '../fixture';

// One suite per file: upstream Fantom returns one benchmark result per process.
const suite = Fantom.unstable_benchmark.suite('Transition preparation', {
  minIterations: 200,
  minTestExecutionTimeMs: 250,
  minWarmupIterations: 50,
  minWarmupDurationMs: 100,
});

for (const [count, unrelatedCount] of [
  [10, 0],
  [100, 0],
  [10, 1000],
]) {
  let fixture;
  const options = {
    beforeAll() {
      fixture = createFixture(count, unrelatedCount);
      expect(fixture.capture()).toEqual(expectedFrames(count));
    },
    afterAll() {
      fixture.destroy();
    },
  };
  const label = `${count} endpoints, ${unrelatedCount} unrelated views`;
  suite.test(
    `Capture: ${label}`,
    () => {
      if (fixture.capture()?.length !== count) {
        throw new Error('Capture returned an invalid batch');
      }
    },
    options
  );
  suite.test(
    `Request, consume, validate: ${label}`,
    () => {
      const read = fixture.request();
      if (
        typeof read !== 'function' ||
        read()?.length !== count ||
        !read(true)
      ) {
        throw new Error('Request returned an invalid batch or identity');
      }
    },
    options
  );
  let snapshot;
  const cancellers = new Set();
  const preparation = {
    ...options,
    afterEach() {
      expect(snapshot.metrics.size).toBe(count);
      expect(snapshot.isCurrent()).toBe(true);
      expect(cancellers.size).toBe(0);
      snapshot = null;
    },
  };
  suite.test(
    `Source layout snapshot (JS + C++): ${label}`,
    () => {
      snapshot = captureFabricLayout(fixture.entries);
    },
    preparation
  );
  suite.test(
    `Prepare mounted layout (JS + C++): ${label}`,
    () => {
      snapshot = prepareFabricLayout({
        entries: fixture.entries,
        isCurrent: () => true,
        cancellers,
      });
    },
    {
      ...preparation,
      afterEach() {
        expect(snapshot.validateNative()).toBe(true);
        preparation.afterEach();
      },
    }
  );
  if (unrelatedCount === 0) {
    let offset = 0;
    suite.test(
      `Mount and refresh pending capture: ${label}`,
      () => {
        const read = fixture.request();
        offset = offset === 0 ? 1 : 0;
        fixture.render(offset);
        const frames = read();
        if (frames?.length !== count || frames[0].pageX !== 24 + offset) {
          throw new Error('Mount did not refresh the pending capture');
        }
      },
      options
    );
    suite.test(
      `Prepare pending layout including React/Fabric mount: ${label}`,
      () => {
        const pending = prepareFabricLayout({
          entries: fixture.entries,
          isCurrent: () => true,
          cancellers,
        });
        // Zero-width endpoints are mounted but not ready for preparation.
        // Completion must come from the actual C++ mount subscription.
        pending.then((result) => {
          snapshot = result;
        });
        fixture.render();
      },
      {
        ...preparation,
        beforeEach() {
          fixture.render(0, count, 0);
        },
      }
    );
  }
}

for (const unrelatedScreens of [0, 100]) {
  let registry;
  const options = {
    beforeAll() {
      registry = new ElementRegistry();
      for (let screen = 0; screen < unrelatedScreens + 2; screen++) {
        for (let i = 0; i < 10; i++) {
          registry.register({
            id: `element-${i}`,
            groupId: 'cards',
            screenId: `screen-${screen}`,
            ref: { current: null },
            metrics: null,
          });
        }
      }
      expect(registry.size).toBe((unrelatedScreens + 2) * 10);
    },
    afterAll() {
      registry.clear();
    },
  };
  suite.test(
    `Discover source group: ${unrelatedScreens} unrelated screens`,
    () => {
      if (registry.getGroupElementIds('cards', 'screen-0').length !== 10) {
        throw new Error('Unrelated screens contaminated group discovery');
      }
    },
    options
  );
  suite.test(
    `Resolve 10 target endpoints: ${unrelatedScreens} unrelated screens`,
    () => {
      for (let i = 0; i < 10; i++) {
        if (!registry.getByIdAndScreen(`element-${i}`, 'screen-1', 'cards')) {
          throw new Error('Target endpoint missing');
        }
      }
    },
    options
  );
}

// Fantom otherwise runs only one iteration on CI. Validate measurement integrity,
// without introducing arbitrary time thresholds before a baseline exists.
suite.verify((results) => {
  expect(results).toHaveLength(20);
  for (const result of results) {
    expect(result.latency.samples.length).toBeGreaterThanOrEqual(200);
    expect(Number.isFinite(result.latency.mean)).toBe(true);
    expect(result.latency.mean).toBeGreaterThan(0);
  }
});
