import type { ComponentProps } from 'react';
import { SharedElement } from '../components/SharedElement';
import type {
  LiveTransition,
  LiveTransitionRendererProps,
  LiveTransitionSide,
  SharedElementTransitionSide,
  SharedElementTransition,
} from '../types';
import type { SharedElementProps } from '../components/SharedElement';

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type IsRequired<T, Key extends keyof T> =
  {} extends Pick<T, Key> ? false : true;
type Not<T extends boolean> = T extends true ? false : true;

type LiveOwnerProps = ComponentProps<typeof SharedElement.Live>;
type LiveTargetProps = ComponentProps<typeof SharedElement.LiveTarget>;
type OrdinarySharedElementProps = ComponentProps<typeof SharedElement>;

const typeContract: [
  Assert<Not<IsAssignable<SharedElementTransition, LiveTransition>>>,
  Assert<Not<'content' extends keyof LiveTransitionSide ? true : false>>,
  Assert<
    Not<'presentationContent' extends keyof LiveTransitionSide ? true : false>
  >,
  Assert<Not<'metadata' extends keyof SharedElementProps ? true : false>>,
  Assert<
    Not<'presentationContent' extends keyof SharedElementProps ? true : false>
  >,
  Assert<
    Not<'metadata' extends keyof OrdinarySharedElementProps ? true : false>
  >,
  Assert<
    Not<
      'presentationContent' extends keyof OrdinarySharedElementProps
        ? true
        : false
    >
  >,
  Assert<
    Not<'metadata' extends keyof SharedElementTransitionSide ? true : false>
  >,
  Assert<
    Not<
      'presentationContent' extends keyof SharedElementTransitionSide
        ? true
        : false
    >
  >,
  Assert<IsRequired<LiveTransitionRendererProps, 'children'>>,
  Assert<IsAssignable<null, LiveOwnerProps['children']>>,
  Assert<
    Not<
      IsAssignable<
        SharedElementTransition,
        NonNullable<LiveOwnerProps['transition']>
      >
    >
  >,
  Assert<
    Not<
      IsAssignable<
        SharedElementTransition,
        NonNullable<LiveTargetProps['transition']>
      >
    >
  >,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

test('live public types preserve their branded and content-free contract', () => {
  expect(typeContract).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
});
