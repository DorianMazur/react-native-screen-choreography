import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  ChoreographyNavigationOptions,
  InteractiveBackOptions,
  InteractiveTransitionSession,
  InteractiveTransitionSettleOptions,
  InteractiveTransitionDecisionOptions,
} from 'react-native-screen-choreography/core';
import type { SharedValue } from 'react-native-reanimated';

export {
  SharedElement,
  StandInContainer,
  makeStretchTransition,
  makeSurfaceTransition,
  textMorphTransition,
  StandInElement,
  resolveSurfaceStyle,
  useChoreographyProgress,
  useLatchedReveal,
  useStaggeredReveal,
} from 'react-native-screen-choreography/core';
export {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export type DemoListScreenId =
  | 'GalleryList'
  | 'MusicList'
  | 'TokenList'
  | 'WalletSetup'
  | 'LivePlayerList';

export type DemoDetailDestination =
  | { screen: 'GalleryDetail'; params: { photoId: string } }
  | { screen: 'NowPlaying'; params: { trackId: string } }
  | { screen: 'TokenDetail'; params: { tokenId: string } }
  | { screen: 'WalletExisting'; params?: undefined }
  | { screen: 'LivePlayerDetail'; params?: undefined };

export interface ExampleNavigation {
  open: (screen: DemoListScreenId) => void;
  navigate: (
    destination: DemoDetailDestination,
    options?: ChoreographyNavigationOptions
  ) => Promise<void>;
  goBack: (options?: ChoreographyNavigationOptions) => Promise<void>;
}

export type DemoScreenId =
  | 'Landing'
  | DemoListScreenId
  | DemoDetailDestination['screen'];

export interface ExampleInteractiveTransition {
  beginBack: (
    options?: InteractiveBackOptions
  ) => Promise<InteractiveTransitionSession | null>;
  setProgress: (value: number) => void;
  finish: (options?: InteractiveTransitionSettleOptions) => void;
  cancel: (options?: InteractiveTransitionSettleOptions) => void;
  settle: (options?: InteractiveTransitionDecisionOptions) => void;
  progress: SharedValue<number>;
  isActive: boolean;
}

const NavigationContext = createContext<ExampleNavigation | null>(null);
const InteractiveContext = createContext<ExampleInteractiveTransition | null>(
  null
);

export function ExampleBindings({
  navigation,
  interactive,
  children,
}: {
  navigation: ExampleNavigation;
  interactive: ExampleInteractiveTransition;
  children: React.ReactNode;
}) {
  const navigationRef = useRef(navigation);
  useLayoutEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);
  const [commands] = useState<ExampleNavigation>(() => ({
    open: (...args) => navigationRef.current.open(...args),
    navigate: (...args) => navigationRef.current.navigate(...args),
    goBack: (...args) => navigationRef.current.goBack(...args),
  }));

  return (
    <NavigationContext.Provider value={commands}>
      <InteractiveContext.Provider value={interactive}>
        {children}
      </InteractiveContext.Provider>
    </NavigationContext.Provider>
  );
}

export function useExampleNavigation(): ExampleNavigation {
  const navigation = useContext(NavigationContext);
  if (!navigation)
    throw new Error(
      'Shared screens must be rendered inside an app ExampleScreen.'
    );
  return navigation;
}

export function useInteractiveTransition(): ExampleInteractiveTransition {
  const interactive = useContext(InteractiveContext);
  if (!interactive)
    throw new Error(
      'Interactive demos must be rendered inside an app ExampleScreen.'
    );
  return interactive;
}
