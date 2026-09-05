import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import { isSingleRouteBack } from '../core/removalAction';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from './ChoreographyScreenBase';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';

export type { ChoreographyScreenProps } from './ChoreographyScreenBase';

export function ChoreographyScreen(props: ChoreographyScreenProps) {
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const { interceptRemoval, preventRemove, sourceScreenId, sourceRouteKey } =
    useChoreographyScreenRemoval({
      screenId: props.screenId,
      legacyGroupId: routeParams._choreographyGroup as string | undefined,
      legacySourceScreenId: routeParams._choreographySourceScreen as
        | string
        | undefined,
    });

  usePreventRemove(preventRemove, ({ data }) => {
    const resume = () => navigation.dispatch(data.action);
    const canAnimate = isSingleRouteBack(
      data.action,
      navigation.getState(),
      route.key,
      sourceScreenId,
      sourceRouteKey
    );
    const isRemoved = () =>
      !navigation
        .getState()
        ?.routes.some((candidate) => candidate.key === route.key);
    if (!interceptRemoval(resume, canAnimate, isRemoved)) resume();
  });

  return <ChoreographyScreenBase {...props} />;
}
