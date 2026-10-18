import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { ChoreographyProvider } from '../components/ChoreographyProvider';
import { ChoreographyContext } from '../core/ChoreographyContext';
import {
  ScreenGeometryContext,
  type ScreenOrigin,
} from '../core/ScreenGeometryContext';
import { animateOwnedProgress } from '../core/ProgressOwnership';
import type { TrayAction, TrayStackState } from './stack';
import type { ResolvedTrayAnimation } from './animation';

const GeometryContext = createContext<{
  screenId: (key: string) => string;
  origins: Map<string, ScreenOrigin>;
} | null>(null);

export function TrayChoreography({ children }: { children: React.ReactNode }) {
  const id = useId();
  const geometry = useMemo(
    () => ({
      screenId: (key: string) => `tray:${id}:${key}`,
      origins: new Map<string, ScreenOrigin>(),
    }),
    [id]
  );
  const resolve = useMemo(
    () => (screenId: string) => geometry.origins.get(screenId),
    [geometry]
  );
  return (
    <GeometryContext.Provider value={geometry}>
      <ScreenGeometryContext.Provider value={resolve}>
        <ChoreographyProvider>{children}</ChoreographyProvider>
      </ScreenGeometryContext.Provider>
    </GeometryContext.Provider>
  );
}

export function useTrayGeometry() {
  return useContext(GeometryContext)!;
}

export function useTraySharedTransition({
  state,
  dispatch,
  animation,
  targetReady,
  onPrepare,
  onFinish,
}: {
  state: TrayStackState;
  dispatch: React.Dispatch<TrayAction>;
  animation: ResolvedTrayAnimation;
  targetReady: boolean;
  onPrepare: () => void;
  onFinish: () => void;
}) {
  const context = useContext(ChoreographyContext)!;
  const { screenId } = useTrayGeometry();
  const latest = useRef({ context, animation, onPrepare, onFinish });
  latest.current = { context, animation, onPrepare, onFinish };
  const [fallback, setFallback] = useState<number>();
  const [finished, setFinished] = useState<number>();
  const [started, setStarted] = useState<number>();
  const motionId = useSharedValue<number | undefined>(undefined);
  const preparation = state.preparation;
  const transition = state.transition;
  const groupId = transition?.groupId;
  const id = transition?.id;
  const direction = transition?.direction;
  const source = transition?.from;
  const target = transition?.to;
  const session = state.session;
  const closing = state.phase === 'closing';

  useEffect(() => {
    if (!preparation || closing) return;
    let current = true;
    latest.current.onPrepare();
    const { context: ctx } = latest.current;
    const ready = () => {
      if (current) dispatch({ type: 'prepared', session, id: preparation.id });
    };
    ctx
      .captureSourceGroup(preparation.groupId, screenId(preparation.from))
      .then(ready, ready);
    return () => {
      current = false;
    };
  }, [preparation, closing, session, dispatch, screenId]);

  useEffect(() => {
    if (
      !groupId ||
      id === undefined ||
      !source ||
      !target ||
      !targetReady ||
      closing
    )
      return;
    let current = true;
    let completed = false;
    const { context: ctx, animation: motion } = latest.current;
    const fail = () => {
      if (current) {
        ctx.cancelTransition();
        setFallback(id);
      }
    };
    const finish = () => {
      if (!current) return;
      completed = true;
      latest.current.onFinish();
      ctx.completeTransition();
      setFinished(id);
    };
    const run = async () => {
      if (!(await ctx.waitForScreenReady(screenId(target))) || !current)
        return fail();
      const prepared = await ctx.startTransition({
        groupId,
        sourceScreenId: screenId(source),
        targetScreenId: screenId(target),
        direction: direction === -1 ? 'backward' : 'forward',
        onUnavailable: fail,
      });
      if (!current) return;
      if (!prepared) return fail();
      setStarted(id);
      motionId.value = id;
      if (prepared.reducedMotion) return finish();
      const token = ctx.progressOwnership.claim(prepared.id);
      if (token === null) return fail();
      animateOwnedProgress({
        ownership: ctx.progressOwnership,
        token,
        sessionId: prepared.id,
        progress: ctx.progress,
        target: direction === -1 ? 0 : 1,
        spring:
          motion.type === 'spring'
            ? { stiffness: motion.stiffness, damping: motion.damping, mass: 1 }
            : { stiffness: 300, damping: 30, mass: 1 },
        duration: motion.type === 'timing' ? motion.duration : undefined,
        presentation: prepared.presentation,
        onComplete: finish,
      });
      if (
        !(await ctx.waitForOverlayReady(prepared.id)) &&
        current &&
        !completed
      )
        fail();
    };
    run().catch(fail);
    return () => {
      current = false;
      ctx.cancelTransition();
    };
  }, [
    groupId,
    id,
    source,
    target,
    targetReady,
    closing,
    direction,
    session,
    screenId,
    motionId,
  ]);

  useLayoutEffect(() => {
    if (
      finished !== undefined &&
      finished === id &&
      !context.activeSession &&
      !context.overlayHandoffSessionId
    ) {
      dispatch({ type: 'transitionEnd', session, id: finished });
    }
  }, [
    finished,
    id,
    context.activeSession,
    context.overlayHandoffSessionId,
    dispatch,
    session,
  ]);

  return {
    enabled: Boolean(groupId && fallback !== id),
    started: started === id && id !== undefined,
    motionId,
    progress: context.progress,
  };
}
