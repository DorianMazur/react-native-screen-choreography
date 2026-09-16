import { useCallback, useEffect, useRef, useState } from 'react';
import { type View } from 'react-native';
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  animateOwnedProgress,
  setOwnedProgress,
  type ProgressOwnership,
} from '../core/ProgressOwnership';
import {
  updateReverseHandoff,
  type ReverseHandoffState,
} from '../core/ReverseTransitionHandoff';
import { ReverseTransitionController } from '../core/ReverseTransitionController';
import type { NavigationSessionController } from '../core/NavigationSessionController';
import type { CommitBackNavigation } from '../core/navigationCommit';
import { resolveSpringConfig } from '../core/constants';
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

interface ReverseCommitDependencies {
  progress: SharedValue<number>;
  progressOwnership: ProgressOwnership;
  navigationController: NavigationSessionController;
  interactionOwner: SharedValue<string | null>;
  getSession: () => TransitionSessionData | null;
  completeTransition: (sessionId: string) => void;
  cancelTransition: (sessionId: string) => void;
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
  const progressOwner = progressOwnership.owner;
  const [reverseController] = useState(() => new ReverseTransitionController());
  const [interruptibleReturnSessionId, setInterruptibleReturnSessionId] =
    useState<string | null>(null);
  const commitNearEndpoint = useCallback(
    (sessionId: string) => reverseController.commitNearEndpoint(sessionId),
    [reverseController]
  );
  useAnimatedReaction(
    () => {
      const state = reverseHandoff.value;
      // Start native dismissal during the remaining quarter of the motion.
      // Input still waits for confirmed removal; progress alone is not readiness.
      return state &&
        progressOwner.value === state.token &&
        progress.value <= 0.25
        ? state.sessionId
        : null;
    },
    (sessionId, previousSessionId) => {
      if (sessionId && sessionId !== previousSessionId)
        scheduleOnRN(commitNearEndpoint, sessionId);
    }
  );
  const screens = useRef(
    new Map<string, React.RefObject<React.ComponentRef<typeof View> | null>>()
  );
  useEffect(() => {
    const registeredScreens = screens.current;
    return () => {
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
        if (session) {
          if (
            !reverseController.noteSourceUnmount(session.id, screenId) &&
            session.sourceScreenId === screenId
          ) {
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
        !progressOwnership.isCurrent(token, sessionId)
      )
        return Promise.resolve();

      if (reverseController.owns(sessionId)) return Promise.resolve();
      setInterruptibleReturnSessionId(null);
      const current = () => progressOwnership.isCurrent(token, sessionId);
      const { owner, handoff } = progressOwnership;
      // Returning can also cancel a forward session that has not settled yet.
      const cancellingForward = session.direction === 'forward';
      const sourceScreenId = cancellingForward
        ? session.targetScreenId
        : session.sourceScreenId;
      const targetScreenId = cancellingForward
        ? session.sourceScreenId
        : session.targetScreenId;
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
      const markNavigationRemoved = () => {
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
      };
      return reverseController.start({
        sessionId,
        sourceScreenId,
        targetScreenId,
        isCurrent: current,
        commitNavigation: async () => {
          const result = await navigateBack();
          // Core bindings may be void; the bundled navigation adapters always
          // return the checked removal/native-presentation result.
          return result ?? { removed: true, presented: false };
        },
        onNavigationRemoved: () => {
          if (!current()) return;
          markNavigationRemoved();
          // Wake queued navigation even if focus changed before removal resolved.
          setInterruptibleReturnSessionId(sessionId);
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
              ...resolveSpringConfig(options.spring),
              ...(options.velocity === undefined
                ? {}
                : { velocity: -options.velocity }),
            },
            duration: options.duration,
            handoffOnComplete: false,
            onCompleteUI: markAnimationFinished,
            onComplete,
          });
        },
        settleToTarget: () => {
          scheduleOnUI(() => {
            'worklet';
            if (owner.value !== token) return;
            cancelAnimation(progress);
            progress.value = 0;
            markAnimationFinished();
          });
        },
        handoff: () => {
          if (!current()) return;
          markNavigationRemoved();
          navigationController.releaseNavigationLock();
          if (cancellingForward) cancelTransition(sessionId);
          else completeTransition(sessionId);
        },
        cancel: () => {
          if (!current()) return;
          if (cancellingForward) {
            // A rejected pop leaves the detail mounted: restore that endpoint.
            setOwnedProgress(progressOwnership, token, sessionId, progress, 1);
            completeTransition(sessionId);
          } else {
            cancelTransition(sessionId);
          }
        },
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
      reverseController,
      reverseHandoff,
    ]
  );

  return {
    reverseController,
    reverseHandoff,
    interruptibleReturnSessionId,
    commitReverseTransition,
    registerScreenPresentation,
  };
}
