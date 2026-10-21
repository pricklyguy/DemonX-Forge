// STL import and Mesh to Solid against the real engine (skipped when it is not installed): a plate with a hole leaves as STL, comes back as a
// mesh body named after the file, converts to a real solid and back with undo; a part that is not a constant-section prism is refused.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EngineError } from '../src/engine/Engine';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('STL import and Mesh to Solid (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  let plate: Uint8Array;
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], radius: 4 } }, { command: 'sketch.finish', params: {} },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
    plate = await e.exportBodies('stl');
    await e.newDesign();
  }, 60_000);
  afterAll(() => e.stop());

  it('brings an STL in as a mesh body named after the file, with the same size, and marks it as a mesh', async () => {
    await e.importModel(plate, 'stl', 'Plate One');
    const s = await e.snapshot();
    expect(s.bodies).toHaveLength(1);
    expect(s.bodies[0]!.mesh).toBe(true);
    expect(s.bodies[0]!.name).toBe('Plate_One');
    const q = s.bodies[0]!.positions; const hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < q.length; i++) hi[i % 3] = Math.max(hi[i % 3]!, q[i]!);
    expect(hi.map((v) => Math.round(v))).toEqual([40, 30, 10]);
  }, 60_000);

  it('converts it to a solid with real faces and edges, and undo gives the mesh back', async () => {
    const done = await e.convertMesh('Plate_One', 0.05);
    expect(done.method).toBe('slabs'); // a plate with a hole is one slab: sketch and extrude
    let s = await e.snapshot();
    expect(s.bodies[0]!.mesh).toBe(false);
    expect(s.bodies[0]!.faces.length).toBeGreaterThanOrEqual(7);
    expect(s.bodies[0]!.edges.length).toBeGreaterThan(10);
    await e.undo();
    s = await e.snapshot();
    expect(s.bodies[0]!.mesh).toBe(true);
    await e.redo();
  }, 60_000);

  it('says what is wrong for a body that is not there, and for one that is already a solid', async () => {
    await expect(e.convertMesh('Nope', 0.05)).rejects.toThrow(/no body/i);
    await expect(e.convertMesh('Plate_One', 0.05)).rejects.toBeInstanceOf(EngineError); // already a solid
    expect((await e.snapshot()).bodies[0]!.mesh).toBe(false); // nothing was changed
  }, 60_000);

  it('refuses a file that is not an STL and leaves the design alone', async () => {
    const before = (await e.snapshot()).timeline.length;
    await expect(e.importModel(new TextEncoder().encode('this is not an STL file'), 'stl', 'junk')).rejects.toThrow(/STL/);
    expect((await e.snapshot()).timeline.length).toBe(before);
  }, 60_000);

  // a strip with a lip along one side, three holes and a rounded corner: not a single prism, so the engine's own converter refuses it, but a stack of slabs
  it('rebuilds a lipped strip with holes and a rounded corner as sketches and extrudes with the same volume', async () => {
    const volume = (b: { positions: number[]; indices: number[] }) => { let v = 0; for (let i = 0; i < b.indices.length; i += 3) { const [a, c, d] = [0, 1, 2].map((k) => b.indices[i + k]! * 3); const P = b.positions; v += (P[a!]! * (P[c! + 1]! * P[d! + 2]! - P[c! + 2]! * P[d! + 1]!) - P[a! + 1]! * (P[c!]! * P[d! + 2]! - P[c! + 2]! * P[d!]!) + P[a! + 2]! * (P[c!]! * P[d! + 1]! - P[c! + 1]! * P[d!]!)) / 6; } return Math.abs(v); };
    await e.newDesign();
    await e.run([
      { command: 'sketch.create', params: { plane: 'XY', name: 'Base' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [100, 30] } }, { command: 'sketch.finish', params: {} },
      { command: 'solid.extrude', params: { sketch: 'Base', profiles: [0], distance: 3, operation: 'new' } },
      { command: 'sketch.create', params: { plane: { origin: [0, 0, 3], x_dir: [1, 0, 0], y_dir: [0, 1, 0] }, name: 'Lip' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [100, 4] } }, { command: 'sketch.finish', params: {} },
      { command: 'solid.extrude', params: { sketch: 'Lip', profiles: [0], distance: 5, operation: 'join' } },
      { command: 'sketch.create', params: { plane: 'XY', name: 'Holes' } }, ...[20, 50, 80].map((x) => ({ command: 'sketch.circle.center', params: { center: [x, 18], radius: 3 } })), { command: 'sketch.finish', params: {} },
      { command: 'solid.extrude', params: { sketch: 'Holes', profiles: 'all', distance: 3, operation: 'cut' } },
    ]);
    const corner = (await e.snapshot()).bodies[0]!.edges.find((x) => Math.abs(x.start[0]) < 1e-6 && Math.abs(x.end[0]) < 1e-6 && Math.abs(x.start[1] - 30) < 1e-6 && Math.abs(x.end[1] - 30) < 1e-6)!;
    await e.run([{ command: 'solid.fillet', params: { edges: [{ body: 'Body1', index: corner.index }], radius: 5 } }]); // a rounded corner: an arc in the section
    const original = (await e.snapshot()).bodies[0]!;
    expect(original.faces.length).toBeGreaterThan(10);
    const stl = await e.exportBodies('stl');
    await e.newDesign();
    await e.importModel(stl, 'stl', 'Strip');
    const mesh = (await e.snapshot()).bodies[0]!;
    expect(mesh.mesh).toBe(true);
    const done = await e.convertMesh(mesh.name, 0.05);
    expect(done.method).toBe('slabs');
    const s = await e.snapshot();
    expect(s.bodies).toHaveLength(1);
    expect(s.bodies[0]!.mesh).toBe(false);
    expect(s.bodies[0]!.name).toBe('Strip');
    expect(volume(s.bodies[0]!)).toBeCloseTo(volume(original), 0);
    expect(s.sketches.length).toBeGreaterThanOrEqual(2); // one per slab: the base with its holes, the lip on top
    expect(s.bodies[0]!.faces.length).toBeGreaterThan(10); // real faces again, holes and all
    expect(s.timeline.length).toBeGreaterThan(4);
    await e.undo();
    expect((await e.snapshot()).bodies[0]!.mesh).toBe(true); // one Ctrl+Z takes the whole conversion back, though it is many steps in the engine
    expect((await e.snapshot()).timeline).toHaveLength(1);
    await e.redo();
    expect((await e.snapshot()).bodies[0]!.mesh).toBe(false); // and one Ctrl+Y brings it all again
    expect(volume((await e.snapshot()).bodies[0]!)).toBeCloseTo(volume(original), 0);
  }, 120_000);

  it('says why a part with a slanted face cannot be rebuilt, from both converters, and changes nothing', async () => {
    await e.newDesign();
    await e.run([
      { command: 'sketch.create', params: { plane: 'XY', name: 'B' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.finish', params: {} },
      { command: 'solid.extrude', params: { sketch: 'B', profiles: [0], distance: 10, operation: 'new' } },
    ]);
    const top = (await e.snapshot()).bodies[0]!.edges.find((x) => Math.abs(x.start[2] - 10) < 1e-6 && Math.abs(x.end[2] - 10) < 1e-6 && x.length > 35)!;
    await e.run([{ command: 'solid.chamfer', params: { edges: [{ body: 'Body1', index: top.index }], distance: 4 } }]); // a slanted face along the top: a prism along X
    const side = (await e.snapshot()).bodies[0]!.edges.find((x) => Math.abs(x.start[2] - 10) < 1e-6 && Math.abs(x.end[2] - 10) < 1e-6 && Math.abs(x.start[0] - x.end[0]) < 1e-6 && x.length > 20)!;
    await e.run([{ command: 'solid.chamfer', params: { edges: [{ body: 'Body1', index: side.index }], distance: 4 } }]); // and another across it: no direction makes it a stack of slabs
    const stl = await e.exportBodies('stl');
    await e.newDesign();
    await e.importModel(stl, 'stl', 'Chamfered');
    const name = (await e.snapshot()).bodies[0]!.name;
    await expect(e.convertMesh(name, 0.05)).rejects.toThrow(/Sketches and extrudes: this part has slanted.*prism converter/s);
    const s = await e.snapshot();
    expect(s.bodies[0]!.mesh).toBe(true);
    expect(s.timeline).toHaveLength(1);
  }, 120_000);
});
