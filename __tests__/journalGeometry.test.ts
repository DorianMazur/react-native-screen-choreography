import {
  journalFrame,
  journalGroup,
  journalOpacities,
} from '../examples/shared/journal/journalGeometry';

const icon = { pageX: 48, pageY: 320, width: 72, height: 72 };
const screen = { pageX: 0, pageY: 24, width: 402, height: 850 };

test('collections have distinct pairing identities', () => {
  expect(journalGroup('trails')).not.toBe(journalGroup('street'));
});

test.each([
  [icon, screen],
  [{ pageX: 24, pageY: 580, width: 44, height: 44 }, screen],
  [icon, { pageX: 20, pageY: 0, width: 850, height: 402 }],
])(
  'lands at captured endpoints, including insets, resized icons and landscape',
  (collapsed, expanded) => {
    expect(journalFrame(collapsed, expanded, 0)).toMatchObject({
      x: collapsed.pageX,
      y: collapsed.pageY,
      width: collapsed.width,
      height: collapsed.height,
    });
    expect(journalFrame(collapsed, expanded, 1)).toEqual({
      x: expanded.pageX,
      y: expanded.pageY,
      width: expanded.width,
      height: expanded.height,
      radius: 0,
    });
    expect(journalFrame(collapsed, expanded, -0.1)).toEqual(
      journalFrame(collapsed, expanded, 0)
    );
    expect(journalFrame(collapsed, expanded, 1.1)).toEqual(
      journalFrame(collapsed, expanded, 1)
    );
  }
);

test('route content follows the full return rather than an early removal threshold', () => {
  expect(journalOpacities(0.1).card).toBeGreaterThan(0);
  expect(journalOpacities(0.1).icon).toBe(1);
  expect(journalOpacities(0)).toEqual({ card: 0, icon: 1 });
});

test('stacked icon and card never reveal the backdrop during their crossfade', () => {
  for (let step = 0; step <= 1000; step += 1) {
    const { card, icon: opacity } = journalOpacities(step / 1000);
    const coverage = opacity + card * (1 - opacity);
    expect(coverage).toBeCloseTo(1);
  }
});

test.each([
  [icon, screen],
  [{ pageX: 24, pageY: 580, width: 44, height: 44 }, screen],
  [icon, { pageX: 20, pageY: 0, width: 850, height: 402 }],
])(
  'the live content mask matches the icon throughout their crossfade',
  (collapsed, expanded) => {
    for (let step = 0; step <= 100; step += 1) {
      const progress = step / 100;
      const frame = journalFrame(collapsed, expanded, progress);
      if (journalOpacities(progress).icon > 0) {
        expect(frame.height).toBeCloseTo(frame.width);
        expect(frame.radius).toBeCloseTo(frame.width / 4);
      }
    }
  }
);

test('the journal page is visible midway through expansion and fills the open endpoint', () => {
  expect(journalOpacities(0.42).card).toBe(1);
  expect(journalOpacities(0.42).icon).toBeCloseTo(0.5);
  expect(journalOpacities(0.6)).toEqual({ card: 1, icon: 0 });
  expect(journalOpacities(1)).toEqual({ card: 1, icon: 0 });
});
