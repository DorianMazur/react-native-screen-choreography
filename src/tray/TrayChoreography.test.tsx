import React from 'react';
import {
  act,
  renderAsync as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { animateOwnedProgress } from '../core/ProgressOwnership';
import { PreparationTrace } from '../core/preparationTrace';
import { TrayChoreography, useTraySharedTransition } from './TrayChoreography';
import { initialTrayState, trayReducer, type TrayStackState } from './stack';

jest.mock('../components/ChoreographyProvider', () => ({
  ChoreographyProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('../core/ProgressOwnership', () => ({
  animateOwnedProgress: jest.fn(),
}));

function pending() {
  const presented = trayReducer(initialTrayState, {
    type: 'present',
    name: 'list',
    params: undefined,
  });
  const open = trayReducer(presented, {
    type: 'settled',
    session: presented.session,
    index: 1,
  });
  return trayReducer(open, {
    type: 'push',
    name: 'detail',
    params: undefined,
    groupId: 'person',
  });
}
function prepared() {
  const state = pending();
  return trayReducer(state, {
    type: 'prepared',
    session: state.session,
    id: state.preparation!.id,
  });
}
let context: ChoreographyContextType;
let result: ReturnType<typeof useTraySharedTransition>;
let renderer: RenderResult;
const dispatch = jest.fn();
const onPrepare = jest.fn();
const onFinish = jest.fn();
function Probe({ state, ready }: { state: TrayStackState; ready: boolean }) {
  result = useTraySharedTransition({
    state,
    dispatch,
    animation: { type: 'spring', stiffness: 300, damping: 30 },
    targetReady: ready,
    onPrepare,
    onFinish,
  });
  return null;
}
function tree(state: TrayStackState, ready = true) {
  return (
    <ChoreographyContext.Provider value={context}>
      <TrayChoreography>
        <Probe state={state} ready={ready} />
      </TrayChoreography>
    </ChoreographyContext.Provider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  context = {
    captureSourceGroup: jest.fn(async () => {}),
    waitForScreenReady: jest.fn(async () => true),
    startTransition: jest.fn(async () => ({
      id: 'session',
      reducedMotion: false,
    })),
    waitForOverlayReady: jest.fn(async () => true),
    isOverlayPresented: jest.fn(() => true),
    cancelTransition: jest.fn(),
    completeTransition: jest.fn(),
    progressOwnership: { claim: jest.fn(() => 1) },
    progress: { value: 0 },
    activeSession: null,
    overlayHandoffSessionId: null,
  } as unknown as ChoreographyContextType;
});
afterEach(async () => {
  if (renderer) await renderer.unmountAsync();
});

test('ignores source capture after dismissal and reports cancellation once', async () => {
  jest.useFakeTimers();
  const onTrace = jest.fn();
  context = { ...context, onPreparationTrace: onTrace };
  let resolve!: () => void;
  jest.mocked(context.captureSourceGroup).mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  try {
    const state = pending();

    renderer = await renderComponent(tree(state));

    expect(onPrepare).toHaveBeenCalledTimes(1);
    await act(async () => {
      await renderer.rerenderAsync(
        tree(trayReducer(state, { type: 'dismiss' }))
      );
    });
    await act(async () => {
      resolve();
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(onTrace).toHaveBeenCalledTimes(1);
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: null, outcome: 'cancelled' })
    );
  } finally {
    jest.useRealTimers();
  }
});

test('waits for destination layout and native handoff before releasing retained pages', async () => {
  const state = prepared();

  renderer = await renderComponent(tree(state, false));

  expect(context.startTransition).not.toHaveBeenCalled();
  await act(async () => {
    await renderer.rerenderAsync(tree(state));
  });
  expect(context.startTransition).toHaveBeenCalledWith(
    expect.objectContaining({ groupId: 'person', direction: 'forward' })
  );
  expect(result.started).toBe(true);
  const completion =
    jest.mocked(animateOwnedProgress).mock.calls[0]![0].onComplete;
  context = { ...context, overlayHandoffSessionId: 'session' };
  await act(async () => {
    await renderer.rerenderAsync(tree(state));
    completion(1, 'session');
  });
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(context.completeTransition).toHaveBeenCalledTimes(1);
  expect(dispatch).not.toHaveBeenCalled();
  context = { ...context, overlayHandoffSessionId: null };
  await act(async () => {
    await renderer.rerenderAsync(tree(state));
  });
  expect(dispatch).toHaveBeenCalledWith({
    type: 'transitionEnd',
    session: state.session,
    id: state.transition!.id,
  });
});

test('falls back when no shared pair can be prepared', async () => {
  jest.mocked(context.startTransition).mockResolvedValue(null);

  renderer = await renderComponent(tree(prepared()));

  expect(result.enabled).toBe(false);
  expect(animateOwnedProgress).not.toHaveBeenCalled();
});

test('ignores an animation completion after the sheet starts closing', async () => {
  const state = prepared();

  renderer = await renderComponent(tree(state));

  const completion =
    jest.mocked(animateOwnedProgress).mock.calls[0]![0].onComplete;
  await act(async () => {
    await renderer.rerenderAsync(tree(trayReducer(state, { type: 'dismiss' })));
  });
  await act(async () => {
    completion(1, 'session');
  });
  expect(context.cancelTransition).toHaveBeenCalled();
  expect(onFinish).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

test('traces source capture through confirmed presentation across the destination mount', async () => {
  jest.useFakeTimers();
  const onTrace = jest.fn();
  context = { ...context, onPreparationTrace: onTrace };
  let present!: (ready: boolean) => void;
  jest.mocked(context.waitForOverlayReady).mockReturnValue(
    new Promise<boolean>((resolve) => {
      present = resolve;
    })
  );
  try {
    renderer = await renderComponent(tree(pending()));

    await act(async () => {
      await renderer.rerenderAsync(tree(prepared()));
    });
    const config = jest.mocked(context.startTransition).mock.calls[0]![0];
    expect(config.trace).toBeDefined();
    expect(onTrace).not.toHaveBeenCalled();
    await act(async () => {
      present(true);
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session',
        targetScreenId: config.targetScreenId,
        outcome: 'overlay-ready',
        stages: expect.arrayContaining([
          expect.objectContaining({ name: 'source-capture', completed: true }),
          expect.objectContaining({
            name: 'overlay-ready',
            details: { ready: true, acknowledged: true },
          }),
        ]),
      })
    );
  } finally {
    jest.useRealTimers();
  }
});

test('without diagnostics, shared navigation allocates no preparation stages or presentation trace', async () => {
  const start = jest.spyOn(PreparationTrace.prototype, 'start');
  const finish = jest.spyOn(PreparationTrace.prototype, 'finish');
  try {
    renderer = await renderComponent(tree(pending()));

    await act(async () => {
      await renderer.rerenderAsync(tree(prepared()));
    });
    const config = jest.mocked(context.startTransition).mock.calls[0]![0];
    expect(config).not.toHaveProperty('trace');
    expect(start).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
    expect(animateOwnedProgress).toHaveBeenCalledTimes(1);
  } finally {
    start.mockRestore();
    finish.mockRestore();
  }
});
