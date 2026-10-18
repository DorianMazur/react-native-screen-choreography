import type { ComponentType, ReactNode } from 'react';
import type { ColorValue } from 'react-native';

export type TrayParamList = Record<string, unknown>;
export type TrayRoute<P extends TrayParamList, N extends keyof P = keyof P> = {
  [K in N]: { key: string; name: K; params: P[K] };
}[N];

type Destination<P extends TrayParamList> = {
  [K in keyof P & string]: undefined extends P[K]
    ? [name: K, params?: P[K]]
    : [name: K, params: P[K]];
}[keyof P & string];

export interface TrayNavigationOptions {
  /** Match this group on the current and pushed screens. Back reverses it. */
  groupId: string;
}

type PushDestination<P extends TrayParamList> = {
  [K in keyof P & string]: undefined extends P[K]
    ? [name: K, params?: P[K], options?: TrayNavigationOptions]
    : [name: K, params: P[K], options?: TrayNavigationOptions];
}[keyof P & string];

export interface TrayNavigation<P extends TrayParamList> {
  /** Open a new root. While closing, wait for native dismissal first. */
  present(...destination: Destination<P>): void;
  push(...destination: PushDestination<P>): void;
  replace(...destination: Destination<P>): void;
  back(): void;
  popToRoot(): void;
  dismiss(): void;
}

export interface TrayState<P extends TrayParamList> {
  readonly route: TrayRoute<P> | undefined;
  readonly depth: number;
  readonly isPresented: boolean;
}

export interface TrayScreenProps<
  P extends TrayParamList,
  N extends keyof P = keyof P,
> {
  route: TrayRoute<P, N>;
  tray: TrayNavigation<P>;
}

export interface TrayScreenOptions {
  /** Defaults to the declared screen name. */
  title?: string;
  /** Fill the available window, keeping the supplied insets inside the sheet. */
  presentation?: 'tray' | 'fullScreen';
}

export interface TrayScreenDeclarationProps<
  P extends TrayParamList,
  N extends keyof P & string = keyof P & string,
> {
  name: N;
  /** Define outside render to preserve each view's local state. */
  component: ComponentType<TrayScreenProps<P, NoInfer<N>>>;
  options?: TrayScreenOptions;
}

export interface TrayProviderProps {
  /** App content and exactly one direct Tray.Stack (fragments are supported). */
  children: ReactNode;
}

export interface TrayHeaderIconProps {
  /** The stack's textColor. */
  color: ColorValue;
  /** Suggested icon size in points; the button keeps its 44-point hit area. */
  size: number;
}

export type TrayAnimationConfig =
  | {
      type: 'timing';
      /** Milliseconds. Defaults to 240. */
      duration?: number;
    }
  | {
      type: 'spring';
      /** Higher values pull toward the destination more strongly. Defaults to 300. */
      stiffness?: number;
      /** Higher values reduce oscillation. Defaults to 30. */
      damping?: number;
    };

export interface TrayStackProps {
  /** Tray.Screen declarations, optionally grouped in fragments. */
  children: ReactNode;
  appearance?: 'floating' | 'sheet';
  /** Supply safe-area insets from your app. No safe-area provider is required. */
  topInset?: number;
  bottomInset?: number;
  horizontalInset?: number;
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  /** Icon content only. The stack owns the Back button and its accessibility. */
  renderBackIcon?: (props: TrayHeaderIconProps) => ReactNode;
  /** Icon content only. The stack owns the Close button and its accessibility. */
  renderCloseIcon?: (props: TrayHeaderIconProps) => ReactNode;
  /** Card resizing, header transitions, and page crossfades. Native dragging/dismissal is separate. */
  animation?: TrayAnimationConfig;
  /** Called only after the native sheet confirms dismissal. */
  onDismiss?: () => void;
}
