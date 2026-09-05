import React from 'react';
import type { ChoreographyNavigationOptions } from 'react-native-screen-choreography';

type ChoreographyModule = typeof import('react-native-screen-choreography');

export type DemoListScreenId =
  | 'GalleryList'
  | 'MusicList'
  | 'TokenList'
  | 'LivePlayerList';

export type DemoDetailDestination =
  | { screen: 'GalleryDetail'; params: { photoId: string } }
  | { screen: 'NowPlaying'; params: { trackId: string } }
  | { screen: 'TokenDetail'; params: { tokenId: string } }
  | { screen: 'LivePlayerDetail'; params?: undefined };

export interface ExampleNavigation {
  open: (screen: DemoListScreenId) => void;
  navigate: (
    destination: DemoDetailDestination,
    options?: ChoreographyNavigationOptions
  ) => Promise<void>;
  goBack: (options?: ChoreographyNavigationOptions) => Promise<void>;
}

export interface ExampleRuntime {
  ChoreographyScreen: ChoreographyModule['ChoreographyScreen'];
  SharedElement: ChoreographyModule['SharedElement'];
  StandInContainer: ChoreographyModule['StandInContainer'];
  StandInCrossfade: ChoreographyModule['StandInCrossfade'];
  StandInElement: ChoreographyModule['StandInElement'];
  resolveSurfaceStyle: ChoreographyModule['resolveSurfaceStyle'];
  useChoreographyProgress: ChoreographyModule['useChoreographyProgress'];
  useInteractiveTransition: ChoreographyModule['useInteractiveTransition'];
  useLatchedReveal: ChoreographyModule['useLatchedReveal'];
  useStaggeredReveal: ChoreographyModule['useStaggeredReveal'];
  SafeAreaView: React.ElementType;
  useSafeAreaInsets: () => {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  useExampleNavigation: (screenId: string) => ExampleNavigation;
}

let runtime: ExampleRuntime | null = null;

export function configureExampleRuntime(nextRuntime: ExampleRuntime) {
  runtime = nextRuntime;
}

function getRuntime(): ExampleRuntime {
  if (!runtime) {
    throw new Error('The example runtime was not configured by the app shell.');
  }
  return runtime;
}

type ChoreographyScreenProps = React.ComponentProps<
  ChoreographyModule['ChoreographyScreen']
>;

export function ChoreographyScreen(props: ChoreographyScreenProps) {
  const Component = getRuntime().ChoreographyScreen;
  return <Component {...props} />;
}

type SharedElementComponent = ChoreographyModule['SharedElement'];

function SharedElementRoot(
  props: React.ComponentProps<SharedElementComponent>
) {
  const Component = getRuntime().SharedElement;
  return <Component {...props} />;
}

SharedElementRoot.Live = function SharedElementLive(
  props: React.ComponentProps<SharedElementComponent['Live']>
) {
  const Component = getRuntime().SharedElement.Live;
  return <Component {...props} />;
};

SharedElementRoot.LiveTarget = function SharedElementLiveTarget(
  props: React.ComponentProps<SharedElementComponent['LiveTarget']>
) {
  const Component = getRuntime().SharedElement.LiveTarget;
  return <Component {...props} />;
};

SharedElementRoot.Target = function SharedElementTarget(
  props: React.ComponentProps<SharedElementComponent['Target']>
) {
  const Component = getRuntime().SharedElement.Target;
  return <Component {...props} />;
};

export const SharedElement =
  SharedElementRoot as unknown as SharedElementComponent;

type StandInContainerProps = React.ComponentProps<
  ChoreographyModule['StandInContainer']
>;

export function StandInContainer(props: StandInContainerProps) {
  const Component = getRuntime().StandInContainer;
  return <Component {...props} />;
}

type StandInCrossfadeProps = React.ComponentProps<
  ChoreographyModule['StandInCrossfade']
>;

export function StandInCrossfade(props: StandInCrossfadeProps) {
  const Component = getRuntime().StandInCrossfade;
  return <Component {...props} />;
}

type StandInElementProps = React.ComponentProps<
  ChoreographyModule['StandInElement']
>;

export function StandInElement(props: StandInElementProps) {
  const Component = getRuntime().StandInElement;
  return <Component {...props} />;
}

interface SafeAreaViewProps {
  children?: React.ReactNode;
  edges?: readonly ('top' | 'right' | 'bottom' | 'left')[];
  pointerEvents?: 'auto' | 'box-none' | 'box-only' | 'none';
  style?: unknown;
}

export function SafeAreaView(props: SafeAreaViewProps) {
  const Component = getRuntime().SafeAreaView;
  return <Component {...props} />;
}

export const resolveSurfaceStyle: ChoreographyModule['resolveSurfaceStyle'] = (
  ...args
) => getRuntime().resolveSurfaceStyle(...args);

export function useChoreographyProgress() {
  return getRuntime().useChoreographyProgress();
}

export function useInteractiveTransition() {
  return getRuntime().useInteractiveTransition();
}

export function useLatchedReveal(
  ...args: Parameters<ChoreographyModule['useLatchedReveal']>
) {
  return getRuntime().useLatchedReveal(...args);
}

export function useStaggeredReveal(
  ...args: Parameters<ChoreographyModule['useStaggeredReveal']>
) {
  return getRuntime().useStaggeredReveal(...args);
}

export function useSafeAreaInsets() {
  return getRuntime().useSafeAreaInsets();
}

export function useExampleNavigation(screenId: string) {
  return getRuntime().useExampleNavigation(screenId);
}
