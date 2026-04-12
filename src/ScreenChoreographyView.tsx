import type { ColorValue, ViewProps } from 'react-native';

type Props = ViewProps & {
  color?: ColorValue;
};

export function ScreenChoreographyView(_props: Props): never {
  throw new Error(
    "'react-native-screen-choreography' is only supported on native platforms."
  );
}
