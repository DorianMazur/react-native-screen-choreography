import {
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  ChoreographyControlsContext,
  PreparingSessionContext,
} from '../core/ChoreographyContext';
import {
  SharedElementPresentationContext,
  type SharedElementEndpoint,
} from '../core/SharedElementPresentation';
import {
  pairEndpoints,
  selectPresentationPair,
} from '../core/sharedElementPresentationData';
import { useScreenId } from '../core/screenIdContext';
import { transitionFrameSize } from '../standin/TransitionSurface';
import type { ElementTransitionPair, TransitionSessionData } from '../types';
import type { SharedElementTargetProps } from './SharedElement';

export function SharedElementTargetContent({
  id,
  groupId,
  style,
  metadata,
  children,
}: SharedElementTargetProps) {
  const choreography = useContext(ChoreographyContext)!;
  const controls = useContext(ChoreographyControlsContext);
  const actions = useContext(ChoreographyActionsContext)!;
  const screenId = useScreenId();
  const session =
    useContext(PreparingSessionContext) ?? choreography.activeSession;
  const pair = selectPresentationPair(session, screenId, groupId, id);
  const { registerTargetContent, getSettledScreenId } = actions;
  useEffect(
    () => registerTargetContent(screenId, groupId, id),
    [registerTargetContent, screenId, groupId, id]
  );
  const initial = useMemo(
    () => ({
      metrics: null,
      style: StyleSheet.flatten(style) ?? undefined,
      metadata,
    }),
    [style, metadata]
  );
  return (
    <TargetPresentation
      key={JSON.stringify([screenId, groupId, id])}
      pair={pair}
      preparing={Boolean(pair && session?.state === 'preparing')}
      direction={pair ? session!.direction : null}
      reducedMotion={Boolean(pair && session?.reducedMotion)}
      progress={controls?.progress ?? choreography.progress}
      screenId={screenId}
      getSettledScreenId={getSettledScreenId}
      initial={initial}
    >
      {children}
    </TargetPresentation>
  );
}

const TargetPresentation = memo(function TargetPresentation({
  pair,
  preparing,
  direction,
  reducedMotion,
  progress,
  screenId,
  getSettledScreenId,
  initial,
  children,
}: {
  pair: ElementTransitionPair | null;
  preparing: boolean;
  direction: TransitionSessionData['direction'] | null;
  reducedMotion: boolean;
  progress: SharedValue<number>;
  screenId: string;
  getSettledScreenId: () => string | null;
  initial: SharedElementEndpoint;
  children: ReactNode;
}) {
  const activeEndpoints = useMemo(
    () => (pair ? pairEndpoints(pair, direction!) : null),
    [pair, direction]
  );
  const retained = useRef<{
    endpoints: ReturnType<typeof pairEndpoints> | null;
    participating: boolean;
    settled: 'collapsed' | 'expanded';
  }>({ endpoints: null, participating: false, settled: 'expanded' });
  if (pair && !preparing) {
    retained.current.endpoints = activeEndpoints;
    retained.current.participating = true;
  } else if (!pair && retained.current.participating) {
    retained.current.participating = false;
    const settledScreen = getSettledScreenId();
    retained.current.settled =
      settledScreen && settledScreen !== screenId ? 'collapsed' : 'expanded';
  }
  const endpoints = activeEndpoints ?? retained.current.endpoints;
  const collapsed = endpoints?.collapsed ?? initial;
  const expanded = endpoints?.expanded ?? initial;
  const settled =
    reducedMotion && pair
      ? pair.target.screenId === screenId
        ? 'expanded'
        : 'collapsed'
      : retained.current.settled;
  // Install the mapper during preparation, while the screen gate is closed.
  // At rest, disconnect from other groups' clocks and keep the settled endpoint.
  const pairedProgress = pair && !reducedMotion ? progress : null;
  const restingProgress = settled === 'expanded' ? 1 : 0;
  const presentationProgress = useDerivedValue(() =>
    pairedProgress ? pairedProgress.value : restingProgress
  );
  const collapsedMetrics = activeEndpoints?.collapsed.metrics;
  const expandedMetrics = activeEndpoints?.expanded.metrics;
  const frame = useDerivedValue(() =>
    pairedProgress && collapsedMetrics && expandedMetrics
      ? transitionFrameSize(
          collapsedMetrics,
          expandedMetrics,
          pairedProgress.value
        )
      : null
  );
  const transitioning = Boolean(pair && !preparing && !reducedMotion);
  const activeDirection = preparing ? null : direction;
  const presentation = useMemo(
    () => ({
      progress,
      presentationProgress,
      frame,
      collapsed,
      expanded,
      transitioning,
      direction: activeDirection,
      settled,
    }),
    [
      progress,
      presentationProgress,
      frame,
      collapsed,
      expanded,
      transitioning,
      activeDirection,
      settled,
    ]
  );
  return (
    <SharedElementPresentationContext.Provider value={presentation}>
      {children}
    </SharedElementPresentationContext.Provider>
  );
});
