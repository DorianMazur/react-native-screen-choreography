/** @fantom_mode opt */
import '@react-native/fantom/src/setUpDefaultReactNativeEnvironment';
import * as Fantom from '@react-native/fantom';
import {
  createJourneyFixture,
  expectJourneySession,
  JOURNEYS,
} from '../journey-fixture';

const suite = Fantom.unstable_benchmark.suite('Example preparation journeys', {
  minIterations: 200,
  minTestExecutionTimeMs: 250,
  minWarmupIterations: 50,
  minWarmupDurationMs: 100,
});

for (const scenario of JOURNEYS) {
  for (const direction of ['open', 'return', 'round trip']) {
    let fixture;
    let sourceNode;
    let forward;
    let backward;
    suite.test(
      `${scenario.label} (${scenario.itemId}) · ${direction} JS/Fabric preparation`,
      () => {
        if (direction !== 'return') forward = fixture.open();
        if (direction !== 'open') backward = fixture.prepareBack();
        if (direction === 'round trip') {
          fixture.finish();
          fixture.dismiss();
        }
      },
      {
        beforeAll() {
          fixture = createJourneyFixture(scenario);
          sourceNode = fixture.sourceRef.current;
        },
        beforeEach() {
          if (direction === 'return') forward = fixture.open();
        },
        afterEach() {
          expectJourneySession(fixture, forward, 'forward');
          if (direction !== 'open') {
            expectJourneySession(fixture, backward, 'backward');
          }
          if (direction !== 'round trip') {
            const active = fixture.coordinator.getActiveSession();
            expect(active.presentation.validate()).toBe(true);
            expect(active.presentation.valid.value).toBe(true);
            expect(active.presentation.phase.value).toBe(2);
            fixture.finish();
            fixture.dismiss();
          }
          expect(forward.session.presentation.valid.value).toBe(false);
          if (backward)
            expect(backward.session.presentation.valid.value).toBe(false);
          expect(fixture.sourceRef.current).toBe(sourceNode);
          expect(fixture.targetRef.current).toBe(null);
          expect(fixture.registry.size).toBe(fixture.listSize);
          expect(fixture.coordinator.getActiveSession()).toBe(null);
          expect(fixture.navigation.isNavigationLocked()).toBe(false);
          expect(fixture.pendingTarget()).toBe(null);
        },
        afterAll() {
          fixture.destroy();
        },
      }
    );
  }
}

suite.verify((results) => {
  expect(results).toHaveLength(JOURNEYS.length * 3);
  for (const result of results) {
    expect(result.latency.samples.length).toBeGreaterThanOrEqual(200);
    expect(Number.isFinite(result.latency.mean)).toBe(true);
    expect(result.latency.mean).toBeGreaterThan(0);
  }
});
