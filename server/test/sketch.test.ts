// Sketch and extrude through the real engine (skipped when it is not installed), and the sketch parser on a canned description.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine, toSketch } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe('toSketch', () => {
  it('reads curves, dimensions and profiles', () => {
    const s = toSketch({
      id: 3, name: 'S', visible: true, dof: 2, plane: { origin: [0, 0, 5], x_dir: [1, 0, 0], y_dir: [0, 1, 0] },
      points: [{ id: 'origin', at: [0, 0], fixed: true }, { id: 'p1', at: [0, 0], fixed: false }],
      curves: [{ id: 'l1', type: 'line', start: 'p1', end: 'p2', start_at: [0, 0], end_at: [4, 0], fully_constrained: true }, { id: 'a1', type: 'arc', center_at: [1, 1], start_at: [2, 1], end_at: [1, 2], radius: 1 }, { id: 'x', type: 'spline' }],
      constraints: [{ id: 'k1', type: 'horizontal', l: 0 }, { id: 'k6', type: 'length', l: 0, param: 'd1', expression: '4', value: 4 }],
      profiles: [{ index: 0, area_mm2: 12, centroid_sketch: [2, 1], curves: ['l1'], holes: [['c1']] }],
    }, 3);
    expect(s.active).toBe(true);
    expect(s.plane.origin).toEqual([0, 0, 5]);
    expect(s.curves.map((c) => c.type)).toEqual(['line', 'arc', 'other']);
    expect(s.curves[0]).toMatchObject({ startId: 'p1', endId: 'p2' });
    expect(s.points).toEqual([{ id: 'p1', at: [0, 0], fixed: false }]); // the origin is not offered as a point to pick
    expect(s.curves[1]).toMatchObject({ center: [1, 1], start: [2, 1], end: [1, 2], radius: 1 });
    expect(s.dimensions).toEqual([{ id: 'k6', kind: 'length', param: 'd1', expression: '4', value: 4, curve: 'l1' }]);
    expect(s.profiles[0]).toMatchObject({ index: 0, area: 12, holes: [['c1']] });
    expect(toSketch({ id: 4, name: 'T' }, 3).active).toBe(false);
  });
});

describe.skipIf(!existsSync(bin))('sketch and extrude (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  beforeAll(() => e.start(), 60_000);
  afterAll(() => e.stop());

  it('draws in an open sketch, dimensions it, finishes and extrudes a picked region', async () => {
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 10 } }]);
    let s = (await e.snapshot()).sketches[0]!;
    expect(s.active).toBe(true);
    expect(s.curves).toHaveLength(5);
    expect(s.profiles).toHaveLength(2);
    expect(s.dof).toBeGreaterThan(0);

    await e.run([{ command: 'sketch.dimension', params: { entities: ['l1'], type: 'length', value: 50 } }]);
    s = (await e.snapshot()).sketches[0]!;
    expect(s.curves.find((c) => c.id === 'l1')!.end).toEqual([50, 0]);
    expect(s.dimensions).toHaveLength(1);
    expect(s.dimensions[0]).toMatchObject({ kind: 'length', value: 50, curve: 'l1' });

    await e.run([{ command: 'sketch.finish' }]);
    expect((await e.snapshot()).sketches[0]!.active).toBe(false);

    // a point inside the rectangle but outside the circle picks the region with the hole
    await e.run([{ command: 'solid.extrude', params: { sketch: 'S1', profiles: [{ point: [3, 3] }], distance: 10, operation: 'new' } }]);
    const snap = await e.snapshot();
    expect(snap.bodies).toHaveLength(1);
    expect(snap.bodies[0]!.faces).toHaveLength(8); // 4 sides, top, bottom, and the hole wall, which the engine keeps as two half-cylinders (c1#1, c1#2)
    const zs = snap.bodies[0]!.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(10, 6);
    expect(snap.timeline.map((t) => t.type)).toEqual(['Sketch', 'ExtrudeFeature']);
  }, 60_000);

  it('previews by applying and undoing', async () => {
    const before = (await e.snapshot()).bodies[0]!.faces.length;
    await e.run([{ command: 'solid.hole', params: { position: [3, 3, 10], diameter: 4 } }]);
    expect((await e.snapshot()).bodies[0]!.faces.length).toBeGreaterThan(before);
    await e.undo();
    expect((await e.snapshot()).bodies[0]!.faces.length).toBe(before);
  }, 60_000);
});
