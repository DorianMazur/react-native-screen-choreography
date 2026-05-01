import { measureElement } from '../src/measurement';

describe('measureElement', () => {
  test('returns null for null ref', async () => {
    const ref = { current: null };
    const result = await measureElement(ref);
    expect(result).toBeNull();
  });

  test('returns null for ref without measureInWindow', async () => {
    const ref = { current: {} };
    const result = await measureElement(ref);
    expect(result).toBeNull();
  });

  test('returns metrics from measureInWindow', async () => {
    const ref = {
      current: {
        measureInWindow: (cb: Function) => {
          cb(10, 20, 100, 50);
        },
      },
    };
    const result = await measureElement(ref);
    expect(result).toEqual({
      pageX: 10,
      pageY: 20,
      width: 100,
      height: 50,
    });
  });

  test('returns null for zero-size element', async () => {
    const ref = {
      current: {
        measureInWindow: (cb: Function) => {
          cb(10, 20, 0, 0);
        },
      },
    };
    const result = await measureElement(ref);
    expect(result).toBeNull();
  });

  test('falls back to measure when measureInWindow is not available', async () => {
    const ref = {
      current: {
        measure: (cb: Function) => {
          cb(0, 0, 100, 50, 10, 20);
        },
      },
    };
    const result = await measureElement(ref);
    expect(result).toEqual({
      pageX: 10,
      pageY: 20,
      width: 100,
      height: 50,
    });
  });

  test('handles measurement timeout', async () => {
    jest.useFakeTimers();
    const ref = {
      current: {
        measureInWindow: () => {
          // Never calls callback — simulates timeout
        },
      },
    };
    const promise = measureElement(ref);
    jest.advanceTimersByTime(600);
    const result = await promise;
    expect(result).toBeNull();
    jest.useRealTimers();
  });

  test('handles exception during measurement', async () => {
    const ref = {
      current: {
        measureInWindow: () => {
          throw new Error('test error');
        },
      },
    };
    const result = await measureElement(ref);
    expect(result).toBeNull();
  });
});
