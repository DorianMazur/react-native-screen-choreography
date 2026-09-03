import { getExpansionProgress } from '../src/core/expansionProgress';

describe('getExpansionProgress', () => {
  it('reaches a larger target size early', () => {
    expect(getExpansionProgress(0, 132, 430)).toBe(0);
    expect(getExpansionProgress(0.5, 132, 430)).toBe(0.75);
    expect(getExpansionProgress(1, 132, 430)).toBe(1);
  });

  it('leaves a larger source size late', () => {
    expect(getExpansionProgress(0, 430, 132)).toBe(0);
    expect(getExpansionProgress(0.5, 430, 132)).toBe(0.25);
    expect(getExpansionProgress(1, 430, 132)).toBe(1);
  });
});
