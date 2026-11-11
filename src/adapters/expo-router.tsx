import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused, useNavigation, useRoute, useSitemap } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from '../components/ChoreographyScreenBase';
import { isSingleRouteBack } from '../core/removalAction';
import { waitForNavigationTarget } from '../core/navigationTarget';
import {
  createBackCommit,
  observeNavigationPresentation,
  type NavigationCommitSource,
  type NavigationCommitResult,
} from '../core/navigationCommit';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';
import { useInteractiveTransitionNavigator } from '../hooks/useInteractiveTransition';
import { useStableCallback } from '../hooks/useStableCallback';
import type { ChoreographyNavigateOptions } from '../types';

export interface ExpoRouterLike<Href> {
  push: (href: Href) => unknown;
  navigate: (href: Href) => unknown;
  back: () => unknown;
}

export type ChoreographyRouterRequest<Href> = ChoreographyNavigateOptions & {
  href: Href;
  /** Required unless href names a file directly in the root stack. */
  targetScreenId?: string;
};

/**
 * Adapts Expo Router's imperative router to choreography sessions without
 * placing transition metadata in the destination URL.
 */
export function useChoreographyRouter<Href>(
  router: ExpoRouterLike<Href>,
  currentScreenId?: string
) {
  const isFocused = useIsFocused();
  const route = useRoute();
  const navigation = useNavigation();
  const rootNavigation = useNavigation('/');
  const sitemap = useSitemap();
  const choreography = useChoreographyNavigator({
    currentScreenId: route.key ?? currentScreenId ?? route.name,
    currentRouteKey: route.key,
    isFocused,
    goBack: createBackCommit(
      navigation as unknown as NavigationCommitSource,
      route.key,
      () => router.back()
    ),
  });

  function inferRootScreenName(href: Href): string | undefined {
    if (navigation !== rootNavigation) return;
    const pathname =
      href && typeof href === 'object' && 'pathname' in href
        ? href.pathname
        : href;
    if (typeof pathname !== 'string' || !pathname.startsWith('/')) return;
    const name = pathname.slice(1) || 'index';
    const state = navigation.getState();
    if (state?.type !== 'stack' || !state.routeNames.includes(name)) return;
    // A nested layout can itself have a matching name in the root stack.
    const isFile = sitemap?.children.some(
      (file) =>
        file.children.length === 0 &&
        file.filename.replace(
          /(?:\.(?:ios|android|native|web))?\.[jt]sx?$/,
          ''
        ) === name
    );
    return isFile ? name : undefined;
  }

  function open(
    method: 'push' | 'navigate',
    request: ChoreographyRouterRequest<Href>
  ) {
    const { href, targetScreenId, ...options } = request;
    const name = targetScreenId ?? inferRootScreenName(href);
    if (name === undefined) {
      return Promise.reject(
        new Error(
          'Pass targetScreenId for this href. Automatic screen identity requires an exact file route in the root Stack.'
        )
      );
    }
    return choreography.navigate({
      targetScreenId: name,
      options,
      dispatchNavigation: () => router[method](href),
      resolveTargetScreenId: () =>
        targetScreenId !== undefined
          ? waitForNavigationTarget(navigation, route.key)
          : waitForNavigationTarget(navigation, route.key, name),
    });
  }

  const push = useStableCallback((request: ChoreographyRouterRequest<Href>) =>
    open('push', request)
  );
  const navigate = useStableCallback(
    (request: ChoreographyRouterRequest<Href>) => open('navigate', request)
  );
  const back = useStableCallback(choreography.goBack);

  const [commands] = useState(() => ({ push, navigate, back }));
  return commands;
}

export function useInteractiveTransition() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const navigateBack = useCallback(
    () => createBackCommit(navigation, route.key, () => navigation.goBack())(),
    [navigation, route.key]
  );

  return useInteractiveTransitionNavigator({
    navigateBack,
    currentScreenId: route.key,
    routeParams: (route.params ?? {}) as Record<string, unknown>,
  });
}

export function ChoreographyScreen(
  props: ChoreographyScreenProps
): React.ReactElement {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  useEffect(
    () =>
      observeNavigationPresentation(
        navigation as unknown as NavigationCommitSource
      ),
    [navigation]
  );
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const { interceptRemoval, preventRemove, sourceScreenId, sourceRouteKey } =
    useChoreographyScreenRemoval({
      screenId: route.key,
      legacyGroupId: routeParams._choreographyGroup as string | undefined,
      legacySourceScreenId: routeParams._choreographySourceScreen as
        | string
        | undefined,
    });

  const [replayingRemoval, setReplayingRemoval] = useState(false);
  const replayResult = useRef<Promise<NavigationCommitResult> | null>(null);
  const disablePrevention = usePreventRemove(
    preventRemove && !replayingRemoval,
    ({ data }) => {
      const resume = () => {
        const result = createBackCommit(
          navigation as unknown as NavigationCommitSource,
          route.key,
          () => {
            if (typeof disablePrevention === 'function') {
              setReplayingRemoval(true);
              disablePrevention();
            }
            navigation.dispatch(data.action);
          }
        )();
        replayResult.current = result;
        return result;
      };
      const canAnimate = isSingleRouteBack(
        data.action,
        navigation.getState(),
        route.key,
        sourceScreenId,
        sourceRouteKey
      );
      const isRemoved = () =>
        !navigation
          .getState()
          ?.routes.some((candidate) => candidate.key === route.key);
      if (!interceptRemoval(resume, canAnimate, isRemoved)) resume();
    }
  ) as void | (() => void);

  useEffect(() => {
    if (!replayingRemoval) return;
    let mounted = true;
    replayResult.current?.then(() => {
      if (mounted) setReplayingRemoval(false);
    });
    return () => {
      mounted = false;
    };
  }, [replayingRemoval]);

  return (
    <ChoreographyScreenBase
      {...props}
      screenId={props.screenId ?? route.name}
      instanceId={route.key}
      isFocused={isFocused}
    />
  );
}

export function choreographyScreenLayout({
  children,
}: Pick<ChoreographyScreenProps, 'children'>) {
  return <ChoreographyScreen>{children}</ChoreographyScreen>;
}
