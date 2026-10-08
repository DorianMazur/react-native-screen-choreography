import { useInsertionEffect, useRef, useState } from 'react';

/** Keeps command identity stable without exposing callbacks from uncommitted renders. */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const callbackRef = useRef(callback);
  // Publish only committed bindings, before a descendant's layout effect can
  // invoke the command. A layout effect here would run after the descendant's.
  useInsertionEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  const [stableCallback] = useState(
    () =>
      (...args: Args): Result =>
        callbackRef.current(...args)
  );
  return stableCallback;
}
