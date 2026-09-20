import {
  transitionGeometryStyle,
  transitionLayoutStyle,
} from './TransitionSurface';

const source = { pageX: 12, pageY: 80, width: 120, height: 80 };
const target = { pageX: -8, pageY: 20, width: 80, height: 160 };

test('keeps a fixed layout origin and resizes live content without scaling', () => {
  expect(transitionLayoutStyle()).toEqual({
    position: 'absolute',
    left: 0,
    top: 0,
  });
  expect(transitionGeometryStyle(source, target, 0.5)).toEqual({
    width: 100,
    height: 120,
    transform: [{ translateX: 2 }, { translateY: 50 }],
  });
});

test.each([-0.25, 0, 0.5, 1, 1.25])(
  'reverses and clamps timeline %s',
  (timeline) => {
    const t = Math.max(0, Math.min(1, timeline));
    const expected = {
      width: source.width + (target.width - source.width) * t,
      height: source.height + (target.height - source.height) * t,
      transform: [
        { translateX: source.pageX + (target.pageX - source.pageX) * t },
        { translateY: source.pageY + (target.pageY - source.pageY) * t },
      ],
    };
    expect(transitionGeometryStyle(source, target, timeline)).toEqual(expected);
    expect(transitionGeometryStyle(target, source, 1 - timeline)).toEqual(
      expected
    );
  }
);
