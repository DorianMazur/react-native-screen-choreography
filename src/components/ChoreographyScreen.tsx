import { useEffect, useRef } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from './ChoreographyScreenBase';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';

export type { ChoreographyScreenProps } from './ChoreographyScreenBase';

export function ChoreographyScreen(props: ChoreographyScreenProps) {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const dispatchingSelfRef = useRef(false);
  const interceptRemoval = useChoreographyScreenRemoval({
    screenId: props.screenId,
    legacyGroupId: routeParams._choreographyGroup as string | undefined,
    legacySourceScreenId: routeParams._choreographySourceScreen as
      | string
      | undefined,
  });

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event: any) => {
      if (dispatchingSelfRef.current) {
        dispatchingSelfRef.current = false;
        return;
      }

      const intercepted = interceptRemoval(() => {
        dispatchingSelfRef.current = true;
        navigation.dispatch(event.data.action);
      });

      if (intercepted) {
        event.preventDefault();
      }
    });
  }, [interceptRemoval, navigation]);

  return <ChoreographyScreenBase {...props} />;
}
