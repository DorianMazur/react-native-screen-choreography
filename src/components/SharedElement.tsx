import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import { type StyleProp, type ViewStyle, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { Portal, PortalHost } from 'react-native-teleport';
import type {
  ElementPresentation,
  SharedElementTransition,
  SharedElementTransitionRendererProps,
} from '../types';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
} from '../core/ChoreographyContext';
import { getExpansionProgress } from '../core/expansionProgress';
import { useScreenId } from '../core/screenIdContext';

interface SharedElementTargetContextValue {
  setTarget: (
    node: any,
    animatedRef: ReturnType<typeof useAnimatedRef<any>> | undefined
  ) => void;
}

const SharedElementTargetContext = React.createContext<
  SharedElementTargetContextValue | undefined
>(undefined);

export interface SharedElementTargetProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export interface SharedElementProps {
  /** Unique identifier for this shared element. Must match across screens. */
  id: string;
  /** Group identifier. Elements in the same group transition together. */
  groupId?: string;
  /** Renderer defining exactly how this shared pair animates. */
  transition: SharedElementTransition;
  /** Children to wrap. */
  children: React.ReactNode;
  /** Additional style for the wrapper. */
  style?: StyleProp<ViewStyle>;
}

export interface LiveSharedElementProps extends Omit<
  SharedElementProps,
  'transition'
> {}

export interface LiveSharedElementTargetProps {
  id: string;
  groupId?: string;
  style?: StyleProp<ViewStyle>;
}

function getLiveDestinationHostName(
  screenId: string,
  id: string,
  groupId?: string
) {
  return `screen-choreography:live:destination:${JSON.stringify([screenId, groupId, id])}`;
}

function getLiveOverlayHostName(
  sourceScreenId: string,
  targetScreenId: string,
  id: string,
  groupId: string
) {
  return `screen-choreography:live:overlay:${JSON.stringify([sourceScreenId, targetScreenId, groupId, id])}`;
}

function LiveSharedElementRenderer({
  id,
  groupId,
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  const sourceX = source.metrics.pageX;
  const sourceY = source.metrics.pageY;
  const sourceWidth = source.metrics.width;
  const sourceHeight = source.metrics.height;
  const targetX = target.metrics.pageX;
  const targetY = target.metrics.pageY;
  const targetWidth = target.metrics.width;
  const targetHeight = target.metrics.height;
  const timeline = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );
  const animatedStyle = useAnimatedStyle(() => {
    const heightProgress = getExpansionProgress(
      timeline.value,
      sourceHeight,
      targetHeight
    );

    return {
      left: interpolate(timeline.value, [0, 1], [sourceX, targetX], 'clamp'),
      top: interpolate(timeline.value, [0, 1], [sourceY, targetY], 'clamp'),
      width: interpolate(
        timeline.value,
        [0, 1],
        [sourceWidth, targetWidth],
        'clamp'
      ),
      height: interpolate(
        heightProgress,
        [0, 1],
        [sourceHeight, targetHeight],
        'clamp'
      ),
    };
  });

  return (
    <Animated.View style={[styles.liveOverlayHost, { zIndex }, animatedStyle]}>
      <PortalHost
        name={getLiveOverlayHostName(
          source.screenId,
          target.screenId,
          id,
          groupId
        )}
        style={styles.liveHost}
      />
    </Animated.View>
  );
}

const liveSharedElementTransition: SharedElementTransition = {
  zIndex: 100,
  mode: 'live',
  renderer: LiveSharedElementRenderer,
};

/**
 * Wraps content participating in a shared transition. Registration is
 * stable per `(id, groupId, screenId)`; the coordinator captures a frozen
 * `ElementPresentation` via `getPresentation()` at session start, so re-renders or
 * prop changes never affect an in-flight overlay.
 */
