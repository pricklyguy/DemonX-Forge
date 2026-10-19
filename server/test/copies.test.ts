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

  it('moves and drafts faces and combines bodies', async () => {
    await e.newDesign();
    const levelX = async (z: number) => { const q = (await e.snapshot()).bodies[0]!.positions; let m = -1e9; for (let i = 0; i < q.length; i += 3) if (Math.abs(q[i + 2]! - z) < 0.01) m = Math.max(m, q[i]!); return Math.round(m * 100) / 100; };
    await e.run([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
    await e.run([{ command: 'solid.offset_face', params: { faces: [[40, 15, 5]], distance: 5 } }]);
    expect(await boxes()).toEqual(['0,0,0,45,30,10']); await e.undo();
    await e.run([{ command: 'solid.draft', params: { faces: [[40, 15, 5]], angle: 5, neutral: { origin: [0, 0, 0], normal: [0, 0, 1] } } }]);
    expect(await levelX(0)).toBe(40); expect(await levelX(10)).toBe(39.13); await e.undo();
    await e.run([{ command: 'solid.box', params: { length: 20, width: 20, height: 20, corner: [30, 5, 0], operation: 'new' } }]);
    await e.run([{ command: 'solid.combine', params: { target: 'Body1', tools: ['Body2'], operation: 'join' } }]);
    expect(await boxes()).toEqual(['0,0,0,50,30,20']); await e.undo();
    await e.run([{ command: 'solid.combine', params: { target: 'Body1', tools: ['Body2'], operation: 'intersect' } }]);
    expect(await boxes()).toEqual(['30,5,0,40,25,10']);
  });

  it('moves, splits, drills and edits a hole, threads it, and grows a rib', async () => {
    await e.newDesign();
    await e.run([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
    await e.run([{ command: 'solid.move', params: { bodies: ['Body1'], translate: [50, 0, 0], copy: true } }]);
    expect(await boxes()).toEqual(['0,0,0,40,30,10', '50,0,0,90,30,10']); await e.undo();
    await e.run([{ command: 'solid.move', params: { bodies: ['Body1'], axis: [0, 0, 1], angle: 90 } }]);
    expect(await boxes()).toEqual(['-30,0,0,0,40,10']); await e.undo();
    await e.run([{ command: 'solid.split_body', params: { body: 'Body1', plane: { origin: [15, 0, 0], normal: [1, 0, 0] } } }]);
    expect(await boxes()).toEqual(['0,0,0,15,30,10', '15,0,0,40,30,10']); await e.undo();
    await expect(e.run([{ command: 'solid.split_body', params: { body: 'Body1', plane: { origin: [50, 0, 0], normal: [1, 0, 0] } } }])).rejects.toThrow();
    // a hole, edited in place (diameter, depth removed, position)
    await e.run([{ command: 'solid.hole', params: { position: [30, 12, 10], diameter: 10, depth: 4 } }]);
    const radii = async () => (await e.snapshot()).bodies[0]!.faces.filter((f) => f.cylinder).map((f) => Math.round(f.cylinder!.radius * 100) / 100);
    expect(await radii()).toEqual([5, 5]);
    await e.run([{ command: 'timeline.edit', params: { feature: 'Hole1', set: { diameter: '6', depth: null, position: [20, 15, 10] } } }]);
    expect(await radii()).toEqual([3, 3]);
    const def = ((await e.query('timeline.inspect', { feature: 'Hole1' })) as { definition: Record<string, unknown> }).definition;
    expect(def.depth).toBeUndefined(); expect(def.position).toEqual([20, 15, 10]);
    await e.undo(); expect(await radii()).toEqual([5, 5]);
    await e.undo(); // the blind hole
    await e.run([{ command: 'solid.hole', params: { position: [30, 12, 10], diameter: 10 } }]);
    const wall = (await e.snapshot()).bodies[0]!.faces.find((f) => f.cylinder)!;
    await e.run([{ command: 'solid.thread', params: { face: wall.point, designation: 'M10', modeled: false } }]);
    expect((await e.snapshot()).timeline.map((t) => t.type)).toContain('ThreadFeature');
    await expect(e.run([{ command: 'solid.thread', params: { face: wall.point, designation: 'M20' } }])).rejects.toThrow(/does not fit/);
    // a rib from a line across the floor of an open box
    await e.newDesign();
    await e.run([{ command: 'solid.box', params: { length: 40, width: 30, height: 20, corner: [0, 0, 0] } }, { command: 'solid.shell', params: { faces: [[20, 15, 20]], thickness: 2 } },
      { command: 'sketch.create', params: { plane: 'XZ', name: 'R', offset: 15 } }, { command: 'sketch.line', params: { points: [[2, -2], [38, -2]] } }, { command: 'sketch.finish' }]);
    const before = (await e.snapshot()).bodies[0]!.faces.length;
    await e.run([{ command: 'solid.rib', params: { sketch: 'R', curves: ['l1'], thickness: 3, depth: 8 } }]);
    expect((await e.snapshot()).bodies[0]!.faces.length).toBeGreaterThan(before);
    await e.undo();
    await expect(e.run([{ command: 'solid.rib', params: { sketch: 'R', curves: ['l1'], thickness: 3 } }])).rejects.toThrow(/depth/);
  });
});
