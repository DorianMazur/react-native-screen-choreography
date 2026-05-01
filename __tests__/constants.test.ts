import {
  DEFAULT_SPRING,
  SNAPPY_SPRING,
  FAST_SPRING,
  PROGRESS_RANGES,
  DEFAULT_BACKDROP_OPACITY,
} from '../src/constants';

describe('Constants', () => {
  test('DEFAULT_SPRING has valid config', () => {
    expect(DEFAULT_SPRING.damping).toBeGreaterThan(0);
    expect(DEFAULT_SPRING.stiffness).toBeGreaterThan(0);
    expect(DEFAULT_SPRING.mass).toBeGreaterThan(0);
  });

  test('SNAPPY_SPRING has valid config', () => {
    expect(SNAPPY_SPRING.damping).toBeGreaterThan(0);
    expect(SNAPPY_SPRING.stiffness).toBeGreaterThan(0);
  });

  test('FAST_SPRING is stiffer than DEFAULT', () => {
    expect(FAST_SPRING.stiffness!).toBeGreaterThan(DEFAULT_SPRING.stiffness!);
  });

  test('PROGRESS_RANGES are within 0-1', () => {
    for (const [, range] of Object.entries(PROGRESS_RANGES)) {
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.start).toBeLessThanOrEqual(1);
      expect(range.end).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(1);
      expect(range.end).toBeGreaterThanOrEqual(range.start);
    }
  });

  test('DEFAULT_BACKDROP_OPACITY is reasonable', () => {
    expect(DEFAULT_BACKDROP_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_BACKDROP_OPACITY).toBeLessThanOrEqual(1);
  });
});
