// Edge outlines against the real engine (skipped when it is not installed): every edge of a plate with rounded corners and a hole gets a line
// that starts and ends where the engine says and is about as long as the engine says; and a fillet of one picked edge follows its chain.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';
import { buildEdgeGeometry, pointToSegment } from '../src/engine/meshEdges';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('edge outlines (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.rounded', params: { p0: [0, 0], p1: [40, 30], radius: 5 } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 8 } }, { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
  }, 60_000);
  afterAll(() => e.stop());

  it('lists the edges with face-pair names', async () => {
    const b = (await e.snapshot()).bodies[0]!;
    expect(b.edges).toHaveLength(30);
    expect(b.edges.find((x) => x.name === 'F2:side:l1|F2:top')).toBeTruthy();
    expect(b.edges.some((x) => /~1$/.test(x.name)) && b.edges.some((x) => /~2$/.test(x.name))).toBe(true);
  });

  it('gives every edge a line that starts and ends where the engine says and is the right length', async () => {
    const b = (await e.snapshot()).bodies[0]!;
    const geo = buildEdgeGeometry(b);
    expect(geo).toHaveLength(30);
    for (const g of geo) {
      const eng = b.edges.find((x) => x.index === g.index)!;
      const segs: [number[], number[]][] = [];
      for (let i = 0; i < g.segments.length; i += 6) segs.push([g.segments.slice(i, i + 3), g.segments.slice(i + 3, i + 6)]);
      const near = (p: number[]) => Math.min(...segs.flatMap(([a, c]) => [Math.hypot(a[0]! - p[0]!, a[1]! - p[1]!, a[2]! - p[2]!), Math.hypot(c[0]! - p[0]!, c[1]! - p[1]!, c[2]! - p[2]!)]));
      expect(near(eng.start), `${eng.name} start`).toBeLessThan(1e-6);
      expect(near(eng.end), `${eng.name} end`).toBeLessThan(1e-6);
      const len = segs.reduce((n, [a, c]) => n + Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!), 0);
      expect(len, `${eng.name} length`).toBeGreaterThan(eng.length * 0.97);
      // the engine's own edge length for an arc is a little low (7.832 for a quarter circle of radius 5, which is 7.854); the mesh line is closer to the truth
      expect(len, `${eng.name} length`).toBeLessThan(eng.length * 1.01);
      const midDist = Math.min(...segs.map(([a, c]) => pointToSegment(eng.mid as [number, number, number], a as [number, number, number], c as [number, number, number])));
      expect(midDist, `${eng.name} mid`).toBeLessThan(0.05 * Math.max(eng.length, 1));
    }
    // a curved edge is drawn as many segments, a straight one as one
    const arc = geo.find((g) => g.name === 'F2:side:a1|F2:top')!, line = geo.find((g) => g.name === 'F2:side:l1|F2:top')!;
    expect(arc.segments.length / 6).toBeGreaterThan(3);
    expect(line.segments.length / 6).toBeGreaterThanOrEqual(1);
  });

  it('fillets the whole tangent chain from one picked edge, and chamfers likewise', async () => {
    const b = (await e.snapshot()).bodies[0]!;
    const picked = b.edges.find((x) => x.name === 'F2:side:l1|F2:top')!;
    await e.run([{ command: 'solid.fillet', params: { edges: [{ body: b.name, index: picked.index }], radius: 1.5 } }]);
    expect((await e.snapshot()).bodies[0]!.faces.length).toBe(b.faces.length + 8); // 4 lines + 4 corner arcs around the top
    await e.undo();
    await e.run([{ command: 'solid.chamfer', params: { edges: [{ body: b.name, index: picked.index }], distance: 1.5 } }]);
    expect((await e.snapshot()).bodies[0]!.faces.length).toBe(b.faces.length + 8);
    await e.undo();
    expect((await e.snapshot()).bodies[0]!.faces.length).toBe(b.faces.length);
  }, 60_000);
});
