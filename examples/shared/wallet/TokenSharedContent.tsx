import type { ReactNode } from 'react';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSharedElementPresentation } from '../runtime';

/** The same label/logo scales; its native text/image layout stays unchanged. */
export function TokenSharedContent({ children }: { children: ReactNode }) {
  const { progress, transitioning, settled, expanded } =
    useSharedElementPresentation();
  const scale =
    (expanded.metadata as { scale?: number } | undefined)?.scale ?? 1;
  const style = useAnimatedStyle(() => ({
    transformOrigin: 'top left',
    transform: [
      {
        scale: transitioning
          ? interpolate(progress.value, [0, 1], [1, scale], 'clamp')
          : settled === 'expanded'
            ? scale
            : 1,
      },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
