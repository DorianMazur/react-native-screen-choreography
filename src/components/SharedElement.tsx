import { SharedElementPresentationContext } from '../core/SharedElementPresentation';
import type { SharedElementEndpoint } from '../core/SharedElementPresentation';
import {
  type ReactNode,
  type RefObject,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useContext,
  useReducer,
  memo,
} from 'react';
import { type StyleProp, type ViewStyle, StyleSheet, View } from 'react-native';
import Animated, { useDerivedValue } from 'react-native-reanimated';
import { Portal, PortalHost } from 'react-native-teleport';
import type {
  ElementPresentation,
  Transition,
  SharedElementTransition,
  ElementTransitionPair,
  TransitionSessionData,
} from '../types';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  PreparingSessionContext,
} from '../core/ChoreographyContext';
import { useScreenId } from '../core/screenIdContext';
import {
  getLiveContentMarkerId,
  getLiveDestinationHostName,
  getLiveOverlayHostName,
  getLivePortalName,
} from '../core/liveHostNames';
import { defaultTransition } from '../transitions/makeTransition';
import { transitionFrameSize } from '../standin/TransitionSurface';

export interface SharedElementProps {
  id: string;
  groupId?: string;
  /** Reuse the same factory result on both live endpoints, including for back. */
  transition?: Transition;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Payload layout overrides, applied after the portal's fill defaults. */
  portalStyle?: StyleProp<ViewStyle>;
  /** Captured by reference at session start; narrow in the live renderer. */
  metadata?: unknown;
}

export interface SharedElementTargetProps {
  id: string;
  groupId?: string;
  /** Reuse the owner's factory result for consistent forward and back motion. */
  transition?: Transition;
  style?: StyleProp<ViewStyle>;
  /** Receiving host layout, independent of the measured wrapper's style. */
  hostStyle?: StyleProp<ViewStyle>;
  /** Captured by reference at session start; narrow in the live renderer. */
  metadata?: unknown;
}

interface SharedElementRegistrationProps {
  id: string;
  groupId?: string;
  transition: Transition;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  layoutStyle?: StyleProp<ViewStyle>;
  contentAway?: boolean;
  metadata?: unknown;
}

function SharedElementRegistration({
  id,
  groupId,
  transition,
  children,
  style,
  layoutStyle,
  contentAway = false,
  metadata,
}: SharedElementRegistrationProps) {
  const viewNodeRef = useRef<any>(null);
  const actions = useContext(ChoreographyActionsContext);
  if (!actions) {
    throw new Error(
      'SharedElement must be used within a <ChoreographyProvider>'
    );
  }
  const { registerElement, unregisterElement } = actions;
  const screenId = useScreenId();

  const flattenedStyle = useMemo(
    () => (style ? (StyleSheet.flatten(style) as ViewStyle) : undefined),
    [style]
  );
  // Read current presentation props at capture time without re-registering.
  const transitionRef = useRef<SharedElementTransition>(transition);
  transitionRef.current = transition;
  const styleRef = useRef<ViewStyle | undefined>(flattenedStyle);
  styleRef.current = flattenedStyle;
  const metadataRef = useRef<unknown>(metadata);
  metadataRef.current = metadata;
  const getPresentation = useCallback<() => ElementPresentation>(
    () => ({
      style: styleRef.current,
      transition: transitionRef.current,
      metadata: metadataRef.current,
    }),
    []
  );
  const getTransition = useCallback(() => transitionRef.current, []);

  const getNode = useCallback(() => viewNodeRef.current, []);
  const setRefs = useCallback((node: any) => {
    viewNodeRef.current = node;
  }, []);

  useEffect(() => {
    registerElement({
      id,
      groupId,
      screenId,
      ref: getNode,
      metrics: null,
      getPresentation,
      getTransition,
    });

    return () => {
      unregisterElement(id, screenId, groupId);
    };
  }, [
    id,
    groupId,
    screenId,
    getNode,
    getPresentation,
    getTransition,
    registerElement,
    unregisterElement,
  ]);

  return (
    <Animated.View
      ref={setRefs}
      style={[style, layoutStyle]}
      pointerEvents={contentAway ? 'box-only' : 'auto'}
      collapsable={false}
    >
      {children}
    </Animated.View>
  );
}

