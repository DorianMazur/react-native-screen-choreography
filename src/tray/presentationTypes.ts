import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export interface HeaderPresentation {
  dismiss(): void;
  title: string;
  canGoBack: boolean;
  dismissDisabled: boolean;
  color: ColorValue;
}

export interface TrayKeyboardState {
  height: SharedValue<number>;
  progress: SharedValue<number>;
  isVisible: boolean;
}

export interface PageOptions<Header> {
  title?: string;
  presentation?: 'tray' | 'fullScreen';
  anchor?: 'top' | 'bottom';
  renderHeader?: (props: Header) => ReactNode;
  handleVisible?: boolean;
  headerHeight?: number;
  contentHeaderHeight?: number;
}

export interface LifecycleDetails<Route, Options> {
  route: Route;
  options: Options & { title: string; presentation: 'tray' | 'fullScreen' };
}

export type TrayAnimationConfig =
  | { type: 'timing'; duration?: number }
  | { type: 'spring'; stiffness?: number; damping?: number };

export interface TrayContentHeaderProps {
  from: string;
  to: string;
  progress: SharedValue<number>;
}

export interface NavigatorOptions<Header, Details> {
  renderContentHeader?: (props: TrayContentHeaderProps) => ReactNode;
  appearance?: 'floating' | 'sheet';
  anchor?: 'top' | 'bottom';
  topInset?: number;
  bottomInset?: number;
  horizontalInset?: number;
  keyboardInset?: number;
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  renderHeader?: (props: Header) => ReactNode;
  handleVisible?: boolean;
  dismissDisabled?: boolean;
  animation?: TrayAnimationConfig;
  fullScreenTransition?: 'fade' | 'slide';
  onWillPresent?: (details: Details) => void;
  onPresent?: (details: Details) => void;
  onNavigate?: (details: Details) => void;
  onWillDismiss?: (details: Details) => void;
  onDismiss?: () => void;
}
