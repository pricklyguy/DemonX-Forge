// A compact parametric part workflow against the pinned real engine. This complements
// the focused tests with one sketch -> feature edit -> blend -> history -> file round trip.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SolidCraftEngine } from '../src/engine/solidcraft';

const root = resolve(__dirname, '..', '..');
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const bin = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

describe.skipIf(!existsSync(bin))('real-engine acceptance: editable parametric plate', () => {
  const engine = new SolidCraftEngine(bin);
  beforeAll(async () => {
    await engine.start();
    await engine.run([
      { command: 'sketch.create', params: { plane: 'XY', name: 'Plate' } },
      { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } },
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { sketch: 'Plate', profiles: [0], distance: 10, operation: 'new' } },
    ]);
  }, 60_000);
  afterAll(() => engine.stop());

  const volume = async () => Number((await engine.measure() as any).bodies[0].volume_mm3);
  const bounds = async () => {
    const body = (await engine.snapshot()).bodies[0]!;
    return [0, 1, 2].map((axis) => {
      const values = body.positions.filter((_, index) => index % 3 === axis);
      return [Math.min(...values), Math.max(...values)];
    });
  };
  const expectBounds = async (expected: number[][]) => {
    const actual = await bounds();
    expect(actual).toHaveLength(expected.length);
    actual.forEach((axis, i) => axis.forEach((value, j) => expect(value).toBeCloseTo(expected[i]![j]!, 6)));
  };

  it('rebuilds a dimension edit, fillets a real edge, undoes/redoes it, and saves the same history', async () => {
    await expectBounds([[0, 40], [0, 30], [0, 10]]);
    expect(await volume()).toBeCloseTo(12_000, 5);

    await engine.run([
      { command: 'sketch.edit', params: { sketch: 'Plate' } },
      { command: 'sketch.dimension', params: { entities: ['l1'], type: 'length', value: 50 } },
      { command: 'sketch.finish' },
    ]);
    await expectBounds([[0, 50], [0, 30], [0, 10]]);
    expect(await volume()).toBeCloseTo(15_000, 5);

    const body = (await engine.snapshot()).bodies[0]!;
    const edge = body.edges.find((item) => Math.abs(item.length - 10) < 1e-6);
    expect(edge, 'the prism has a real vertical edge to select').toBeTruthy();
    await engine.run([{ command: 'solid.fillet', params: { edges: [{ body: body.name, index: edge!.index }], radius: 2 } }]);
    const filleted = await engine.snapshot();
    expect(filleted.timeline.map((step) => step.name)).toEqual(['Plate', 'Extrude1', 'Fillet1']);
    const filletVolume = await volume();
    expect(filletVolume).toBeGreaterThan(0);
    expect(filletVolume).toBeLessThan(15_000);

    await engine.undo();
    expect((await engine.snapshot()).timeline.map((step) => step.name)).toEqual(['Plate', 'Extrude1']);
    expect(await volume()).toBeCloseTo(15_000, 5);
    await engine.redo();
    expect((await engine.snapshot()).timeline.map((step) => step.name)).toEqual(['Plate', 'Extrude1', 'Fillet1']);
    expect(await volume()).toBeCloseTo(filletVolume, 5);

    const saved = await engine.save('Acceptance Plate');
    await engine.newDesign();
    expect((await engine.snapshot()).bodies).toHaveLength(0);
    await engine.load(saved, 'Acceptance Plate');
    expect((await engine.snapshot()).timeline.map((step) => step.name)).toEqual(['Plate', 'Extrude1', 'Fillet1']);
    await expectBounds([[0, 50], [0, 30], [0, 10]]);
    expect(await volume()).toBeCloseTo(filletVolume, 5);
  }, 60_000);
});
