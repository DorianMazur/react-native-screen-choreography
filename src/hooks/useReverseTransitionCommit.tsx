import { useCallback, useEffect, useRef, useState } from 'react';
import { findNodeHandle, StyleSheet, type View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  animateOwnedProgress,
  type ProgressOwnership,
} from '../core/ProgressOwnership';
import {
  updateReverseHandoff,
  type ReverseHandoffState,
} from '../core/ReverseTransitionHandoff';
import { ReverseTransitionController } from '../core/ReverseTransitionController';
import type { NavigationSessionController } from '../core/NavigationSessionController';
import type { CommitBackNavigation } from '../core/navigationCommit';
import { RetainedView } from '../native/RetainedView';
import { FAST_SPRING } from '../core/constants';
import { deriveScreenOpacity } from '../core/screenVisibility';
import type {
  InteractiveTransitionSettleOptions,
  TransitionSessionData,
} from '../types';

export interface ReverseCommitRequest {
  sessionId: string;
  token: number;
  navigateBack: CommitBackNavigation;
  options?: InteractiveTransitionSettleOptions;
}

interface CaptureRequest {
  sessionId: string;
  sourceTag: number;
  resolve: (ready: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ReverseCommitDependencies {
  progress: SharedValue<number>;
  progressOwnership: ProgressOwnership;
  navigationController: NavigationSessionController;
  interactionOwner: SharedValue<string | null>;
  getSession: () => TransitionSessionData | null;
  completeTransition: (sessionId: string) => void;
  cancelTransition: (sessionId: string) => void;
}

function RetainedScreen({
  request,
  progress,
}: {
  request: CaptureRequest;
  progress: SharedValue<number>;
}) {
  // The captured content is inside the screen's reveal wrapper. Reproduce that
  // wrapper's opacity while the native route is removed beneath this image.
  const style = useAnimatedStyle(() => ({
    opacity: deriveScreenOpacity(
      'backward',
      'source',
      'active',
      progress.value
    ),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <RetainedView
        sourceTag={request.sourceTag}
        captureId={request.sessionId}
        style={StyleSheet.absoluteFill}
        onCaptured={({ nativeEvent }) => {
          if (nativeEvent.captureId === request.sessionId) {
            request.resolve(nativeEvent.success);
          }
        }}
      />
    </Animated.View>
  );
}

/** Runs in the provider, so accepted back navigation may unmount its caller. */
export function useReverseTransitionCommit({
  progress,
  progressOwnership,
  navigationController,
  interactionOwner,
  getSession,
  completeTransition,
  cancelTransition,
}: ReverseCommitDependencies) {
  const reverseHandoff = useSharedValue<ReverseHandoffState | null>(null);
  const [reverseController] = useState(() => new ReverseTransitionController());
  const screens = useRef(
    new Map<string, React.RefObject<React.ComponentRef<typeof View> | null>>()
  );
  const captureRef = useRef<CaptureRequest | null>(null);
  const [capture, setCapture] = useState<CaptureRequest | null>(null);
  const mounted = useRef(true);
  const settlementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releasePresentation = useCallback((sessionId: string) => {
    const request = captureRef.current;
    if (request?.sessionId === sessionId) {
      request.resolve(false);
      captureRef.current = null;
      if (mounted.current) setCapture(null);
    }
    if (settlementTimer.current !== null) {
      clearTimeout(settlementTimer.current);
      settlementTimer.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const registeredScreens = screens.current;
    return () => {
      mounted.current = false;
      reverseController.dispose();
      scheduleOnUI(() => {
        'worklet';
        reverseHandoff.value = null;
      });
      registeredScreens.clear();
    };
  }, [reverseController, reverseHandoff]);

  const registerScreenPresentation = useCallback(
    (
      screenId: string,
      ref: React.RefObject<React.ComponentRef<typeof View> | null>
    ) => {
      screens.current.set(screenId, ref);
      return () => {
        const session = getSession();
        if (session && session.sourceScreenId === screenId) {
          if (!reverseController.noteSourceUnmount(session.id, screenId)) {
            reverseController.cancelBeforeCommit(session.id);
          }
        }
        if (screens.current.get(screenId) === ref)
          screens.current.delete(screenId);
      };
    },
    [getSession, reverseController]
  );

  const commitReverseTransition = useCallback(
    (request: ReverseCommitRequest): Promise<void> => {
      const { sessionId, token, navigateBack, options = {} } = request;
      const session = getSession();
      if (
        session?.id !== sessionId ||
        session.direction !== 'backward' ||
        !progressOwnership.isCurrent(token, sessionId)
      )
        return Promise.resolve();

      if (reverseController.owns(sessionId)) return Promise.resolve();
      const current = () =>
        mounted.current && progressOwnership.isCurrent(token, sessionId);
      const { owner, handoff } = progressOwnership;
      const targetScreenId = session.targetScreenId;
      scheduleOnUI(() => {
        'worklet';
        if (owner.value !== token) return;
        reverseHandoff.value = {
          sessionId,
          token,
          targetScreenId,
          animationFinished: false,
          navigationPresented: false,
          completed: false,
        };
      });
      const markAnimationFinished = () => {
        'worklet';
        updateReverseHandoff(
          reverseHandoff,
          owner,
          handoff,
          interactionOwner,
          sessionId,
          token,
          'animationFinished'
        );
      };
      return reverseController.start({
        sessionId,
        sourceScreenId: session.sourceScreenId,
        targetScreenId: session.targetScreenId,
        isCurrent: current,
        preparePresentation: () => {
          // Live portals keep their original React owner. Do not rasterize live
          // content or remove its owner during a gesture settlement.
          if (session.pairs.some((pair) => pair.transition.mode === 'live')) {
            return Promise.resolve(false);
          }
          const node = screens.current.get(session.sourceScreenId)?.current;
          const sourceTag = node ? findNodeHandle(node) : null;
          if (!sourceTag) return Promise.resolve(false);
          return new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (ready: boolean) => {
              if (settled) return;
              settled = true;
              clearTimeout(retention.timeout);
              if (!ready && captureRef.current === retention) {
                captureRef.current = null;
                if (mounted.current) setCapture(null);
              }
              resolve(ready && current());
            };
            const retention: CaptureRequest = {
              sessionId,
              sourceTag,
              resolve: finish,
              timeout: setTimeout(() => finish(false), 150),
            };
            captureRef.current = retention;
            setCapture(retention);
          });
        },
        commitNavigation: async () => {
          const result = await navigateBack();
          // Core bindings may be void; the bundled navigation adapters always
          // return the checked removal/native-presentation result.
          const outcome = result ?? { removed: true, presented: false };
          if (outcome.removed && current()) {
            scheduleOnUI(() => {
              'worklet';
              updateReverseHandoff(
                reverseHandoff,
                owner,
                handoff,
                interactionOwner,
                sessionId,
                token,
                'navigationPresented'
              );
            });
          }
          return outcome;
        },
        animate: (onFinished) => {
          const onComplete = () => {
            if (current()) onFinished();
          };
          animateOwnedProgress({
            ownership: progressOwnership,
            token,
            sessionId,
            progress,
            target: 0,
            spring: {
              ...FAST_SPRING,
              ...options.spring,
              ...(options.velocity === undefined
                ? {}
                : { velocity: -options.velocity }),
            },
            duration: options.duration,
            handoffOnComplete: false,
            onCompleteUI: markAnimationFinished,
            onComplete,
          });
          if (options.duration) {
            settlementTimer.current = setTimeout(() => {
              if (!current()) return;
              scheduleOnUI(() => {
                'worklet';
                if (owner.value !== token) return;
                progress.value = 0;
                markAnimationFinished();
                scheduleOnRN(onComplete);
              });
            }, options.duration + 50);
          }
        },
        handoff: () => {
          const finish = () => {
            if (current()) {
              navigationController.releaseNavigationLock();
              completeTransition(sessionId);
            }
          };
          scheduleOnUI(() => {
            'worklet';
            if (owner.value !== token) return;
            // The controller can also establish removal from source-unmount
            // evidence when a route-scoped adapter loses access to its state.
            updateReverseHandoff(
              reverseHandoff,
              owner,
              handoff,
              interactionOwner,
              sessionId,
              token,
              'navigationPresented'
            );
            scheduleOnRN(finish);
          });
        },
        cancel: () => cancelTransition(sessionId),
        releasePresentation: () => releasePresentation(sessionId),
      });
    },
    [
      cancelTransition,
      completeTransition,
      getSession,
      interactionOwner,
      navigationController,
      progress,
      progressOwnership,
      releasePresentation,
      reverseController,
      reverseHandoff,
    ]
  );

  return {
    reverseController,
    commitReverseTransition,
    registerScreenPresentation,
    retainedPresentation: capture ? (
      <RetainedScreen request={capture} progress={progress} />
    ) : null,
  };
}
