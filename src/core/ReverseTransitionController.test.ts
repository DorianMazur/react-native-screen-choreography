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
    preparePresentation: jest.fn(async () => true),
    commitNavigation: jest.fn(() => navigation.promise),
    animate: jest.fn((finished: () => void) => {
      finishAnimation = finished;
    }),
    handoff: jest.fn(),
    cancel: jest.fn(),
    releasePresentation: jest.fn(),
    isCurrent: () => true,
  };
  return { config, navigation, finishAnimation: () => finishAnimation() };
}

describe('reverse settlement ordering', () => {
  test.each(['animation', 'navigation'] as const)(
    'overlaps navigation and animation and waits for both when %s finishes first',
    async (first) => {
      const operation = createOperation();
      const controller = new ReverseTransitionController();
      const completed = controller.start(operation.config);
      await Promise.resolve();
      expect(operation.config.animate).toHaveBeenCalledTimes(1);
      expect(operation.config.commitNavigation).toHaveBeenCalledTimes(1);

      if (first === 'animation') operation.finishAnimation();
      else operation.navigation.resolve({ removed: true, presented: true });
      await Promise.resolve();
      expect(operation.config.handoff).not.toHaveBeenCalled();

      if (first === 'animation') {
        operation.navigation.resolve({ removed: true, presented: true });
      } else operation.finishAnimation();
      await completed;
      expect(operation.config.handoff).toHaveBeenCalledTimes(1);
      expect(operation.config.releasePresentation).toHaveBeenCalledTimes(1);
    }
  );

  test('does not unmount uncaptured content until its animation finishes', async () => {
    const operation = createOperation();
    operation.config.preparePresentation.mockResolvedValue(false);
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

  test('cancels preparation without dispatching after a late capture', async () => {
    const capture = deferred<boolean>();
    const operation = createOperation();
    operation.config.preparePresentation.mockReturnValue(capture.promise);
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    expect(controller.cancelBeforeCommit('reverse')).toBe(true);
    capture.resolve(true);
    await completed;
    await Promise.resolve();
    expect(operation.config.animate).not.toHaveBeenCalled();
    expect(operation.config.commitNavigation).not.toHaveBeenCalled();
    expect(operation.config.cancel).toHaveBeenCalledTimes(1);
    expect(operation.config.releasePresentation).toHaveBeenCalledTimes(1);
  });

  test('does not cancel or restore a source already removed by navigation', async () => {
    const operation = createOperation();
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    await Promise.resolve();
    expect(controller.noteSourceUnmount('reverse', 'detail')).toBe(true);
    expect(controller.cancelBeforeCommit('reverse')).toBe(false);
    operation.navigation.resolve({ removed: false, presented: false });
    await Promise.resolve();
    expect(operation.config.handoff).not.toHaveBeenCalled();
    operation.finishAnimation();
    await completed;
    expect(operation.config.handoff).toHaveBeenCalledTimes(1);
    expect(operation.config.cancel).not.toHaveBeenCalled();
  });

  test('restores the source when another navigation blocker prevents removal', async () => {
    const operation = createOperation();
    const controller = new ReverseTransitionController();
    const completed = controller.start(operation.config);
    await Promise.resolve();
    operation.navigation.resolve({ removed: false, presented: false });
    await completed;
    operation.finishAnimation();
    expect(operation.config.cancel).toHaveBeenCalledTimes(1);
    expect(operation.config.handoff).not.toHaveBeenCalled();
    expect(operation.config.releasePresentation).toHaveBeenCalledTimes(1);
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
    expect(first.config.releasePresentation).toHaveBeenCalledTimes(1);
    expect(controller.owns('replacement')).toBe(true);
    second.finishAnimation();
    second.navigation.resolve({ removed: true, presented: true });
    await secondCompleted;
    expect(second.config.handoff).toHaveBeenCalledTimes(1);
  });
});
