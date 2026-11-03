import type { ComponentType, ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export interface TrayKeyboardState {
  /** Positive keyboard height in points. Read on the UI thread; do not assign. */
  height: SharedValue<number>;
  /** Keyboard animation progress from 0 (hidden) to 1 (open). Do not assign. */
  progress: SharedValue<number>;
  /** True from opening until fully hidden, including interactive dismissal. */
  isVisible: boolean;
}

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
  /**
   * Push when the tray is open and idle. From the incoming screen/header, the
   * first push during a transition waits for completion. Further pushes,
   * preparation-time requests, and requests from inactive owners are ignored.
   */
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

export interface TrayFocusEffectOptions {
  /** Wait for native opening and screen transitions, including shared-element handoff. */
  afterTransition?: boolean;
}

export interface TrayScreenProps<
  P extends TrayParamList,
  N extends keyof P = keyof P,
> {
  route: TrayRoute<P, N>;
  tray: TrayNavigation<P>;
}

export interface TrayHeaderProps<
  P extends TrayParamList = TrayParamList,
  N extends keyof P & string = keyof P & string,
> extends TrayScreenProps<P, N> {
  title: string;
  canGoBack: boolean;
  /** Disable custom dismissal controls while true; tray.dismiss() remains available. */
  dismissDisabled: boolean;
  /** The stack's textColor. */
  color: ColorValue;
}

export interface TrayScreenOptions<
  P extends TrayParamList = TrayParamList,
  N extends keyof P & string = keyof P & string,
> {
  /** Defaults to the declared screen name. */
  title?: string;
  /** Fill the available window, keeping the supplied insets inside the sheet. */
  presentation?: 'tray' | 'fullScreen';
  /** Keep this content edge aligned while the card resizes. Inherits the stack anchor. */
  anchor?: 'top' | 'bottom';
  /** Replace the entire header. Return null for no header. Inherits the stack renderer. */
  renderHeader?: (props: TrayHeaderProps<P, N>) => ReactNode;
  /** Show the drag indicator above the header. Inherits the stack setting. */
  handleVisible?: boolean;
  /** The custom header's height until it first lays out. Defaults to 56; a header that renders nothing passes 0. */
  headerHeight?: number;
}

/** The screen a lifecycle event concerns. */
export interface TrayLifecycleDetails<P extends TrayParamList = TrayParamList> {
  route: TrayRoute<P, keyof P & string>;
  /** The screen's declared options, with the title and presentation defaults applied. */
  options: TrayScreenOptions<P> & {
    title: string;
    presentation: NonNullable<TrayScreenOptions['presentation']>;
  };
}

export interface TrayScreenDeclarationProps<
  P extends TrayParamList,
  N extends keyof P & string = keyof P & string,
> {
  name: N;
  /** Define outside render to preserve each view's local state. */
  component: ComponentType<TrayScreenProps<P, NoInfer<N>>>;
  options?: TrayScreenOptions<P, NoInfer<N>>;
}

export interface TrayProviderProps {
  /** App content and exactly one direct Tray.Stack (fragments are supported). */
  children: ReactNode;
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

export interface TrayStackProps<P extends TrayParamList = TrayParamList> {
  /** Tray.Screen declarations, optionally grouped in fragments. */
  children: ReactNode;
  appearance?: 'floating' | 'sheet';
  /** Keep this content edge aligned while the card resizes. Defaults to 'bottom'. */
  anchor?: 'top' | 'bottom';
  /** Supply safe-area insets from your app. No safe-area provider is required. */
  topInset?: number;
  bottomInset?: number;
  horizontalInset?: number;
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  /** Replace the entire header, including its buttons. Return null for no header. */
  renderHeader?: (props: TrayHeaderProps<P>) => ReactNode;
  /** Show the drag indicator above the header. Defaults to true; dragging stays enabled. */
  handleVisible?: boolean;
  /** Hide the handle and block user dismissal (drag, backdrop, Close, and Back at the root). Code can still call dismiss(). Defaults to false. */
  dismissDisabled?: boolean;
  /** Card resizing between screens, header transitions, and page crossfades. Native dragging/dismissal is separate. */
  animation?: TrayAnimationConfig;
  /**
   * How one full-screen screen replaces another. 'slide' also moves both pages sideways with the crossfade: forward,
   * the new page comes in from the right and the covered one leaves to the left; back, the reverse. Moves to and from
   * tray screens, and shared transitions, always crossfade. Defaults to 'fade'.
   */
  fullScreenTransition?: 'fade' | 'slide';
  /** Called when a new tray presentation begins, with the root screen it opens on. */
  onWillPresent?: (details: TrayLifecycleDetails<P>) => void;
  /** Called once per presentation, after the native sheet settles open, with the screen it settled on. */
  onPresent?: (details: TrayLifecycleDetails<P>) => void;
  /**
   * Called when an open tray moves to another screen, with the screen it moves to. Not called for the screen a
   * presentation opens on.
   */
  onNavigate?: (details: TrayLifecycleDetails<P>) => void;
  /** Called when closing begins, including a drag that commits to dismissal, with the screen being dismissed. */
  onWillDismiss?: (details: TrayLifecycleDetails<P>) => void;
  /** Called only after the native sheet confirms dismissal. */
  onDismiss?: () => void;
}
