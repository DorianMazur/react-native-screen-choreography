import * as navigation from '@react-navigation/native';
import { makeTrayIntegration } from '../tray/navigator';

export const { createTrayNavigator, useTraySettled } =
  makeTrayIntegration(navigation);
