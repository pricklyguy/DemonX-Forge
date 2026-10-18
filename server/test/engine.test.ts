// Talks to the real engine when it is installed (FORGE_ENGINE or data/engine/); otherwise skipped.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine, errorText, unknownParamNames } from '../src/engine/solidcraft';
import { checkStep } from '../src/commands';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);
const fixture = JSON.parse(readFileSync(join(root, 'server', 'fixtures', 'bracket.json'), 'utf8')).commands.map(checkStep);

describe('errorText', () => {
  it('says which step failed and that nothing changed', () => {
    expect(errorText('{"failed":{"command":"solid.fillet","error":"too big","index":1},"rolled_back":true}')).toBe('Step 2 (solid.fillet): too big. Nothing was changed.');
    expect(errorText('error: plain')).toBe('plain');
  });
});

describe('unknownParamNames', () => {
  it('flags names that are not in the command text', () => {
    const spec = 'position: [x,y,z] on a face; diameter; type?: simple|counterbore; cb_diameter?, cb_depth?';
    expect(unknownParamNames(spec, ['position', 'diameter', 'cb_depth'])).toEqual([]);
    expect(unknownParamNames(spec, ['counterbore_diameter'])).toEqual(['counterbore_diameter']);
  });
});

describe.skipIf(!existsSync(bin))('SolidCraftEngine (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  beforeAll(() => e.start(), 60_000);
  afterAll(() => e.stop());

  it('starts empty', async () => { expect((await e.snapshot()).bodies).toEqual([]); });

  it('builds the demo bracket with a face-tagged mesh', async () => {
    const warnings = await e.run(fixture);
    expect(warnings).toEqual([]);
    const s = await e.snapshot();
    expect(s.bodies).toHaveLength(1);
    const b = s.bodies[0]!;
    expect(b.faces.length).toBeGreaterThan(10);
    expect(new Set(b.faceIds).size).toBe(b.faces.length);
    expect(b.indices.length / 3).toBe(b.faceIds.length);
  }, 60_000);

  it('rebuilds when a parameter changes', async () => {
    const before = (await e.snapshot()).bodies[0]!;
    await e.setParameter('width', 100);
    const after = (await e.snapshot()).bodies[0]!;
    const ymin = (b: typeof before) => Math.min(...b.positions.filter((_, i) => i % 3 === 1));
    expect(ymin(before)).toBeCloseTo(-60, 3);
    expect(ymin(after)).toBeCloseTo(-100, 3);
  }, 60_000);

  it('warns about a parameter the engine would ignore, and rejects an unknown command', async () => {
    const w = await e.run([{ command: 'solid.hole', params: { position: [40, -30, 0], diameter: 5, counterbore_diameter: 10 } }]);
    expect(w.join(' ')).toMatch(/counterbore_diameter/);
    await expect(e.run([{ command: 'solid.nonsense' }])).rejects.toThrow(/no command/);
  }, 60_000);

  it('rolls a failed batch back and leaves the design as it was', async () => {
    const n = (await e.snapshot()).bodies[0]!.faces.length;
    await expect(e.run([{ command: 'solid.fillet', params: { edges: [[0, 0, 0]], radius: 1 } }, { command: 'solid.fillet', params: { edges: [[9999, 0, 0]], radius: 1 } }])).rejects.toThrow();
    expect((await e.snapshot()).bodies[0]!.faces.length).toBe(n);
  }, 60_000);

  it('undoes', async () => {
    const n = (await e.snapshot()).bodies[0]!.faces.length;
    await e.undo();
    expect((await e.snapshot()).bodies[0]!.faces.length).not.toBe(n);
  }, 60_000);
});
