/** @fantom_mode opt */
import '@react-native/fantom/src/setUpDefaultReactNativeEnvironment';
import {
  createJourneyFixture,
  expectJourneySession,
  JOURNEYS,
} from '../journey-fixture';

for (const scenario of JOURNEYS) {
  describe(`${scenario.label}: ${scenario.itemId} list/detail journey`, () => {
    let fixture;
    beforeEach(() => {
      fixture = createJourneyFixture(scenario);
    });
    afterEach(() => {
      fixture.destroy();
    });

    it('repeats 20 round trips without replacing the list endpoint or retaining detail registrations', () => {
      const sourceNode = fixture.sourceRef.current;
      let previousTarget = null;
      for (let cycle = 0; cycle < 20; cycle++) {
        const forward = fixture.open();
        expectJourneySession(fixture, forward, 'forward');
        expect(fixture.readiness.isReady(scenario.detailScreen)).toBe(true);
        expect(fixture.registry.size).toBe(fixture.listSize + 1);
        expect(fixture.targetRef.current === previousTarget).toBe(false);
        previousTarget = fixture.targetRef.current;
        expect(forward.session.presentation.validate()).toBe(true);
        expect(forward.session.presentation.phase.value).toBe(2);
        const backward = fixture.prepareBack();
        expectJourneySession(fixture, backward, 'backward');
        expect(backward.session.presentation.validate()).toBe(true);
        fixture.finish();
        fixture.dismiss();
        expect(fixture.sourceRef.current).toBe(sourceNode);
        expect(fixture.targetRef.current).toBe(null);
        expect(fixture.registry.size).toBe(fixture.listSize);
        expect(
          fixture.registry.getGroupElements(
            fixture.group,
            scenario.detailScreen
          )
        ).toHaveLength(0);
        expect(forward.session.presentation.valid.value).toBe(false);
        expect(backward.session.presentation.valid.value).toBe(false);
        expect(fixture.coordinator.getActiveSession()).toBe(null);
        expect(fixture.navigation.isNavigationLocked()).toBe(false);
        expect(fixture.pendingTarget()).toBe(null);
      }
    });

    it('keeps source geometry and presentation frozen while refreshing target geometry and preparing a fresh return', () => {
      const forward = fixture.open();
      expectJourneySession(fixture, forward, 'forward');
      const pair = forward.session.pairs[0];
      const original = { ...pair.sourceMetrics };
      fixture.relayout(384, 32);
      const updated = fixture.coordinator.getActiveSession().pairs[0];
      expect(updated.targetMetrics.width).toBe(384);
      expect(updated.sourceMetrics).toEqual(original);
      expect(updated.sourcePresentation.metadata.revision).toBe(0);
      expect(updated.targetPresentation.metadata.revision).toBe(0);
      const backward = fixture.prepareBack();
      expectJourneySession(fixture, backward, 'backward');
      expect(pair.sourceMetrics).toEqual(original);
      const returned = backward.session.pairs[0];
      expect(returned.targetMetrics.pageY).toBe(original.pageY + 32);
      expect(returned.targetMetrics.width < original.width).toBe(true);
      expect(returned.sourcePresentation.metadata.revision).toBe(1);
      expect(returned.targetPresentation.metadata.revision).toBe(1);
    });

    it('waits for detail geometry before completing preparation', () => {
      const forward = fixture.open({ pendingLayout: true });
      expect(forward.settled).toBe(false);
      expect(fixture.coordinator.getActiveSession().state).toBe('measuring');
      fixture.finishLayout();
      expectJourneySession(fixture, forward, 'forward');
      expect(forward.session.presentation.validate()).toBe(true);
    });

    it('handles Back during pending geometry and an immediate reopen without adopting stale endpoints', () => {
      const first = fixture.open({ pendingLayout: true });
      const oldTarget = fixture.targetRef.current;
      fixture.dismiss();
      expect(first.settled).toBe(true);
      expect(first.error).toBe(undefined);
      expect(first.session).toBe(null);
      const second = fixture.open();
      expect(fixture.targetRef.current === oldTarget).toBe(false);
      fixture.finishLayout();
      expect(first.session).toBe(null);
      expectJourneySession(fixture, second, 'forward');
      expect(second.session.presentation.validate()).toBe(true);
    });

    it('waits for screen readiness before starting the coordinator', () => {
      const forward = fixture.open({ pendingReadiness: true });
      expect(forward.settled).toBe(false);
      expect(fixture.coordinator.getActiveSession()).toBe(null);
      expect(fixture.pendingTarget()).toBe(scenario.detailScreen);
      expect(fixture.navigation.isNavigationLocked()).toBe(true);
      fixture.finishReadiness();
      expectJourneySession(fixture, forward, 'forward');
      expect(fixture.pendingTarget()).toBe(null);
    });

    it('waits for target registration after the destination screen mounts', () => {
      const forward = fixture.open({ pendingRegistration: true });
      expect(forward.settled).toBe(false);
      expect(fixture.readiness.isReady(scenario.detailScreen)).toBe(true);
      expect(fixture.targetRef.current).toBe(null);
      expect(fixture.coordinator.getActiveSession().state).toBe('measuring');
      fixture.finishRegistration();
      expectJourneySession(fixture, forward, 'forward');
    });

    it('requires attachment for the current session before completing preparation', () => {
      const forward = fixture.open({ pendingAttachment: true });
      expect(forward.settled).toBe(false);
      expect(fixture.coordinator.getActiveSession().state).toBe('preparing');
      fixture.acknowledgeAttachment('stale-session');
      expect(forward.settled).toBe(false);
      fixture.acknowledgeAttachment();
      expectJourneySession(fixture, forward, 'forward');
      expect(forward.session.presentation.phase.value).toBe(2);
    });

    it('rejects attachment from a cancelled session after reopening', () => {
      const first = fixture.open({ pendingAttachment: true });
      const oldSession = fixture.coordinator.getActiveSession();
      fixture.dismiss();
      expect(first.settled).toBe(true);
      expect(first.session).toBe(null);
      expect(oldSession.presentation.valid.value).toBe(false);
      const second = fixture.open({ pendingAttachment: true });
      const current = fixture.coordinator.getActiveSession();
      expect(current.id === oldSession.id).toBe(false);
      fixture.acknowledgeAttachment(oldSession.id);
      expect(second.settled).toBe(false);
      expect(fixture.coordinator.getActiveSession().id).toBe(current.id);
      fixture.acknowledgeAttachment(current.id);
      expectJourneySession(fixture, second, 'forward');
    });
  });
}
