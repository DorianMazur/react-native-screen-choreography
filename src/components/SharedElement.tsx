import { SharedElementPresentationContext } from '../core/SharedElementPresentation';
import type { SharedElementEndpoint } from '../core/SharedElementPresentation';
import {
  type ReactNode,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  memo,
} from 'react';
import { type StyleProp, type ViewStyle, StyleSheet } from 'react-native';
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
} from '../core/ChoreographyContext';
import { useScreenId } from '../core/screenIdContext';
import {
  getLiveDestinationHostName,
  getLiveOverlayHostName,
  getLivePortalName,
} from '../core/liveHostNames';
import { defaultTransition } from '../transitions/makeTransition';

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
  metadata?: unknown;
}

/**
 * Wraps content participating in a shared transition. Registration is
 * stable per `(id, groupId, screenId)`; the coordinator captures a frozen
 * `ElementPresentation` via `getPresentation()` at session start, so re-renders or
 * prop changes never affect an in-flight overlay.
 */
function SharedElementRegistration({
  id,
  groupId,
  transition,
  children,
  style,
  layoutStyle,
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
  // Latest-value refs mutated during render so getPresentation() always
  // reflects current props without forcing re-registration.
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

  // Stable registration. Effect deps are all stable identities.
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
  if (!choreography || !actions) {
    throw new Error(
      'SharedElement must be used within a <ChoreographyProvider>'
    );
  }
  const session = choreography.activeSession;
  const pair =
    session?.state === 'active' && session.groupId === props.groupId
      ? (session.pairs.find(
          (candidate) =>
            candidate.id === props.id &&
            (candidate.source.screenId === screenId ||
              candidate.target.screenId === screenId)
        ) ?? null)
      : null;

  return (
    <LiveSharedElementContent
      {...props}
      screenId={screenId}
      pair={pair}
      direction={pair ? session!.direction : null}
      sourceScreenId={pair ? session!.sourceScreenId : null}
      targetScreenId={pair ? session!.targetScreenId : null}
      progress={choreography.progress}
      getSettledScreenId={actions.getSettledScreenId}
    />
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
  pair,
  direction,
  sourceScreenId,
  targetScreenId,
  progress,
  getSettledScreenId,
}: SharedElementProps & {
  screenId: string;
  pair: ElementTransitionPair | null;
  direction: TransitionSessionData['direction'] | null;
  sourceScreenId: string | null;
  targetScreenId: string | null;
  progress: TransitionSessionData['progress'];
  getSettledScreenId: () => string | null;
}) {
  const wasParticipatingRef = useRef(false);
  const endpoints = useRef<{
    collapsed: SharedElementEndpoint;
    expanded: SharedElementEndpoint;
  } | null>(null);
  const settledTargetScreenIdRef = useRef<string | null>(null);
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
      ? { collapsed: source, expanded: target }
      : { collapsed: target, expanded: source };
  }, [pair, direction]);

  // The endpoint wrapper is never hidden for live pairs, so the single Fabric
  // commit that unmounts the overlay host and retargets this portal lands the
  // view in a visible host at the same window bounds — no gap frame.
  let hostName: string | undefined;
  if (participates) {
    wasParticipatingRef.current = true;
    // Retain presentation data only, never a popped screen's registration/ref.
    endpoints.current = activeEndpoints;
    hostName = getLiveOverlayHostName(
      sourceScreenId!,
      targetScreenId!,
      id,
      groupId ?? 'default'
    );
  } else {
    if (wasParticipatingRef.current) {
      wasParticipatingRef.current = false;
      const settledScreenId = getSettledScreenId();
      settledTargetScreenIdRef.current =
        settledScreenId !== screenId ? settledScreenId : null;
    }
    hostName = settledTargetScreenIdRef.current
      ? getLiveDestinationHostName(
          settledTargetScreenIdRef.current,
          id,
          groupId
        )
      : undefined;
  }

  const ownerStyle = useMemo(() => StyleSheet.flatten(style), [style]);
  const initial = useMemo(
    () => ({ metrics: null, metadata, style: ownerStyle ?? undefined }),
    [metadata, ownerStyle]
  );
  const settled = settledTargetScreenIdRef.current
    ? ('expanded' as const)
    : ('collapsed' as const);
  const presentationProgress = useDerivedValue(() =>
    participates ? progress.value : settled === 'expanded' ? 1 : 0
  );
  const collapsed = endpoints.current?.collapsed ?? initial;
  const expanded = endpoints.current?.expanded ?? initial;
  const presentation = useMemo(
    () => ({
      progress,
      presentationProgress,
      transitioning: participates,
      direction,
      collapsed,
      expanded,
      settled,
    }),
    [
      progress,
      presentationProgress,
      participates,
      direction,
      collapsed,
      expanded,
      settled,
    ]
  );
  const reservedMetrics = hostName
    ? endpoints.current?.collapsed.metrics
    : null;
  const flexibleHeight =
    (ownerStyle?.flex ?? 0) > 0 || (ownerStyle?.flexGrow ?? 0) > 0;
  return (
    <SharedElementRegistration
      id={id}
      groupId={groupId}
      transition={transition}
      style={style}
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
});
