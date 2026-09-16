import { FAST_SPRING, resolveSpringConfig } from './constants';

it('preserves a duration spring without adding physics-only defaults', () => {
  const spring = { duration: 2000, dampingRatio: 1 };
  const result = resolveSpringConfig(spring);
  expect(result).toEqual(spring);
  expect(result).not.toBe(spring);
  expect(result).not.toHaveProperty('stiffness');
  expect(result).not.toHaveProperty('damping');
});

it('also supports a damping-ratio spring using Reanimated’s default duration', () => {
  expect(resolveSpringConfig({ dampingRatio: 1 })).toEqual({ dampingRatio: 1 });
});

it('preserves physics spring defaults and partial overrides', () => {
  expect(resolveSpringConfig()).toMatchObject(FAST_SPRING);
  expect(resolveSpringConfig({ stiffness: 80 })).toMatchObject({
    ...FAST_SPRING,
    stiffness: 80,
  });
});