function SharedElementRoot({
  id,
  groupId,
  transition,
  children,
  style,
}: SharedElementProps) {
  const viewNodeRef = useRef<any>(null);
  const animatedRef = useAnimatedRef<any>();
  const targetNodeRef = useRef<any>(null);
  const targetAnimatedRefRef = useRef<
    ReturnType<typeof useAnimatedRef<any>> | undefined
  >(undefined);
  const actions = useContext(ChoreographyActionsContext);
  if (!actions) {
    throw new Error(
      'SharedElement must be used within a <ChoreographyProvider>'
    );
  }
  const { registerElement, unregisterElement, isElementHidden } = actions;
  const screenId = useScreenId();

  const flattenedStyle = useMemo(
    () => (style ? (StyleSheet.flatten(style) as ViewStyle) : undefined),
    [style]
  );
  // Latest-value refs mutated during render so getPresentation() always
  // reflects current props without forcing re-registration.
  const childrenRef = useRef<React.ReactNode>(children);
  childrenRef.current = children;
  const transitionRef = useRef<SharedElementTransition>(transition);
  transitionRef.current = transition;
  const styleRef = useRef<ViewStyle | undefined>(flattenedStyle);
  styleRef.current = flattenedStyle;
  const getPresentation = useCallback<() => ElementPresentation>(
    () => ({
      content: childrenRef.current,
      style: styleRef.current,
      transition: transitionRef.current,
    }),
    []
  );

  const getNode = useCallback(
    () => targetNodeRef.current ?? viewNodeRef.current,
    []
  );
  const getAnimatedRef = useCallback(
    () => targetAnimatedRefRef.current ?? animatedRef,
    [animatedRef]
  );
  const setTarget = useCallback<SharedElementTargetContextValue['setTarget']>(
    (node, nextAnimatedRef) => {
      targetNodeRef.current = node;
      targetAnimatedRefRef.current = node ? nextAnimatedRef : undefined;
    },
    []
  );
  const targetContextValue = useMemo(() => ({ setTarget }), [setTarget]);
  const setRefs = useCallback(
    (node: any) => {
      viewNodeRef.current = node;
      animatedRef(node);
    },
    [animatedRef]
  );

  // Stable registration. Effect deps are all stable identities.
  useEffect(() => {
    registerElement({
      id,
      groupId,
      screenId,
      ref: getNode,
      animatedRef,
      getAnimatedRef,
      metrics: null,
      getPresentation,
    });

    return () => {
      unregisterElement(id, screenId, groupId);
    };
  }, [
    id,
    groupId,
    screenId,
    getNode,
    animatedRef,
    getAnimatedRef,
    getPresentation,
    registerElement,
    unregisterElement,
  ]);

  const hidden = isElementHidden(id, screenId, groupId);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: hidden.value ? 0 : 1,
    };
  });

  return (
    <SharedElementTargetContext.Provider value={targetContextValue}>
      <Animated.View
        ref={setRefs}
        style={[styles.wrapper, style, animatedStyle]}
        collapsable={false}
      >
        {children}
      </Animated.View>
    </SharedElementTargetContext.Provider>
  );
}

function SharedElementTarget({ children, style }: SharedElementTargetProps) {
  const target = useContext(SharedElementTargetContext);
  if (!target) {
    throw new Error('SharedElement.Target must be nested in a <SharedElement>');
  }

  const animatedRef = useAnimatedRef<any>();
  const setRef = useCallback(
    (node: any) => {
      animatedRef(node);
      target.setTarget(node, animatedRef);
    },
    [animatedRef, target]
  );

  return (
    <Animated.View ref={setRef} style={style} collapsable={false}>
      {children}
    </Animated.View>
  );
}

function LiveSharedElement({
  id,
  groupId,
  children,
  style,
}: LiveSharedElementProps) {
  const choreography = useContext(ChoreographyContext);
  const actions = useContext(ChoreographyActionsContext);
  const screenId = useScreenId();
  const wasParticipatingRef = useRef(false);
  const settledTargetScreenIdRef = useRef<string | null>(null);
  const session = choreography?.activeSession ?? null;
  const participates = Boolean(
    session?.state === 'active' &&
    session.groupId === groupId &&
    session.pairs.some(
      (pair) =>
        pair.id === id &&
        (pair.source.screenId === screenId || pair.target.screenId === screenId)
    )
  );

  // The endpoint wrapper is never hidden for live pairs, so the single Fabric
  // commit that unmounts the overlay host and retargets this portal lands the
  // view in a visible host at the same window bounds — no gap frame.
  let hostName: string | undefined;
  if (participates) {
    wasParticipatingRef.current = true;
    hostName = getLiveOverlayHostName(
      session!.sourceScreenId,
      session!.targetScreenId,
      id,
      groupId ?? 'default'
    );
  } else {
    if (wasParticipatingRef.current) {
      wasParticipatingRef.current = false;
      const settledScreenId = actions?.getSettledScreenId() ?? null;
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

  return (
    <SharedElementRoot
      id={id}
      groupId={groupId}
      transition={liveSharedElementTransition}
      style={style}
    >
      <Portal
        hostName={hostName}
        name={`screen-choreography:live:${JSON.stringify([screenId, groupId, id])}`}
        style={styles.livePortal}
      >
        {children}
      </Portal>
    </SharedElementRoot>
  );
}

function LiveSharedElementTarget({
  id,
  groupId,
  style,
}: LiveSharedElementTargetProps) {
  const screenId = useScreenId();
  return (
    <SharedElementRoot
      id={id}
      groupId={groupId}
      transition={liveSharedElementTransition}
      style={style}
    >
      <PortalHost
        name={getLiveDestinationHostName(screenId, id, groupId)}
        style={styles.liveHost}
      />
    </SharedElementRoot>
  );
}

export const SharedElement = Object.assign(SharedElementRoot, {
  Target: SharedElementTarget,
  Live: LiveSharedElement,
  LiveTarget: LiveSharedElementTarget,
});

const styles = StyleSheet.create({
  wrapper: {},
  liveOverlayHost: {
    position: 'absolute',
    overflow: 'hidden',
  },
  liveHost: {
    ...StyleSheet.absoluteFill,
  },
  livePortal: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
