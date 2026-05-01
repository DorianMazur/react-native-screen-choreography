import { useContext } from 'react';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from './ChoreographyContext';

/**
 * Access the choreography context.
 * Must be used within a <ChoreographyProvider>.
 */
export function useChoreography(): ChoreographyContextType {
  const ctx = useContext(ChoreographyContext);
  if (!ctx) {
    throw new Error(
      'useChoreography must be used within a <ChoreographyProvider>'
    );
  }
  return ctx;
}