function LiveSharedElement(props: SharedElementProps) {
  const choreography = useContext(ChoreographyContext);
  const actions = useContext(ChoreographyActionsContext);
  const screenId = useScreenId();
  // A target can become the source of the next transition while this owner
  // remains mounted on its original screen. Select before the memo boundary.
  const settledTargetScreenIdRef = useRef<string | null>(null);
  const participatingScreenId = settledTargetScreenIdRef.current ?? screenId;
  const participatingSessionIdRef = useRef<string | null>(null);
  if (!choreography || !actions) {
    throw new Error(
      'SharedElement must be used within a <ChoreographyProvider>'
    );
  }
  const session =
    useContext(PreparingSessionContext) ?? choreography.activeSession;
  const preparing = session?.state === 'preparing';
  const pair =
    (session?.state === 'active' || preparing) &&
    session.groupId === props.groupId
      ? (session.pairs.find(
          (candidate) =>
            candidate.id === props.id &&
            (participatingSessionIdRef.current === session.id ||
              candidate.source.screenId === participatingScreenId ||
              candidate.target.screenId === participatingScreenId)
        ) ?? null)
      : null;

  participatingSessionIdRef.current = pair ? session!.id : null;

  const reducedMotion = pair ? session!.reducedMotion : false;
  const direction = pair ? session!.direction : null;
  const sourceScreenId = pair ? session!.sourceScreenId : null;
  const targetScreenId = pair ? session!.targetScreenId : null;
  const { progress } = choreography;
  const { getSettledScreenId, subscribeToScreenRemoval } = actions;

  // Element factories may attach a new ref even when every input is unchanged.
  // Retain the element too, so unrelated context updates preserve the memo boundary.
  return useMemo(
    () => (
      <LiveSharedElementContent
        {...props}
        screenId={screenId}
        settledTargetScreenIdRef={settledTargetScreenIdRef}
        pair={pair}
        preparing={Boolean(pair && preparing)}
        reducedMotion={reducedMotion}
        direction={direction}
        sourceScreenId={sourceScreenId}
        targetScreenId={targetScreenId}
        progress={progress}
        getSettledScreenId={getSettledScreenId}
        subscribeToScreenRemoval={subscribeToScreenRemoval}
      />
    ),
    [
      props,
      screenId,
      pair,
      preparing,
      reducedMotion,
      direction,
      sourceScreenId,
      targetScreenId,
      progress,
      getSettledScreenId,
      subscribeToScreenRemoval,
    ]
  );
}

