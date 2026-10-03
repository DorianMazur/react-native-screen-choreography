/** @fantom_mode opt */
import '@react-native/fantom/src/setUpDefaultReactNativeEnvironment';
import * as Fantom from '@react-native/fantom';
import {
  captureFabricLayout,
  prepareFabricLayout,
} from '../../../../src/core/fabricLayout';
import { createFixture, expectedFrames } from '../fixture';

describe('Preparation safety with real Fabric mounts', () => {
  let fixture;
  let cancellers;
  const prepare = (isCurrent = () => true, entries = fixture.entries) =>
    prepareFabricLayout({ entries, isCurrent, cancellers });

  beforeEach(() => {
    fixture = createFixture(10);
    cancellers = new Set();
  });
  afterEach(() => {
    Fantom.runTask(() => {
      for (const cancel of cancellers) cancel();
    });
    fixture.destroy();
  });

  it('returns mounted snapshots synchronously with IDs, geometry and native identity intact', () => {
    for (const snapshot of [captureFabricLayout(fixture.entries), prepare()]) {
      expect([...snapshot.metrics.keys()]).toEqual(
        fixture.entries.map((entry) => entry.id)
      );
      expect([...snapshot.metrics.values()]).toEqual(expectedFrames(10));
      expect(snapshot.isCurrent()).toBe(true);
    }
    expect(prepare().validateNative()).toBe(true);
    expect(cancellers.size).toBe(0);
  });

  it('waits for usable geometry and resolves from a native mount notification', () => {
    fixture.render(0, 10, 0);
    let snapshot;
    const pending = prepare();
    expect(pending instanceof Promise).toBe(true);
    pending.then((result) => {
      snapshot = result;
    });
    Fantom.runWorkLoop();
    expect(snapshot).toBe(undefined);
    expect(cancellers.size).toBe(1);
    fixture.render(30);
    expect([...snapshot.metrics.values()]).toEqual(expectedFrames(10, 30));
    expect(snapshot.validateNative()).toBe(true);
    expect(cancellers.size).toBe(0);
  });

  it('rejects missing refs and duplicate IDs without leaving pending work', () => {
    for (const entries of [
      [],
      [fixture.entries[0], fixture.entries[0]],
      [{ ...fixture.entries[0], ref: { current: null } }],
      [{ ...fixture.entries[0], screenRef: fixture.entries[1].ref }],
    ]) {
      expect(captureFabricLayout(entries)).toBe(null);
      expect(prepare(() => true, entries)).toBe(null);
      expect(cancellers.size).toBe(0);
    }
  });

  it('settles cancellation once and ignores subsequent mounts', () => {
    fixture.render(0, 10, 0);
    const results = [];
    prepare().then((result) => results.push(result));
    const cancel = [...cancellers][0];
    Fantom.runTask(() => {
      cancel();
      cancel();
    });
    expect(results).toEqual([null]);
    expect(cancellers.size).toBe(0);
    fixture.render();
    fixture.render(20);
    expect(results).toEqual([null]);
    expect(prepare().metrics.size).toBe(10);
  });

  it('rejects a superseded preparation when its delayed mount arrives', () => {
    fixture.render(0, 10, 0);
    let current = true;
    let result;
    prepare(() => current).then((snapshot) => {
      result = snapshot;
    });
    current = false;
    fixture.render();
    expect(result).toBe(null);
    expect(cancellers.size).toBe(0);
    expect(prepare(() => false)).toBe(null);
  });

  it('rejects removed endpoints and does not adopt replacements in the same refs', () => {
    const ready = prepare();
    fixture.render(0, 10, 0);
    const results = [];
    prepare().then((result) => results.push(result));
    fixture.render(0, 0);
    fixture.render();
    expect(results).toEqual([null]);
    expect(ready.isCurrent()).toBe(false);
    expect(ready.validateNative()).toBe(false);
    expect(cancellers.size).toBe(0);
    expect(prepare().validateNative()).toBe(true);
  });

  it('keeps consecutive preparations independent across completion and cancellation', () => {
    for (let cycle = 0; cycle < 20; cycle++) {
      fixture.render(0, 10, 0);
      const results = [];
      prepare().then((result) => results.push(result));
      if (cycle % 2 === 0) {
        Fantom.runTask(() => {
          for (const cancel of cancellers) cancel();
        });
      }
      fixture.render(cycle);
      expect(results).toHaveLength(1);
      if (cycle % 2 === 0) {
        expect(results[0]).toBe(null);
      } else {
        expect([...results[0].metrics.values()]).toEqual(
          expectedFrames(10, cycle)
        );
      }
      expect(cancellers.size).toBe(0);
    }
  });
});
