import type { ReactNode } from 'react';
import type {
  HeaderPresentation,
  PageOptions,
  LifecycleDetails,
  NavigatorOptions,
} from './presentationTypes';
export type {
  TrayAnimationConfig,
  TrayKeyboardState,
} from './presentationTypes';
import type {
  DefaultNavigatorOptions,
  NavigationProp,
  ParamListBase,
  RouteProp,
  StackActionHelpers,
  StackNavigationState,
  StackRouterOptions,
} from '@react-navigation/native';

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
export type TrayNavigatorOptions = NavigatorOptions<
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

export type TrayDescriptor = TrayScreenProps<ParamListBase> & {
  options: TrayScreenOptions;
  render(): ReactNode;
};