const LiveSharedElementContent = memo(function LiveSharedElementContent({
  id,
  groupId,
  children,
  style,
  transition = defaultTransition,
  portalStyle,
  metadata,
  screenId,
  settledTargetScreenIdRef,
  pair,
  preparing,
  reducedMotion,
  direction,
  sourceScreenId,
  targetScreenId,
  progress,
  getSettledScreenId,
  subscribeToScreenRemoval,
}: SharedElementProps & {
  screenId: string;
  settledTargetScreenIdRef: RefObject<string | null>;
  pair: ElementTransitionPair | null;
  /** Paired while native attaches the overlay; content stays where it rests. */
  preparing: boolean;
  reducedMotion?: boolean;
  direction: TransitionSessionData['direction'] | null;
  sourceScreenId: string | null;
  targetScreenId: string | null;
  progress: TransitionSessionData['progress'];
  getSettledScreenId: () => string | null;
  subscribeToScreenRemoval: (
    screenId: string,
    listener: () => void
  ) => () => void;
}) {
  const [, returnHome] = useReducer((version: number) => version + 1, 0);
  const wasParticipatingRef = useRef(false);
  const endpoints = useRef<{
    collapsed: SharedElementEndpoint;
    expanded: SharedElementEndpoint;
  } | null>(null);
  const settledSide = useRef<'collapsed' | 'expanded'>('collapsed');
  const homeMetrics = useRef<SharedElementEndpoint['metrics']>(null);
  const destinations = useRef<
    Array<{
      screenId: string;
      endpoint: SharedElementEndpoint;
    }>
  >([]);
  const lastEndpoints = useRef<{
    collapsed: SharedElementEndpoint;
    expanded: SharedElementEndpoint;
    collapsedScreenId: string;
    expandedScreenId: string;
  } | null>(null);
  const participates = pair !== null;
  const activeEndpoints = useMemo(() => {
    if (!pair) return null;
    const source = {
      metrics: pair.sourceMetrics,
      metadata: pair.sourcePresentation.metadata,
      style: pair.sourcePresentation.style,
    };
    const target = {
      metrics: pair.targetMetrics,
      metadata: pair.targetPresentation.metadata,
      style: pair.targetPresentation.style,
    };
    return direction === 'forward'
      ? {
          collapsed: source,
          expanded: target,
          collapsedScreenId: pair.source.screenId,
          expandedScreenId: pair.target.screenId,
        }
      : {
          collapsed: target,
          expanded: source,
          collapsedScreenId: pair.target.screenId,
          expandedScreenId: pair.source.screenId,
        };
  }, [pair, direction]);

  // Retarget in the session-settlement render so content and presentation
  // settle together. Android removes the emptied overlay hosts afterward.
  let hostName: string | undefined;
  const restingHostName = () =>
    settledTargetScreenIdRef.current
      ? getLiveDestinationHostName(
          settledTargetScreenIdRef.current,
          id,
          groupId
        )
      : undefined;
  if (participates) {
    wasParticipatingRef.current = true;
    lastEndpoints.current = activeEndpoints;
    if (pair.source.screenId === screenId)
      homeMetrics.current = pair.sourceMetrics;
    else if (pair.target.screenId === screenId)
      homeMetrics.current = pair.targetMetrics;
    // Retain presentation data only, never a popped screen's registration/ref.
    if (!preparing) endpoints.current = activeEndpoints;
    hostName = preparing
      ? restingHostName()
      : reducedMotion
        ? targetScreenId === screenId
          ? undefined
          : getLiveDestinationHostName(targetScreenId!, id, groupId)
        : getLiveOverlayHostName(
            sourceScreenId!,
            targetScreenId!,
            id,
            groupId ?? 'default'
          );
  } else {
    if (wasParticipatingRef.current) {
      wasParticipatingRef.current = false;
      const settledScreenId =
        getSettledScreenId() ?? settledTargetScreenIdRef.current ?? screenId;
      settledTargetScreenIdRef.current =
        settledScreenId !== screenId ? settledScreenId : null;
      const captured = lastEndpoints.current;
      if (
        captured &&
        (settledScreenId === captured.collapsedScreenId ||
          settledScreenId === captured.expandedScreenId)
      ) {
        endpoints.current = {
          collapsed: captured.collapsed,
          expanded: captured.expanded,
        };
        settledSide.current =
          settledScreenId === captured.collapsedScreenId
            ? 'collapsed'
            : 'expanded';
        const index = destinations.current.findIndex(
          (destination) => destination.screenId === settledScreenId
        );
        destinations.current = settledTargetScreenIdRef.current
          ? [
              ...(index < 0
                ? destinations.current
                : destinations.current.slice(0, index)),
              {
                screenId: settledScreenId,
                endpoint: captured[settledSide.current],
              },
            ]
          : [];
      }
      lastEndpoints.current = null;
    }
    hostName = restingHostName();
  }

  // If a host disappears without a shared Back session, return to the last
  // surviving destination. Retain only frozen presentation data, never nodes.
  const retainedDestinations = destinations.current;
  useLayoutEffect(() => {
    let subscribed = true;
    const unsubscribe = retainedDestinations.map((destination) =>
      subscribeToScreenRemoval(destination.screenId, () => {
        if (!subscribed || !destinations.current.includes(destination)) return;
        destinations.current = destinations.current.filter(
          (entry) => entry !== destination
        );
        if (settledTargetScreenIdRef.current === destination.screenId) {
          const previous = destinations.current.at(-1);
          settledTargetScreenIdRef.current = previous?.screenId ?? null;
          endpoints.current = previous
            ? { collapsed: previous.endpoint, expanded: previous.endpoint }
            : null;
          settledSide.current = 'collapsed';
        }
        returnHome();
      })
    );
    return () => {
      subscribed = false;
      unsubscribe.forEach((remove) => remove());
    };
  }, [
    retainedDestinations,
    settledTargetScreenIdRef,
    subscribeToScreenRemoval,
  ]);

  const ownerStyle = useMemo(() => StyleSheet.flatten(style), [style]);
  const initial = useMemo(
    () => ({ metrics: null, metadata, style: ownerStyle ?? undefined }),
    [metadata, ownerStyle]
  );
  const settled =
    participates && reducedMotion && !preparing
      ? direction === 'forward'
        ? 'expanded'
        : 'collapsed'
      : settledSide.current;
  const transitioning = participates && !reducedMotion && !preparing;
  const presentationProgress = useDerivedValue(() =>
    transitioning ? progress.value : settled === 'expanded' ? 1 : 0
  );
  const collapsed = endpoints.current?.collapsed ?? initial;
  const expanded = endpoints.current?.expanded ?? initial;
  // Prepare the mapper before content enters the overlay. In both directions,
  // progress is 0 at collapsed and 1 at expanded, matching TransitionFrame.
  const frameEndpoints = reducedMotion ? null : activeEndpoints;
  const collapsedMetrics = frameEndpoints?.collapsed.metrics;
  const expandedMetrics = frameEndpoints?.expanded.metrics;
  // Reanimated subscribes to every captured shared value, even behind a guard.
  // Idle owners must not capture the provider clock for their frame mapper.
  const frameProgress = frameEndpoints ? progress : null;
  const frame = useDerivedValue(() =>
    collapsedMetrics && expandedMetrics && frameProgress
      ? transitionFrameSize(
          collapsedMetrics,
          expandedMetrics,
          frameProgress.value
        )
      : null
  );
  const presentation = useMemo(
    () => ({
      progress,
      presentationProgress,
      frame,
      transitioning,
      direction: preparing ? null : direction,
      collapsed,
      expanded,
      settled,
    }),
    [
      progress,
      presentationProgress,
      frame,
      transitioning,
      preparing,
      direction,
      collapsed,
      expanded,
      settled,
    ]
  );
  const reservedMetrics = hostName ? homeMetrics.current : null;
  const flexibleHeight =
    (ownerStyle?.flex ?? 0) > 0 || (ownerStyle?.flexGrow ?? 0) > 0;
  return (
    <SharedElementRegistration
      id={id}
      groupId={groupId}
      transition={transition}
      style={style}
      // Teleport's owner proxies hits to its remote host. While content is away,
      // only this reserved endpoint may receive input, never the remote payload.
      contentAway={hostName !== undefined}
      // Reserve intrinsic layout while the native content is away. Keep this
      // separate from the app's frozen presentation and explicit size rules.
      layoutStyle={
        reservedMetrics
          ? {
              ...(ownerStyle?.width == null || ownerStyle.width === 'auto'
                ? { width: reservedMetrics.width }
                : {}),
              ...(!flexibleHeight &&
              (ownerStyle?.height == null || ownerStyle.height === 'auto')
                ? { height: reservedMetrics.height }
                : {}),
            }
          : undefined
      }
      metadata={metadata}
    >
      <Portal
        hostName={hostName}
        name={getLivePortalName(screenId, id, groupId)}
        style={[styles.livePortal, portalStyle]}
      >
        <View
          nativeID={hostName ? getLiveContentMarkerId(hostName) : undefined}
          collapsable={false}
          accessible={false}
          pointerEvents="none"
          style={styles.contentMarker}
        />
        <SharedElementPresentationContext.Provider value={presentation}>
          {children}
        </SharedElementPresentationContext.Provider>
      </Portal>
    </SharedElementRegistration>
  );
});

function LiveSharedElementTarget({
  id,
  groupId,
  style,
  transition = defaultTransition,
  hostStyle,
  metadata,
}: SharedElementTargetProps) {
  const screenId = useScreenId();
  return (
    <SharedElementRegistration
      id={id}
      groupId={groupId}
      transition={transition}
      style={style}
      metadata={metadata}
    >
      <PortalHost
        name={getLiveDestinationHostName(screenId, id, groupId)}
        style={[styles.liveHost, hostStyle]}
      />
    </SharedElementRegistration>
  );
}

export const SharedElement = Object.assign(LiveSharedElement, {
  Target: LiveSharedElementTarget,
});

const styles = StyleSheet.create({
  wrapper: {},
  liveHost: {
    ...StyleSheet.absoluteFill,
  },
  livePortal: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  contentMarker: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});
