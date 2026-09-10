import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TransitionOverlay } from './TransitionOverlay';
import type { TransitionSessionData, SharedElementTransitionRendererProps } from '../types';

test('overlay renders frozen endpoint data without copying children or hiding retained content', async () => {
  const renderer = jest.fn((_props: SharedElementTransitionRendererProps) => null);
  const transition = { renderer };
  const metrics = { pageX: 0, pageY: 0, width: 100, height: 100 };
  const session = {
    id: 's', groupId: 'g', direction: 'forward',
    pairs: [{ id: 'hero', transition, source: { screenId: 'list' }, target: { screenId: 'detail' }, sourceMetrics: metrics, targetMetrics: metrics, sourcePresentation: { metadata: 'captured', transition }, targetPresentation: { transition } }],
  } as unknown as TransitionSessionData;
  const onReady = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<TransitionOverlay session={session} progress={{ value: 0 } as TransitionSessionData['progress']} onReady={onReady} />); });
  expect(onReady).toHaveBeenCalledWith('s');
  expect(renderer.mock.calls[0]![0].source.metadata).toBe('captured');
  expect(renderer.mock.calls[0]![0].source).not.toHaveProperty('content');
  await act(async () => tree.unmount());
});
