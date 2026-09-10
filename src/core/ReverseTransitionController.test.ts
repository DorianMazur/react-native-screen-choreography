import {
  ReverseTransitionController,
  type ReverseNavigationResult,
} from './ReverseTransitionController';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createOperation() {
  const navigation = deferred<ReverseNavigationResult>();
  let finishAnimation!: () => void;
  const config = {
    sessionId: 'reverse',
    sourceScreenId: 'detail',
    targetScreenId: 'home',
    commitNavigation: jest.fn(() => navigation.promise),
    animate: jest.fn((finished: () => void) => {
      finishAnimation = finished;
    }),
    handoff: jest.fn(),
    cancel: jest.fn(),
    isCurrent: () => true,
  };
  return { config, navigation, finishAnimation: () => finishAnimation() };
}

describe('reverse settlement ordering', () => {
  test('does not unmount retained content until its animation finishes', async () => {
    const operation = createOperation();
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    await Promise.resolve();
    expect(operation.config.commitNavigation).not.toHaveBeenCalled();
    operation.finishAnimation();
    expect(operation.config.commitNavigation).toHaveBeenCalledTimes(1);
    operation.navigation.resolve({ removed: true, presented: true });
    await completed;
    expect(operation.config.handoff).toHaveBeenCalledTimes(1);
  });

  test('cancels before navigation and ignores late animation completion', async () => {
    const operation = createOperation();
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    expect(controller.cancelBeforeCommit('reverse')).toBe(true);
    operation.finishAnimation();
    await completed;
    expect(operation.config.commitNavigation).not.toHaveBeenCalled();
    expect(operation.config.cancel).toHaveBeenCalledTimes(1);
    expect(operation.config.handoff).not.toHaveBeenCalled();
  });

  test('does not cancel or restore a source already removed by navigation', async () => {
    const operation = createOperation();
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    await Promise.resolve();
    operation.finishAnimation();
    expect(controller.noteSourceUnmount('reverse', 'detail')).toBe(true);
    expect(controller.cancelBeforeCommit('reverse')).toBe(false);
    operation.navigation.resolve({ removed: false, presented: false });
    await Promise.resolve();
    await completed;
    expect(operation.config.handoff).toHaveBeenCalledTimes(1);
    expect(operation.config.cancel).not.toHaveBeenCalled();
  });

  test('restores the source when another navigation blocker prevents removal', async () => {
    const operation = createOperation();
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    await Promise.resolve();
    operation.finishAnimation();
    operation.navigation.resolve({ removed: false, presented: false });
    await completed;
    expect(operation.config.cancel).toHaveBeenCalledTimes(1);
    expect(operation.config.handoff).not.toHaveBeenCalled();
  });

  test('deduplicates commits and ignores callbacks belonging to a replaced session', async () => {
    const first = createOperation();
    const second = createOperation();
    second.config.sessionId = 'replacement';
    const controller = new ReverseTransitionController();
    const firstCompleted = controller.start(first.config);
    expect(controller.start(first.config)).toBe(firstCompleted);
    await Promise.resolve();
    const secondCompleted = controller.start(second.config);
    await firstCompleted;
    first.finishAnimation();
    first.navigation.resolve({ removed: true, presented: true });
    await Promise.resolve();
    expect(first.config.handoff).not.toHaveBeenCalled();
    expect(first.config.cancel).not.toHaveBeenCalled();
    expect(controller.owns('replacement')).toBe(true);
    second.finishAnimation();
    second.navigation.resolve({ removed: true, presented: true });
    await secondCompleted;
    expect(second.config.handoff).toHaveBeenCalledTimes(1);
  });
});
