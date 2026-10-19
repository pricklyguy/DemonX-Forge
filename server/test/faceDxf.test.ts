// DXF of a flat face against the real engine (skipped when it is not installed): the outline and the hole of a plate's top face, and the design left untouched.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

/** The entity names in a DXF's ENTITIES section, counted. */
const entities = (dxf: string) => {
  const lines = dxf.split(/\r?\n/).map((l) => l.trim()); const out: Record<string, number> = {};
  const from = lines.indexOf('ENTITIES'); if (from < 0) return out;
  for (let i = from; i < lines.length - 1; i++) { if (lines[i] === '0' && /^[A-Z]+$/.test(lines[i + 1]!) && lines[i + 1] !== 'SECTION' && lines[i + 1] !== 'ENDSEC') out[lines[i + 1]!] = (out[lines[i + 1]!] ?? 0) + 1; if (lines[i] === 'ENDSEC') break; }
  return out;
};

describe.skipIf(!existsSync(bin))('DXF of a face (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 8 } }, { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
  }, 60_000);
  afterAll(() => e.stop());

  it('gives the outline and the hole of the top face, and leaves the design as it was', async () => {
    const before = await e.snapshot();
    const top = before.bodies[0]!.faces.find((f) => Math.abs(f.planeNormal?.[2] ?? 0) > 0.99 && f.point[2] > 5)!;
    expect(top).toBeTruthy();
    const dxf = Buffer.from(await e.exportFaceDxf({ body: before.bodies[0]!.name, index: top.index, point: top.point as [number, number, number] })).toString('utf8');
    const n = entities(dxf);
    expect(n.LINE).toBe(4);
    expect((n.CIRCLE ?? 0) + (n.ARC ?? 0)).toBeGreaterThanOrEqual(1);
    const after = await e.snapshot();
    expect(after.sketches.map((s) => s.name)).toEqual(before.sketches.map((s) => s.name));
    expect(after.timeline.map((t) => t.name)).toEqual(before.timeline.map((t) => t.name));
    expect(after.bodies[0]!.faces).toHaveLength(before.bodies[0]!.faces.length);
  });
});
