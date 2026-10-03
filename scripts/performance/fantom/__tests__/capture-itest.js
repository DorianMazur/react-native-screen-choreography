/** @fantom_mode opt */
import '@react-native/fantom/src/setUpDefaultReactNativeEnvironment';
import * as Fantom from '@react-native/fantom';
import { createFixture, expectedFrames } from '../fixture';

describe('Production Fabric capture', () => {
  let fixture;
  beforeEach(() => {
    fixture = createFixture(10);
  });
  afterEach(() => {
    fixture.destroy();
  });

  it('captures all endpoints from a completed mount and refreshes after layout changes', () => {
    expect(fixture.capture()).toEqual(expectedFrames(10));
    fixture.render(30);
    expect(fixture.capture()).toEqual(expectedFrames(10, 30));
  });

  it('rejects missing and incorrectly scoped endpoints atomically', () => {
    const capture = global.__screenChoreographyCaptureFabricLayout;
    expect(
      capture(fixture.screens, [...fixture.tags.slice(0, 9), 999999])
    ).toBe(null);
    expect(capture([fixture.otherScreen], [fixture.tags[0]])).toBe(null);
    expect(capture([], [])).toBe(null);
    expect(capture(fixture.screens, fixture.tags.slice(1))).toBe(null);
    expect(
      capture(
        [fixture.screens[0], fixture.screens[0]],
        [fixture.tags[0], fixture.tags[0]]
      )
    ).toBe(null);
  });

  it('consumes requests once while retaining endpoint validation', () => {
    const read = fixture.request();
    expect(typeof read).toBe('function');
    expect(read(true)).toBe(true);
    expect(read()).toEqual(expectedFrames(10));
    expect(read()).toBe(null);
    expect(read(true)).toBe(true);
  });

  it('refreshes an outstanding request when another layout mounts', () => {
    const read = fixture.request();
    fixture.render(40);
    expect(read()).toEqual(expectedFrames(10, 40));
  });

  it('invalidates removed endpoints, even after new endpoints mount in their place', () => {
    const read = fixture.request();
    fixture.render(0, 0);
    fixture.render();
    expect(read(true)).toBe(false);
    expect(read()).toBe(null);
    expect(fixture.capture()).toBe(null); // Saved tags belonged to removed nodes.
  });

  it('does not revive cancelled requests after subsequent mounts', () => {
    const read = fixture.request();
    read(false);
    fixture.render(10);
    expect(read(true)).toBe(false);
    expect(read()).toBe(null);
  });

  it('notifies mount subscribers and stops after unsubscribe', () => {
    let notifications = 0;
    const unsubscribe = global.__screenChoreographySubscribeFabricMount(() => {
      notifications++;
    });
    fixture.render(10);
    expect(notifications).toBeGreaterThan(0);
    unsubscribe();
    const before = notifications;
    fixture.render(20);
    Fantom.runWorkLoop();
    expect(notifications).toBe(before);
  });
});
