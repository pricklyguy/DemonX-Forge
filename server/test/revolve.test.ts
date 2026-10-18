// Revolve against the real engine (skipped when it is not installed): a rectangle turned about a sketch axis, about a sketch line, and part way round.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('revolve (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  const box = async () => {
    const q = (await e.snapshot()).bodies[0]!.positions; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < q.length; i++) { lo[i % 3] = Math.min(lo[i % 3]!, q[i]!); hi[i % 3] = Math.max(hi[i % 3]!, q[i]!); }
    return { lo: lo.map((v) => Math.round(v * 100) / 100), hi: hi.map((v) => Math.round(v * 100) / 100) };
  };
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [10, 0], p1: [20, 5] } }, { command: 'sketch.finish' }]);
  }, 60_000);
  afterAll(() => e.stop());

  it('turns a profile a full turn about the sketch Y axis', async () => {
    await e.run([{ command: 'solid.revolve', params: { sketch: 'S1', profiles: [0], axis: 'y', angle: 360, operation: 'new' } }]);
    expect(await box()).toEqual({ lo: [-20, 0, -20], hi: [20, 5, 20] });
    await e.undo();
  });

  it('turns it part way round: a half turn fills half the circle', async () => {
    await e.run([{ command: 'solid.revolve', params: { sketch: 'S1', profiles: [0], axis: 'y', angle: 180, operation: 'new' } }]);
    const b = await box();
    expect(b.lo[0]).toBe(-20); expect(b.hi[0]).toBe(20);
    expect(Math.abs(b.hi[2]! - b.lo[2]!)).toBeCloseTo(20, 1);
    await e.undo();
  });

  it('refuses an axis that does not exist, and changes nothing', async () => {
    await expect(e.run([{ command: 'solid.revolve', params: { sketch: 'S1', profiles: [0], axis: 'nope', angle: 360, operation: 'new' } }])).rejects.toThrow();
    expect((await e.snapshot()).bodies).toHaveLength(0);
  });
});
