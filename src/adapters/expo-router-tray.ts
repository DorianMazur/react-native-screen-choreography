import * as navigation from 'expo-router/react-navigation';
import type {
  DefaultNavigatorOptions,
  NavigationProp,
  ParamListBase,
  RouteProp,
  StackActionHelpers,
  StackNavigationState,
  StackRouterOptions,
  TypedNavigator,
} from 'expo-router/react-navigation';
import type {
  HeaderPresentation,
  PageOptions,
  LifecycleDetails,
  NavigatorOptions,
} from '../tray/presentationTypes';
import { makeTrayIntegration } from '../tray/navigator';

export type TrayNavigationProp<
  P extends ParamListBase,
  N extends keyof P = keyof P,
> = NavigationProp<
  P,
  N,
  undefined,
  StackNavigationState<P>,
  TrayScreenOptions
> &
  StackActionHelpers<P>;

export type TrayScreenProps<
  P extends ParamListBase,
  N extends keyof P = keyof P,
> = {
  route: RouteProp<P, N>;
  navigation: TrayNavigationProp<P, N>;
};

export type TrayHeaderProps<
  P extends ParamListBase = ParamListBase,
  N extends keyof P = keyof P,
> = TrayScreenProps<P, N> & HeaderPresentation;
export interface TrayScreenOptions extends PageOptions<TrayHeaderProps> {}
export type TrayLifecycleDetails = LifecycleDetails<
  RouteProp<ParamListBase>,
  TrayScreenOptions
>;
type TrayNavigatorOptions = NavigatorOptions<
  TrayHeaderProps,
  TrayLifecycleDetails
>;

export type TrayNavigatorProps = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  StackNavigationState<ParamListBase>,
  TrayScreenOptions,
  {},
  TrayNavigationProp<ParamListBase>
> &
  StackRouterOptions &
  TrayNavigatorOptions;

type ExpoTrayNavigator<P extends ParamListBase> = TypedNavigator<{
  ParamList: P;
  NavigatorID: string | undefined;
  State: StackNavigationState<P>;
  ScreenOptions: TrayScreenOptions;
  EventMap: {};
  NavigationList: { [N in keyof P]: TrayNavigationProp<P, N> };
  Navigator: React.ComponentType<TrayNavigatorProps>;
}>;

// Expo brands its navigation types separately. Bind the runtime and public types
// to the same copy of React Navigation that owns the app's container.
const integration = makeTrayIntegration(
  navigation as unknown as Parameters<typeof makeTrayIntegration>[0]
);
export const createTrayNavigator =
  integration.createTrayNavigator as unknown as <
    const P extends ParamListBase,
  >() => ExpoTrayNavigator<P>;
export const useTraySettled: () => boolean = integration.useTraySettled;
