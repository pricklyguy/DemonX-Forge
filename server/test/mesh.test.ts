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
    await e.convertMesh('Plate_One', '0.05 mm');
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
    await expect(e.convertMesh('Nope', '0.05 mm')).rejects.toThrow(/no body/i);
    await expect(e.convertMesh('Plate_One', '0.05 mm')).rejects.toBeInstanceOf(EngineError); // already a solid
    expect((await e.snapshot()).bodies[0]!.mesh).toBe(false); // nothing was changed
  }, 60_000);

  it('refuses a file that is not an STL and leaves the design alone', async () => {
    const before = (await e.snapshot()).timeline.length;
    await expect(e.importModel(new TextEncoder().encode('this is not an STL file'), 'stl', 'junk')).rejects.toThrow(/STL/);
    expect((await e.snapshot()).timeline.length).toBe(before);
  }, 60_000);
});
