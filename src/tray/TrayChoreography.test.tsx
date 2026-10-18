import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { animateOwnedProgress } from '../core/ProgressOwnership';
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
let renderer: ReactTestRenderer;
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
    cancelTransition: jest.fn(),
    completeTransition: jest.fn(),
    progressOwnership: { claim: jest.fn(() => 1) },
    progress: { value: 0 },
    activeSession: null,
    overlayHandoffSessionId: null,
  } as unknown as ChoreographyContextType;
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

test('does not dispatch a source capture that resolves after dismissal', async () => {
  let resolve!: () => void;
  jest.mocked(context.captureSourceGroup).mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  const state = pending();
  await act(async () => {
    renderer = create(tree(state));
  });
  expect(onPrepare).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer.update(tree(trayReducer(state, { type: 'dismiss' })));
  });
  await act(async () => {
    resolve();
  });
  expect(dispatch).not.toHaveBeenCalled();
});

test('waits for destination layout and native handoff before releasing retained pages', async () => {
  const state = prepared();
  await act(async () => {
    renderer = create(tree(state, false));
  });
  expect(context.startTransition).not.toHaveBeenCalled();
  await act(async () => {
    renderer.update(tree(state));
  });
  expect(context.startTransition).toHaveBeenCalledWith(
    expect.objectContaining({ groupId: 'person', direction: 'forward' })
  );
  expect(result.started).toBe(true);
  const completion =
    jest.mocked(animateOwnedProgress).mock.calls[0]![0].onComplete;
  context = { ...context, overlayHandoffSessionId: 'session' };
  await act(async () => {
    renderer.update(tree(state));
    completion(1, 'session');
  });
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(context.completeTransition).toHaveBeenCalledTimes(1);
  expect(dispatch).not.toHaveBeenCalled();
  context = { ...context, overlayHandoffSessionId: null };
  await act(async () => {
    renderer.update(tree(state));
  });
  expect(dispatch).toHaveBeenCalledWith({
    type: 'transitionEnd',
    session: state.session,
    id: state.transition!.id,
  });
});

test('falls back when no shared pair can be prepared', async () => {
  jest.mocked(context.startTransition).mockResolvedValue(null);
  await act(async () => {
    renderer = create(tree(prepared()));
  });
  expect(result.enabled).toBe(false);
  expect(animateOwnedProgress).not.toHaveBeenCalled();
});

test('ignores an animation completion after the sheet starts closing', async () => {
  const state = prepared();
  await act(async () => {
    renderer = create(tree(state));
  });
  const completion =
    jest.mocked(animateOwnedProgress).mock.calls[0]![0].onComplete;
  await act(async () => {
    renderer.update(tree(trayReducer(state, { type: 'dismiss' })));
  });
  await act(async () => {
    completion(1, 'session');
  });
  expect(context.cancelTransition).toHaveBeenCalled();
  expect(onFinish).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
