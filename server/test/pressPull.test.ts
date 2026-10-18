// Press Pull against the real engine (skipped when it is not installed): a face pulled out adds material, pushed in removes it, and a
// failed or mistyped step leaves the model alone.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('press pull (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  const topZ = async () => { const q = (await e.snapshot()).bodies[0]!.positions; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]!); return Math.round(m * 1000) / 1000; };
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
  }, 60_000);
  afterAll(() => e.stop());

  it('pulls a face out with a positive distance and pushes it in with a negative one', async () => {
    expect(await topZ()).toBe(10);
    await e.run([{ command: 'solid.press_pull', params: { face: [20, 15, 10], distance: 5 } }]);
    expect(await topZ()).toBe(15);
    await e.undo();
    await e.run([{ command: 'solid.press_pull', params: { face: [20, 15, 10], distance: -4 } }]);
    expect(await topZ()).toBe(6);
    await e.undo();
    expect(await topZ()).toBe(10);
  });

  it('refuses a point that is not on a face, and changes nothing', async () => {
    await expect(e.run([{ command: 'solid.press_pull', params: { face: [200, 200, 200], distance: 5 } }])).rejects.toThrow();
    expect(await topZ()).toBe(10);
  });
});
