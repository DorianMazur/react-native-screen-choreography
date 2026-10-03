/** @fantom_mode opt */
import '@react-native/fantom/src/setUpDefaultReactNativeEnvironment';
import * as Fantom from '@react-native/fantom';
import { createHandoffFixture } from '../handoff-fixture';

describe('Reverse handoff safety in Hermes', () => {
  let operation;
  beforeEach(() => {
    operation = createHandoffFixture();
  });
  afterEach(() => {
    operation.destroy();
  });

  for (const animationFirst of [true, false]) {
    it(`waits for both signals (${animationFirst ? 'animation' : 'removal'} first) and ignores duplicates`, () => {
      Fantom.runTask(() => {
        operation.controller.commitNearEndpoint('reverse');
        operation.controller.commitNearEndpoint('reverse');
        if (animationFirst) operation.finishAnimation();
        else operation.resolveNavigation();
      });
      expect(operation.calls.handoff).toBe(0);
      expect(operation.isCompleted()).toBe(false);
      Fantom.runTask(() => {
        if (animationFirst) operation.resolveNavigation();
        else operation.finishAnimation();
      });
      expect(operation.isCompleted()).toBe(true);
      Fantom.runTask(() => {
        operation.finishAnimation();
        operation.controller.noteSourceUnmount('reverse', 'detail');
        operation.controller.commitNearEndpoint('reverse');
      });
      expect(operation.calls).toEqual({
        commit: 1,
        removed: 1,
        handoff: 1,
        cancel: 0,
        settle: 0,
      });
      expect(operation.controller.owns('reverse')).toBe(false);
    });
  }

  it('accepts confirmed source unmount without a navigation acknowledgement', () => {
    Fantom.runTask(() => {
      operation.controller.commitNearEndpoint('reverse');
      expect(operation.controller.noteSourceUnmount('stale', 'detail')).toBe(
        false
      );
      expect(operation.controller.noteSourceUnmount('reverse', 'other')).toBe(
        false
      );
      expect(operation.controller.noteSourceUnmount('reverse', 'detail')).toBe(
        true
      );
      operation.finishAnimation();
    });
    expect(operation.isCompleted()).toBe(true);
    Fantom.runTask(() => operation.resolveNavigation(false));
    expect(operation.calls.handoff).toBe(1);
    expect(operation.calls.removed).toBe(1);
    expect(operation.calls.cancel).toBe(0);
  });

  it('cancels before commit and ignores late animation completion', () => {
    Fantom.runTask(() => {
      expect(operation.controller.cancelBeforeCommit('reverse')).toBe(true);
      operation.finishAnimation();
      operation.resolveNavigation();
    });
    expect(operation.isCompleted()).toBe(true);
    expect(operation.calls.cancel).toBe(1);
    expect(operation.calls.commit).toBe(0);
    expect(operation.calls.handoff).toBe(0);
  });

  it('cancels rejected navigation removal without handing off', () => {
    Fantom.runTask(() => {
      operation.finishAnimation();
      operation.resolveNavigation(false);
    });
    expect(operation.isCompleted()).toBe(true);
    expect(operation.calls.cancel).toBe(1);
    expect(operation.calls.removed).toBe(0);
    expect(operation.calls.handoff).toBe(0);
    expect(operation.controller.owns('reverse')).toBe(false);
  });

  it('allows interruption only after confirmed removal and ignores the late spring callback', () => {
    expect(operation.controller.finishImmediately('reverse')).toBe(false);
    Fantom.runTask(() => {
      operation.controller.commitNearEndpoint('reverse');
      operation.resolveNavigation();
    });
    expect(operation.controller.finishImmediately('stale')).toBe(false);
    Fantom.runTask(() => {
      expect(operation.controller.finishImmediately('reverse')).toBe(true);
      operation.finishAnimation();
    });
    expect(operation.isCompleted()).toBe(true);
    expect(operation.calls.settle).toBe(1);
    expect(operation.calls.handoff).toBe(1);
    expect(operation.calls.cancel).toBe(0);
  });

  it('ignores callbacks from an invalidated session', () => {
    Fantom.runTask(() => {
      operation.controller.commitNearEndpoint('reverse');
      operation.invalidate();
      operation.finishAnimation();
      operation.resolveNavigation();
    });
    expect(operation.isCompleted()).toBe(true);
    expect(operation.calls.handoff).toBe(0);
    expect(operation.calls.removed).toBe(0);
    expect(operation.controller.owns('reverse')).toBe(false);
  });

  it('does not let a replaced session complete the current handoff', () => {
    Fantom.runTask(() => operation.controller.commitNearEndpoint('reverse'));
    const replacement = createHandoffFixture(
      operation.controller,
      'replacement'
    );
    Fantom.runTask(() => {
      operation.finishAnimation();
      operation.resolveNavigation();
    });
    expect(operation.isCompleted()).toBe(true);
    expect(operation.calls.handoff).toBe(0);
    expect(replacement.isCompleted()).toBe(false);
    expect(replacement.controller.owns('replacement')).toBe(true);
    Fantom.runTask(() => {
      replacement.finishAnimation();
      replacement.resolveNavigation();
    });
    expect(replacement.calls.handoff).toBe(1);
    expect(replacement.isCompleted()).toBe(true);
    replacement.destroy();
  });
});
