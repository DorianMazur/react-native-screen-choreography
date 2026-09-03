import { useCallback, useContext } from 'react';
import { ChoreographyActionsContext } from '../core/ChoreographyContext';
import { useScreenId } from '../core/screenIdContext';

export function useChoreographyBlocker() {
  const actions = useContext(ChoreographyActionsContext);
  if (!actions) {
    throw new Error(
      'useChoreographyBlocker must be used within a <ChoreographyProvider>'
    );
  }

  const screenId = useScreenId();
  const acquire = useCallback(
    () => actions.acquireScreenBlocker(screenId),
    [actions, screenId]
  );

  return { acquire };
}
