// Mirror, patterns, sweep and loft against the real engine (skipped when it is not installed): the shapes of the results, by bounding boxes.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('mirror, patterns, sweep, loft (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  const boxes = async () => (await e.snapshot()).bodies.map((b) => {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < b.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3]!, b.positions[i]!); hi[i % 3] = Math.max(hi[i % 3]!, b.positions[i]!); }
    return [...lo, ...hi].map((v) => Math.round(v)).join(',');
  }).sort();
  beforeAll(async () => { await e.start(); }, 60_000);
  afterAll(() => e.stop());

  it('mirrors a box across a plane and repeats it along a line and round an axis', async () => {
    await e.run([{ command: 'solid.box', params: { length: 10, width: 10, height: 10, corner: [20, 0, 0] } }]);
    await e.run([{ command: 'solid.mirror', params: { bodies: ['Body1'], plane: 'YZ' } }]);
    expect(await boxes()).toEqual(['-30,0,0,-20,10,10', '20,0,0,30,10,10']); await e.undo();
    await e.run([{ command: 'solid.pattern.rectangular', params: { bodies: ['Body1'], dir1: [1, 0, 0], count1: 3, spacing1: 20 } }]);
    expect(await boxes()).toEqual(['20,0,0,30,10,10', '40,0,0,50,10,10', '60,0,0,70,10,10']); await e.undo();
    await e.run([{ command: 'solid.pattern.rectangular', params: { bodies: ['Body1'], dir1: [1, 0, 0], count1: 2, spacing1: 20, reversed: true } }]);
    expect(await boxes()).toEqual(['0,0,0,10,10,10', '20,0,0,30,10,10']); await e.undo();
    await e.run([{ command: 'solid.pattern.circular', params: { bodies: ['Body1'], axis: 'Z', count: 4, angle: 360 } }]);
    expect(await boxes()).toHaveLength(4); await e.undo();
    await e.run([{ command: 'solid.pattern.circular', params: { bodies: ['Body1'], axis: 'Z', count: 1 } }]).then(() => e.undo(), () => undefined);
    expect(await boxes()).toEqual(['20,0,0,30,10,10']);
  });

  it('sweeps a circle along a line and lofts a circle up to a square', async () => {
    await e.newDesign();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'P' } }, { command: 'sketch.circle.center', params: { center: [0, 0], diameter: 10 } }, { command: 'sketch.finish' },
      { command: 'sketch.create', params: { plane: 'XZ', name: 'Path' } }, { command: 'sketch.line', params: { points: [[0, 0], [0, -40]] } }, { command: 'sketch.finish' }]);
    await e.run([{ command: 'solid.sweep', params: { sketch: 'P', profiles: [0], path_sketch: 'Path', path: ['l1'], operation: 'new' } }]);
    expect(await boxes()).toEqual(['-5,-5,0,5,5,40']); await e.undo();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'Top', offset: 30 } }, { command: 'sketch.rectangle.two_point', params: { p0: [-10, -10], p1: [10, 10] } }, { command: 'sketch.finish' }]);
    await e.run([{ command: 'solid.loft', params: { sections: [{ sketch: 'P', profiles: [0] }, { sketch: 'Top', profiles: [0] }], operation: 'new' } }]);
    expect(await boxes()).toEqual(['-10,-10,0,10,10,30']);
    await expect(e.run([{ command: 'solid.loft', params: { sections: [{ sketch: 'P', profiles: [0] }], operation: 'new' } }])).rejects.toThrow();
  });
});
