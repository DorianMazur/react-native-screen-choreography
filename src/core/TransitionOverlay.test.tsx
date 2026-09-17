import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TransitionOverlay } from './TransitionOverlay';
import { makeTransition } from '../transitions/makeTransition';
import type {
  TransitionSessionData,
  TransitionRendererProps,
  SharedElementTransitionRendererProps,
} from '../types';

test('overlay renders frozen endpoint data without copying children or hiding retained content', async () => {
  const renderer = jest.fn(
    (_props: SharedElementTransitionRendererProps) => null
  );
  const transition = { renderer };
  const metrics = { pageX: 0, pageY: 0, width: 100, height: 100 };
  const session = {
    id: 's',
    groupId: 'g',
    direction: 'forward',
    pairs: [
      {
        id: 'hero',
        transition,
        source: { screenId: 'list' },
        target: { screenId: 'detail' },
        sourceMetrics: metrics,
        targetMetrics: metrics,
        sourcePresentation: { metadata: 'captured', transition },
        targetPresentation: { transition },
      },
    ],
  } as unknown as TransitionSessionData;
  const onReady = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <TransitionOverlay
        session={session}
        progress={{ value: 0 } as TransitionSessionData['progress']}
        onReady={onReady}
      />
    );
  });
  expect(onReady).toHaveBeenCalledWith('s');
  expect(renderer.mock.calls[0]![0].source.metadata).toBe('captured');
  expect(renderer.mock.calls[0]![0].source).not.toHaveProperty('content');
  await act(async () => tree.unmount());
});

jest.mock('react-native-teleport', () => ({ PortalHost: 'PortalHost' }));

test.each(['forward', 'backward'] as const)(
  'supplies only matched session geometry through makeTransition on %s and refreshes it with endpoints',
  async (direction) => {
    const received = new Map<string, TransitionRendererProps>();
    const transition = makeTransition({
      renderer: (props) => {
        received.set(props.id, props);
        return props.children;
      },
    });
    const collapsed = { pageX: 10, pageY: 20, width: 30, height: 40 };
    const expanded = { pageX: 50, pageY: 60, width: 70, height: 80 };
    const pair = (id: string) => ({
      id,
      transition,
      source: {
        id,
        screenId: 'from',
        ref: { current: 123 },
        content: 'private',
        metrics: collapsed,
        getPresentation: () => ({ transition }),
      },
      target: {
        id,
        screenId: 'to',
        ref: { current: 456 },
        metrics: expanded,
        getPresentation: () => ({ transition }),
      },
      sourceMetrics: direction === 'forward' ? collapsed : expanded,
      targetMetrics: direction === 'forward' ? expanded : collapsed,
      sourcePresentation: { transition, metadata: 'private' },
      targetPresentation: { transition },
    });
    let session = {
      id: 'first',
      groupId: 'group',
      direction,
      pairs: [pair('hero'), pair('__proto__')],
    } as unknown as TransitionSessionData;
    const progress = { value: 0.5 } as TransitionSessionData['progress'];
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <TransitionOverlay session={session} progress={progress} />
        );
      });
      const anchors = received.get('hero')!.anchors!;
      expect(Object.keys(anchors)).toEqual(['hero', '__proto__']);
      expect(anchors.hero).toEqual({ collapsed, expanded });
      expect(
        Object.getOwnPropertyDescriptor(anchors, '__proto__')?.value
      ).toEqual({ collapsed, expanded });
      expect(anchors.toString).toBeUndefined();
      expect(anchors.optional).toBeUndefined();
      expect(received.get('__proto__')!.anchors).toBe(anchors);
      expect(anchors.hero!.collapsed).not.toBe(collapsed);

      const refreshed = { pageX: 90, pageY: 91, width: 92, height: 93 };
      session = {
        ...session,
        pairs: session.pairs.map((p) => ({ ...p, targetMetrics: refreshed })),
      };
      await act(async () => {
        tree.update(
          <TransitionOverlay session={session} progress={progress} />
        );
      });
      const updated = received.get('hero')!;
      expect(updated.anchors).not.toBe(anchors);
      expect(
        updated.anchors!.hero![
          direction === 'forward' ? 'expanded' : 'collapsed'
        ]
      ).toEqual(updated.target.metrics);
      expect(updated.target.metrics).toEqual(refreshed);
      expect(anchors.hero).toEqual({ collapsed, expanded });

      session = { ...session, id: 'second', pairs: [pair('other')] };
      await act(async () => {
        tree.update(
          <TransitionOverlay session={session} progress={progress} />
        );
      });
      expect(Object.keys(received.get('other')!.anchors!)).toEqual(['other']);
    } finally {
      await act(async () => tree?.unmount());
    }
  }
);
