import { interpolate, Extrapolation } from 'react-native-reanimated';
import type { BlankStackNavigationOptions } from 'react-native-screen-transitions/react-navigation';

// Match the original gallery's spring and supporting-content reveal window.
const spring = {
  damping: 28,
  mass: 1,
  stiffness: 240,
  overshootClamping: true,
};

export const galleryOptions: BlankStackNavigationOptions = {
  gestureEnabled: true,
  gestureDirection: 'vertical',
  transitionSpec: { open: spring, close: spring },
  screenStyleInterpolator: ({ active, bounds, focused }) => {
    'worklet';
    const params = active.route.params;
    const photoId = params && 'photoId' in params ? params.photoId : undefined;
    if (typeof photoId !== 'string') return {};
    const id = `photo.${photoId}`;
    const progress = active.progress;
    return {
      [id]: {
        style: {
          // The live payload moves to the receiver. Keep the source target at
          // its grid size so the return measurement cannot capture an expansion.
          ...(focused ? bounds(id).styles({ method: 'size' }) : {}),
          zIndex: 2,
        },
      },
      'gallery-background': {
        opacity: focused
          ? interpolate(progress, [0, 0.35], [0, 1], Extrapolation.CLAMP)
          : 1,
      },
      'gallery-header': {
        opacity: interpolate(
          progress,
          [0.35, 0.65],
          [0, 1],
          Extrapolation.CLAMP
        ),
      },
      'gallery-details': {
        opacity: interpolate(
          progress,
          [0.55, 0.9],
          [0, 1],
          Extrapolation.CLAMP
        ),
      },
    };
  },
};
