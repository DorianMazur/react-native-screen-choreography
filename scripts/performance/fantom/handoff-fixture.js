import * as Fantom from '@react-native/fantom';
import { ReverseTransitionController } from '../../../src/core/ReverseTransitionController';

// Controlled boundary signals; the controller itself is production code.
// No native navigation, animation or UI-runtime latency is simulated here.
export function createHandoffFixture(
  controller = new ReverseTransitionController(),
  sessionId = 'reverse'
) {
  const calls = { commit: 0, removed: 0, handoff: 0, cancel: 0, settle: 0 };
  let finishAnimation;
  let resolveNavigation;
  let current = true;
  let completed = false;
  const navigation = new Promise((resolve) => {
    resolveNavigation = resolve;
  });
  Fantom.runTask(() => {
    controller
      .start({
        sessionId,
        sourceScreenId: 'detail',
        targetScreenId: 'home',
        commitNavigation: () => {
          calls.commit++;
          return navigation;
        },
        animate: (finish) => {
          finishAnimation = finish;
        },
        onNavigationRemoved: () => calls.removed++,
        settleToTarget: () => calls.settle++,
        handoff: () => calls.handoff++,
        cancel: () => calls.cancel++,
        isCurrent: () => current,
      })
      .then(() => {
        completed = true;
      });
  });
  return {
    controller,
    calls,
    sessionId,
    finishAnimation: () => finishAnimation(),
    resolveNavigation: (removed = true) =>
      resolveNavigation({ removed, presented: removed }),
    invalidate: () => {
      current = false;
    },
    isCompleted: () => completed,
    destroy() {
      Fantom.runTask(() => {
        controller.dispose();
        resolveNavigation({ removed: false, presented: false });
      });
    },
  };
}
