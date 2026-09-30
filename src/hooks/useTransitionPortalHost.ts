import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyContext } from '../core/ChoreographyContext';
import type { NativePresentation } from '../core/nativePresentation';

/** A missing Teleport host sends content back to its owner, which may be hidden. */
export function useRetainedPortalHost(
  requestedHostName: string | undefined,
  sessionId: string | null,
  presentation: NativePresentation | undefined
) {
  const previousHost = useRef<string | undefined>(undefined);
  const current = useRef<{
    id: string | null;
    presentation: NativePresentation;
  } | null>(null);
  const [attachedSessionId, setAttachedSessionId] = useState<string | null>(
    null
  );
  useLayoutEffect(() => {
    current.current = presentation ? { id: sessionId, presentation } : null;
    return () => {
      current.current = null;
    };
  }, [sessionId, presentation]);
  const acceptAttachment = useCallback((id: string) => {
    if (
      current.current?.id === id &&
      current.current.presentation.valid.value
    ) {
      setAttachedSessionId(id);
    }
  }, []);
  const phase = presentation?.phase;
  const valid = presentation?.valid;
  useAnimatedReaction(
    () => (valid?.value && phase && phase.value >= 1 ? sessionId : null),
    (readyId, previousId) => {
      if (readyId !== null && readyId !== previousId) {
        scheduleOnRN(acceptAttachment, readyId);
      }
    }
  );
  // Android gates the receiving host's draw natively. On iOS, registration can
  // precede window attachment, so even the original owner waits for the ack.
  const hostName =
    (Platform.OS === 'android' && previousHost.current === undefined) ||
    !presentation ||
    attachedSessionId === sessionId
      ? requestedHostName
      : previousHost.current;
  useLayoutEffect(() => {
    previousHost.current = hostName;
  }, [hostName]);
  return hostName;
}

/**
 * Returns the Teleport host name an app-owned `Portal` should use to move
 * content into a renderer during the active session. The name switches together
 * with retained shared-element content, after the native overlay attaches, so
 * the moved content appears when the overlay is revealed instead of vanishing
 * into a host that is not presented yet.
 */
export function useTransitionPortalHost(
  hostName: string | undefined
): string | undefined {
  const session = useContext(ChoreographyContext)?.activeSession ?? null;
  const presentation =
    session && !session.reducedMotion ? session.presentation : undefined;
  return useRetainedPortalHost(hostName, session?.id ?? null, presentation);
}
