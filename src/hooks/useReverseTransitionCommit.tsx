import { useCallback, useEffect, useRef, useState } from 'react';
import { type View } from 'react-native';
import {
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
import { FAST_SPRING } from '../core/constants';
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
  const [reverseController] = useState(() => new ReverseTransitionController());
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
        progressOwnership.isCurrent(token, sessionId);
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
    commitReverseTransition,
    registerScreenPresentation,

  };
}
