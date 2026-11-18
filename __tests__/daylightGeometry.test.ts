import {
  photoCorner,
  daylightFrame,
  daylightGroup,
  daylightOpacities,
} from '../examples/shared/daylight/daylightGeometry';

const icon = { pageX: 48, pageY: 320, width: 72, height: 72 };
const screen = { pageX: 0, pageY: 24, width: 402, height: 850 };

test('places have distinct pairing identities', () => {
  expect(daylightGroup('big-sur')).not.toBe(daylightGroup('tokyo'));
});

test.each([
  [icon, screen],
  [{ pageX: 24, pageY: 180, width: 354, height: 233 }, screen],
  [{ pageX: 24, pageY: 580, width: 44, height: 44 }, screen],
  [icon, { pageX: 20, pageY: 0, width: 850, height: 402 }],
])(
  'lands at captured endpoints, including insets, resized icons and landscape',
  (collapsed, expanded) => {
    expect(daylightFrame(collapsed, expanded, 0)).toMatchObject({
      x: collapsed.pageX,
      y: collapsed.pageY,
      width: collapsed.width,
      height: collapsed.height,
    });
    expect(daylightFrame(collapsed, expanded, 1)).toEqual({
      x: expanded.pageX,
      y: expanded.pageY,
      width: expanded.width,
      height: expanded.height,
      radius: 0,
    });
    expect(daylightFrame(collapsed, expanded, -0.1)).toEqual(
      daylightFrame(collapsed, expanded, 0)
    );
    expect(daylightFrame(collapsed, expanded, 1.1)).toEqual(
      daylightFrame(collapsed, expanded, 1)
    );
  }
);

test('route content follows the full return rather than an early removal threshold', () => {
  expect(daylightOpacities(0.1).card).toBeGreaterThan(0);
  expect(daylightOpacities(0.1).icon).toBe(1);
  expect(daylightOpacities(0)).toEqual({ card: 0, icon: 1 });
});

test('stacked icon and card never reveal the backdrop during their crossfade', () => {
  for (let step = 0; step <= 1000; step += 1) {
    const { card, icon: opacity } = daylightOpacities(step / 1000);
    const coverage = opacity + card * (1 - opacity);
    expect(coverage).toBeCloseTo(1);
  }
});

test.each([
  [icon, screen],
  [{ pageX: 24, pageY: 180, width: 354, height: 233 }, screen],
  [{ pageX: 24, pageY: 580, width: 44, height: 44 }, screen],
  [icon, { pageX: 20, pageY: 0, width: 850, height: 402 }],
])(
  'the live content mask matches the icon throughout their crossfade',
  (collapsed, expanded) => {
    for (let step = 0; step <= 100; step += 1) {
      const progress = step / 100;
      const frame = daylightFrame(collapsed, expanded, progress);
      if (daylightOpacities(progress).icon > 0) {
        expect(frame.height).toBeCloseTo(
          (frame.width * collapsed.height) / collapsed.width
        );
        expect(frame.radius).toBeCloseTo(
          (frame.width / collapsed.width) * photoCorner(collapsed.width)
        );
      }
    }
  }
);

test('the sun guide is visible midway through expansion and fills the open endpoint', () => {
  expect(daylightOpacities(0.42).card).toBe(1);
  expect(daylightOpacities(0.42).icon).toBeCloseTo(0.5);
  expect(daylightOpacities(0.6)).toEqual({ card: 1, icon: 0 });
  expect(daylightOpacities(1)).toEqual({ card: 1, icon: 0 });
});
