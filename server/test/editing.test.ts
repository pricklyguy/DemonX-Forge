// Editing through the real engine (skipped when it is not installed): change a feature in place, reopen a sketch, suppress,
// roll the history back, delete and undo, and the read-only questions.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('editing (real engine)', () => {
  const e = new SolidCraftEngine(bin);
  beforeAll(async () => {
    await e.start();
    await e.run([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
  }, 60_000);
  afterAll(() => e.stop());
  const bbox = async () => { const b = (await e.snapshot()).bodies[0]; if (!b) return null; const a = [0, 1, 2].map((k) => b.positions.filter((_, i) => i % 3 === k)); return a.map((v) => [Math.min(...v), Math.max(...v)]); };

  it('reports the history marker', async () => {
    const s = await e.snapshot();
    expect(s.timeline.map((t) => t.name)).toEqual(['S1', 'Extrude1']);
    expect(s.marker).toBe(2);
  });

  it('answers read-only questions: a feature\'s definition and what depends on it', async () => {
    const f: any = await e.query('timeline.inspect', { feature: 'Extrude1' });
    expect(f.type).toBe('ExtrudeFeature');
    expect(f.definition.extent.distance).toBe('10');
    expect(f.definition.operation).toBe('new_body');
    expect(f.definition.profiles.loops).toEqual([['l1', 'l2', 'l3', 'l4']]);
    const d: any = await e.query('timeline.dependents', { feature: 'S1' });
    expect(d.deleted_with_it).toEqual(['Extrude1']);
  });

  it('changes an extrude in place, and that is one undo step', async () => {
    await e.run([{ command: 'timeline.edit', params: { feature: 'Extrude1', set: { extent: { distance: '25' } } } }]);
    expect((await bbox())![2]).toEqual([0, 25]);
    await e.undo();
    expect((await bbox())![2]).toEqual([0, 10]);
  });

  it('reopens a sketch, and finishing it rebuilds what was built on it', async () => {
    await e.run([{ command: 'sketch.edit', params: { sketch: 'S1' } }]);
    expect((await e.snapshot()).sketches[0]!.active).toBe(true);
    await e.run([{ command: 'sketch.dimension', params: { entities: ['l1'], type: 'length', value: 60 } }, { command: 'sketch.finish' }]);
    expect((await bbox())![0]).toEqual([0, 60]);
    expect((await bbox())![2]).toEqual([0, 10]);
  });

  it('suppresses and restores a feature', async () => {
    await e.run([{ command: 'timeline.suppress', params: { feature: 'Extrude1' } }]);
    let s = await e.snapshot();
    expect(s.bodies).toHaveLength(0);
    expect(s.timeline[1]!.suppressed).toBe(true);
    await e.run([{ command: 'timeline.suppress', params: { feature: 'Extrude1', suppressed: false } }]);
    s = await e.snapshot();
    expect(s.bodies).toHaveLength(1);
  });

  it('rolls the history back to a step and forward again', async () => {
    await e.run([{ command: 'timeline.roll_to', params: { feature: 'S1' } }]);
    let s = await e.snapshot();
    expect(s.marker).toBe(1);
    expect(s.bodies).toHaveLength(0);
    await e.run([{ command: 'timeline.roll_to', params: {} }]);
    s = await e.snapshot();
    expect(s.marker).toBe(2);
    expect(s.bodies).toHaveLength(1);
  });

  it('renames and deletes (and undo brings it back)', async () => {
    await e.run([{ command: 'timeline.rename', params: { feature: 'Extrude1', name: 'Base' } }]);
    expect((await e.snapshot()).timeline.map((t) => t.name)).toEqual(['S1', 'Base']);
    await e.run([{ command: 'timeline.delete', params: { features: ['Base'] } }]);
    expect((await e.snapshot()).bodies).toHaveLength(0);
    await e.undo();
    expect((await e.snapshot()).bodies).toHaveLength(1);
  });
});
