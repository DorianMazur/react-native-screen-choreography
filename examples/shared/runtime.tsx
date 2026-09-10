import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ChoreographyNavigationOptions } from 'react-native-screen-choreography/core';

export {
  Springs,
  SharedElement,
  useSharedElementPresentation,
  TransitionSurface,
  makeTransition,
  TransitionFrame,
  resolveSurfaceStyle,
  useChoreographyControls,
  useChoreographyProgress,
  useLatchedReveal,
  useStaggeredReveal,
} from 'react-native-screen-choreography/core';
export {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export type DemoListScreenId = 'GalleryList' | 'TokenList' | 'WalletSetup';

export type DemoDetailDestination =
  | { screen: 'GalleryDetail'; params: { photoId: string } }
  | { screen: 'TokenDetail'; params: { tokenId: string } }
  | { screen: 'WalletExisting'; params?: undefined };

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

const NavigationContext = createContext<ExampleNavigation | null>(null);

export function ExampleBindings({
  navigation,
  children,
}: {
  navigation: ExampleNavigation;
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
      {children}
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
