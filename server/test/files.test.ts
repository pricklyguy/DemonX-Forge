// Saving, opening and exporting through the real engine (skipped when it is not installed).
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { FileError, unpackForge } from '../src/forgeFile';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);
const text = (b: Uint8Array, n = 200) => new TextDecoder().decode(b.subarray(0, n));

describe.skipIf(!existsSync(bin))('save, open and export (real engine)', () => {
  const e = new SolidCraftEngine(bin, undefined, 'test');
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 10 } }, { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
  }, 60_000);
  afterAll(() => e.stop());
  const shape = async () => { const s = await e.snapshot(); return { timeline: s.timeline.map((t) => t.name).join(','), faces: s.bodies[0]?.faces.length, z: s.bodies[0] ? Math.round(Math.max(...s.bodies[0].positions.filter((_, i) => i % 3 === 2)) * 1e6) / 1e6 : null }; };

  it('knows about unsaved changes and the name', async () => {
    let s = await e.snapshot();
    expect(s.doc).toEqual({ name: 'Untitled', dirty: true });
    const bytes = await e.save('Bracket');
    s = await e.snapshot();
    expect(s.doc).toEqual({ name: 'Bracket', dirty: false });
    expect(unpackForge(bytes).meta).toMatchObject({ format: 'demonx-forge', version: 1, app: 'test' });
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S2' } }, { command: 'sketch.finish' }]);
    expect((await e.snapshot()).doc.dirty).toBe(true);
    await e.undo(); // the whole batch is one undo step
  });

  it('saves and opens: the same history, the same part', async () => {
    const before = await shape();
    expect(before).toMatchObject({ timeline: 'S1,Extrude1', faces: 8, z: 10 });
    const bytes = await e.save('Plate');
    await e.newDesign();
    let s = await e.snapshot();
    expect(s.timeline).toHaveLength(0); expect(s.bodies).toHaveLength(0); expect(s.doc).toEqual({ name: 'Untitled', dirty: false });
    await e.load(bytes, 'Plate');
    expect(await shape()).toEqual(before);
    s = await e.snapshot();
    expect(s.doc).toEqual({ name: 'Plate', dirty: false });
    // and it is still editable: the sketch reopens and the extrude follows
    await e.run([{ command: 'sketch.edit', params: { sketch: 'S1' } }, { command: 'sketch.dimension', params: { entities: ['l1'], type: 'length', value: 50 } }, { command: 'sketch.finish' }]);
    const b = (await e.snapshot()).bodies[0]!;
    expect(Math.max(...b.positions.filter((_, i) => i % 3 === 0))).toBeCloseTo(50, 6);
    await e.undo(); // (the three steps above are one batch)
  }, 60_000);

  it('refuses a bad file and leaves the design as it was', async () => {
    const before = await shape();
    await expect(e.load(new Uint8Array([1, 2, 3, 4]), 'x')).rejects.toBeInstanceOf(FileError);
    const notForge = zipSync({ 'hello.txt': strToU8('hi') });
    await expect(e.load(notForge, 'x')).rejects.toThrow(/not a DemonX Forge file/);
    const junkDesign = zipSync({ 'forge.json': strToU8(JSON.stringify({ format: 'demonx-forge', version: 1, app: 'x', engine: 'solidcraft', savedAt: '' })), 'design.solidcraft': strToU8('this is not a design') });
    await expect(e.load(junkDesign, 'x')).rejects.toThrow(/could not be opened/);
    expect(await shape()).toEqual(before);
    expect((await e.snapshot()).doc.name).not.toBe('x');
  }, 60_000);

  it('exports STEP, STL, 3MF and OBJ', async () => {
    const step = await e.exportBodies('step');
    expect(text(step, 20)).toMatch(/^ISO-10303-21/);
    expect(text(step, step.length)).toContain('ADVANCED_FACE');
    const stla = await e.exportBodies('stla');
    expect(text(stla, 6)).toBe('solid ');
    expect(text(stla, stla.length)).toContain('facet normal');
    const stl = await e.exportBodies('stl');
    expect(stl.length).toBe(84 + 50 * new DataView(stl.buffer, stl.byteOffset).getUint32(80, true)); // binary STL: header, count, 50 bytes a triangle
    const mf = await e.exportBodies('3mf');
    expect(Array.from(mf.subarray(0, 2))).toEqual([0x50, 0x4b]);
    const obj = await e.exportBodies('obj');
    expect(text(obj, obj.length)).toMatch(/^v /m);
  }, 60_000);

  it('exports a sketch as DXF in millimetres', async () => {
    const dxf = text(await e.exportSketchDxf('S1'), 100000);
    expect(dxf).toContain('SECTION');
    expect((dxf.match(/\nLINE\n/g) ?? []).length).toBe(4);
    expect(dxf).toContain('CIRCLE');
    await expect(e.exportSketchDxf('Nope')).rejects.toThrow();
  }, 60_000);
});
