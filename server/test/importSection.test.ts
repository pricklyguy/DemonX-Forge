// STEP import and the section DXF against the real engine (skipped when it is not installed): a STEP file made by the engine comes back in as a component
// with the same shape, and a cut through a plate with a hole gives the lines on either side of the hole, Z up.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

const box = (positions: number[]) => {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3]!, positions[i]!); hi[i % 3] = Math.max(hi[i % 3]!, positions[i]!); }
  return [...lo, ...hi].map((v) => Math.round(v * 100) / 100);
};
/** Entity names in a DXF's ENTITIES section with their coordinates: group code 10/20 for the first point. */
const lines = (dxf: string) => {
  const t = dxf.split(/\r?\n/).map((l) => l.trim()); const out: { y: number[] }[] = [];
  for (let i = t.indexOf('ENTITIES'); i < t.length - 1 && t[i] !== 'ENDSEC'; i++) {
    if (t[i] === '0' && t[i + 1] === 'LINE') { const ys: number[] = []; for (let k = i + 2; k < t.length - 1 && t[k] !== '0'; k += 2) if (t[k] === '20' || t[k] === '21') ys.push(Number(t[k + 1])); out.push({ y: ys }); }
  }
  return out;
};

describe.skipIf(!existsSync(bin))('STEP import and section DXF (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 8 } }, { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
  }, 60_000);
  afterAll(() => e.stop());

  it('cuts a section through the hole: the lines either side of it, with Z up', async () => {
    const before = await e.snapshot();
    const dxf = Buffer.from(await e.exportSectionDxf({ plane: 'XZ', offset: 15, body: 'Body1' })).toString('utf8');
    const ls = lines(dxf);
    expect(ls).toHaveLength(6); // two U shapes: the plate either side of the 8 mm hole
    const ys = ls.flatMap((l) => l.y); expect(Math.min(...ys)).toBeCloseTo(0, 3); expect(Math.max(...ys)).toBeCloseTo(10, 3); // 10 mm thick, standing up (not hanging down)
    const after = await e.snapshot();
    expect(after.sketches.map((s) => s.name)).toEqual(before.sketches.map((s) => s.name));
    expect(after.timeline.map((t) => t.name)).toEqual(before.timeline.map((t) => t.name));
  });

  it('brings a STEP file back in with the same shape, and refuses junk', async () => {
    const step = await e.exportBodies('step');
    const bb = box((await e.snapshot()).bodies[0]!.positions);
    await e.newDesign();
    await e.importModel(step, 'step', 'plate');
    const s = await e.snapshot();
    expect(s.bodies).toHaveLength(1);
    expect(box(s.bodies[0]!.positions)).toEqual(bb);
    await expect(e.importModel(new TextEncoder().encode('this is not a STEP file'), 'step', 'junk')).rejects.toThrow();
    expect((await e.snapshot()).bodies).toHaveLength(1);
  });
});
