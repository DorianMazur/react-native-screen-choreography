import React, {
  type ReactNode,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import { type StyleProp, type ViewStyle, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Portal, PortalHost } from 'react-native-teleport';
import type {
  ElementPresentation,
  LiveTransition,
  SharedElementTransition,
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
import { defaultLiveTransition } from '../transitions/makeLiveTransition';

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

export interface LiveSharedElementProps {
  id: string;
  groupId?: string;
  /** Reuse the same factory result on both live endpoints, including for back. */
  transition?: LiveTransition;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Payload layout overrides, applied after the portal's fill defaults. */
  portalStyle?: StyleProp<ViewStyle>;
  /** Captured by reference at session start; narrow in the live renderer. */
  metadata?: unknown;
}

export interface LiveSharedElementTargetProps {
  id: string;
  groupId?: string;
  /** Reuse the owner's factory result for consistent forward and back motion. */
  transition?: LiveTransition;
  style?: StyleProp<ViewStyle>;
  /** Receiving host layout, independent of the measured wrapper's style. */
  hostStyle?: StyleProp<ViewStyle>;
  /** Captured by reference at session start; narrow in the live renderer. */
  metadata?: unknown;
}

interface SharedElementRegistrationProps extends SharedElementProps {
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
  metadata,
}: SharedElementRegistrationProps) {
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
  const metadataRef = useRef<unknown>(metadata);
  metadataRef.current = metadata;
  const getPresentation = useCallback<() => ElementPresentation>(
    () => ({
      content: childrenRef.current,
      style: styleRef.current,
      transition: transitionRef.current,
      metadata: metadataRef.current,
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

function SharedElementRoot(props: SharedElementProps) {
  return <SharedElementRegistration {...props} />;
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
  transition = defaultLiveTransition,
  portalStyle,
  metadata,
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
    <SharedElementRegistration
      id={id}
      groupId={groupId}
      transition={transition}
      style={style}
      metadata={metadata}
    >
      <Portal
        hostName={hostName}
        name={getLivePortalName(screenId, id, groupId)}
        style={[styles.livePortal, portalStyle]}
      >
        {children}
      </Portal>
    </SharedElementRegistration>
  );
}

function LiveSharedElementTarget({
  id,
  groupId,
  style,
  transition = defaultLiveTransition,
  hostStyle,
  metadata,
}: LiveSharedElementTargetProps) {
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

export const SharedElement = Object.assign(SharedElementRoot, {
  Target: SharedElementTarget,
  Live: LiveSharedElement,
  LiveTarget: LiveSharedElementTarget,
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
