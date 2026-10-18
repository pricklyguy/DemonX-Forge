import { describe, expect, it } from 'vitest';
import type { SketchCurve } from '../api';
import { loopPolygon, curvePoints } from './loops';
import { ORIGIN_PLANES, normalOf, rayToSketch, toSketch, toWorld } from './plane';
import { niceStep, snapGrid, snapPoints } from './snap';
import { circleThrough, constraintStep, dimensionFor, isDraw, onClick, onTyped, preview } from './tools';
import { distToCurve, pickEntity } from './pick';
import type { Sketch } from '../api';

const line = (id: string, a: [number, number], b: [number, number]): SketchCurve => ({ id, type: 'line', construction: false, fullyConstrained: false, start: a, end: b });

const z = (v: number[]) => v.map((x) => x + 0); // -0 is 0

describe('plane', () => {
  it('maps sketch and world coordinates both ways, on the XZ plane too', () => {
    const p = ORIGIN_PLANES.XZ;
    expect(z(toWorld(p, [3, 4]))).toEqual([3, 0, -4]);
    expect(toSketch(p, [3, 0, -4])).toEqual([3, 4]);
    expect(z(normalOf(p))).toEqual([0, 1, 0]);
    expect(z(normalOf(ORIGIN_PLANES.XY))).toEqual([0, 0, 1]);
    expect(z(normalOf(ORIGIN_PLANES.YZ))).toEqual([1, 0, 0]);
  });
  it('finds where a ray meets the plane, and refuses a parallel or backwards ray', () => {
    const xy = ORIGIN_PLANES.XY;
    const hit = rayToSketch(xy, [5, 7, 10], [0, 0, -1])!;
    expect(hit[0]).toBeCloseTo(5); expect(hit[1]).toBeCloseTo(7);
    expect(rayToSketch(xy, [0, 0, 10], [1, 0, 0])).toBeNull();
    expect(rayToSketch(xy, [0, 0, 10], [0, 0, 1])).toBeNull();
  });
});

describe('snap', () => {
  it('picks nice steps and rounds to them', () => {
    expect(niceStep(0.7)).toBe(1); expect(niceStep(1.2)).toBe(2); expect(niceStep(3)).toBe(5); expect(niceStep(7)).toBe(10); expect(niceStep(0.03)).toBe(0.05);
    expect(snapGrid([12.4, -7.6], 5)).toEqual([10, -10]);
    expect(snapGrid([0.34, 0.9], 0.5)).toEqual([0.5, 1]);
  });
  it('snaps to the nearest point within the tolerance only', () => {
    expect(snapPoints([1, 1], [[5, 5], [1.2, 1]], 0.5)).toEqual([1.2, 1]);
    expect(snapPoints([1, 1], [[5, 5]], 0.5)).toBeNull();
  });
});

describe('loops', () => {
  const rect = [line('l1', [0, 0], [4, 0]), line('l2', [4, 0], [4, 3]), line('l3', [4, 3], [0, 3]), line('l4', [0, 3], [0, 0])];
  it('joins lines into a polygon even when drawn in another direction', () => {
    expect(loopPolygon(rect, ['l1', 'l2', 'l3', 'l4'])).toHaveLength(4);
    const turned = [rect[0]!, rect[2]!, rect[1]!, rect[3]!];
    expect(loopPolygon(turned, ['l1', 'l3', 'l2', 'l4'])).toHaveLength(4);
  });
  it('gives a ring for a circle and refuses curves that do not join', () => {
    const c: SketchCurve = { id: 'c1', type: 'circle', construction: false, fullyConstrained: false, center: [1, 1], radius: 2 };
    const ring = loopPolygon([c], ['c1']);
    expect(ring.length).toBeGreaterThan(30);
    expect(Math.hypot(ring[0]![0] - 1, ring[0]![1] - 1)).toBeCloseTo(2);
    expect(loopPolygon([rect[0]!, rect[2]!], ['l1', 'l3'])).toEqual([]);
    expect(loopPolygon(rect, ['l1', 'nope'])).toEqual([]);
  });
  it('runs an arc counter-clockwise from start to end', () => {
    const a: SketchCurve = { id: 'a1', type: 'arc', construction: false, fullyConstrained: false, center: [0, 0], start: [1, 0], end: [0, 1], radius: 1 };
    const pts = curvePoints(a);
    expect(pts[0]).toEqual([1, 0]); expect(pts[pts.length - 1]).toEqual([0, 1]);
    expect(pts[Math.floor(pts.length / 2)]![0]).toBeGreaterThan(0.5); // through the first quadrant, not the long way round
  });
});

describe('tools', () => {
  it('rectangle: first click waits, second draws, a flat one is refused', () => {
    let r = onClick('rect', [], [1, 1]);
    expect(r).toEqual({ steps: [], pending: [[1, 1]] });
    expect(onClick('rect', r.pending, [1, 5]).message).toMatch(/width and a height/);
    r = onClick('rect', r.pending, [6, 4]);
    expect(r.steps).toEqual([{ command: 'sketch.rectangle.two_point', params: { p0: [1, 1], p1: [6, 4] } }]);
    expect(r.pending).toEqual([]);
  });
  it('circle: centre then a point on it gives the diameter', () => {
    const r = onClick('circle', [[0, 0]], [3, 4]);
    expect(r.steps[0]).toEqual({ command: 'sketch.circle.center', params: { center: [0, 0], diameter: 10 } });
  });
  it('line: chains segments and ends when it closes on the first point', () => {
    let r = onClick('line', [], [0, 0]);
    r = onClick('line', r.pending, [10, 0]);
    expect(r.steps[0]!.params).toEqual({ points: [[0, 0], [10, 0]] }); expect(r.pending).toEqual([[0, 0], [10, 0]]);
    const open = onClick('line', [[0, 0], [10, 0]], [10, 5]);
    expect(open.pending).toEqual([[0, 0], [10, 0], [10, 5]]);
    // back on the start after one segment is not a closed shape; after two it is
    expect(onClick('line', [[0, 0], [10, 0]], [0, 0]).pending).toEqual([[0, 0], [10, 0], [0, 0]]);
    const closed = onClick('line', [[0, 0], [10, 0], [10, 5]], [0, 0]);
    expect(closed.pending).toEqual([]);
    expect(closed.steps[0]!.params).toEqual({ points: [[10, 5], [0, 0]] });
    expect(onClick('line', [[2, 2]], [2, 2]).steps).toEqual([]);
  });
  it('typed numbers: rectangle goes toward the cursor, circle is a diameter, line takes a length and an optional angle', () => {
    expect(onTyped('rect', [[10, 10]], [0, 0], '40,30').steps[0]!.params).toEqual({ p0: [10, 10], p1: [-30, -20] });
    expect(onTyped('rect', [[0, 0]], [5, 5], '20').steps[0]!.params).toEqual({ p0: [0, 0], p1: [20, 20] });
    expect(onTyped('circle', [[1, 2]], [9, 9], '12.5').steps[0]!.params).toEqual({ center: [1, 2], diameter: 12.5 });
    expect(onTyped('line', [[0, 0]], [3, 0], '25').steps[0]!.params).toEqual({ points: [[0, 0], [25, 0]] });
    const ang = onTyped('line', [[0, 0]], [3, 0], '10,90');
    expect(ang.steps[0]!.params).toEqual({ points: [[0, 0], [0, 10]] }); expect(ang.pending).toEqual([[0, 0], [0, 10]]);
    expect(onTyped('rect', [[0, 0]], [1, 1], 'abc').message).toMatch(/Type numbers/);
    expect(onTyped('rect', [[0, 0]], [1, 1], '0,5').message).toMatch(/above 0/);
  });
  it('dimension step by curve type', () => {
    expect(dimensionFor({ id: 'l1', type: 'line' }, '50')).toEqual({ command: 'sketch.dimension', params: { entities: ['l1'], type: 'length', value: 50 } });
    expect(dimensionFor({ id: 'c1', type: 'circle' }, 'width / 2')!.params).toEqual({ entities: ['c1'], type: 'diameter', value: 'width / 2' });
    expect(dimensionFor({ id: 'a1', type: 'arc' }, '5')!.params.type).toBe('radius');
    expect(dimensionFor({ id: 'x', type: 'other' }, '5')).toBeNull();
  });
});

const sk = (over: Partial<Sketch> = {}): Sketch => ({
  id: 1, name: 'S', visible: true, active: true, plane: ORIGIN_PLANES.XY, dof: 3, dimensions: [], profiles: [],
  curves: [line('l1', [0, 0], [10, 0]), line('l2', [10, 0], [10, 5]), { id: 'c1', type: 'circle', construction: false, fullyConstrained: false, center: [3, 3], radius: 1 }],
  points: [{ id: 'p1', at: [0, 0], fixed: false }, { id: 'p2', at: [10, 0], fixed: false }, { id: 'c1.center', at: [3, 3], fixed: false }], ...over,
});

describe('pick', () => {
  it('measures the distance to lines and circles', () => {
    expect(distToCurve(line('l', [0, 0], [10, 0]), [5, 3])).toBeCloseTo(3);
    expect(distToCurve(line('l', [0, 0], [10, 0]), [14, 3])).toBeCloseTo(5);
    expect(distToCurve(sk().curves[2]!, [3, 5])).toBeCloseTo(1, 1);
  });
  it('prefers a point over the lines through it, and honours the mode', () => {
    const s = sk();
    expect(pickEntity(s, [10.1, 0.1], 0.5, 'any')).toEqual({ kind: 'point', id: 'p2' });
    expect(pickEntity(s, [10.1, 0.1], 0.5, 'curve')).toMatchObject({ kind: 'curve' });
    expect(pickEntity(s, [5, 0.2], 0.5, 'any')).toEqual({ kind: 'curve', id: 'l1', type: 'line' });
    expect(pickEntity(s, [5, 0.2], 0.5, 'point')).toBeNull();
    expect(pickEntity(s, [20, 20], 0.5, 'any')).toBeNull();
    expect(pickEntity(s, [3.1, 3.0], 0.5, 'any')).toEqual({ kind: 'point', id: 'c1.center' });
  });
});

describe('more draw tools', () => {
  it('centre rectangle: centre then a corner; typed numbers are the full width and height', () => {
    expect(onClick('rectCenter', [[5, 5]], [8, 7]).steps[0]).toEqual({ command: 'sketch.rectangle.center', params: { center: [5, 5], corner: [8, 7] } });
    expect(onClick('rectCenter', [[5, 5]], [8, 5]).message).toMatch(/width and a height/);
    expect(onTyped('rectCenter', [[0, 0]], [1, 1], '40,30').steps[0]!.params).toEqual({ center: [0, 0], corner: [20, 15] });
  });
  it('two-point circle: the two ends of the diameter; typed diameter goes toward the cursor', () => {
    expect(onClick('circle2', [[0, 0]], [10, 0]).steps[0]).toEqual({ command: 'sketch.circle.two_point', params: { p0: [0, 0], p1: [10, 0] } });
    expect(onTyped('circle2', [[0, 0]], [0, 5], '8').steps[0]!.params).toEqual({ p0: [0, 0], p1: [0, 8] });
  });
  it('3-point arc: start, end, then a point it passes through (not in line with them)', () => {
    let r = onClick('arc3', [], [0, 0]); expect(r.pending).toEqual([[0, 0]]);
    r = onClick('arc3', r.pending, [10, 0]); expect(r.pending).toEqual([[0, 0], [10, 0]]); expect(r.steps).toEqual([]);
    expect(onClick('arc3', r.pending, [5, 0]).message).toMatch(/must not lie on the line/);
    const done = onClick('arc3', r.pending, [5, 5]);
    expect(done.steps[0]).toEqual({ command: 'sketch.arc.three_point', params: { start: [0, 0], end: [10, 0], through: [5, 5] } }); expect(done.pending).toEqual([]);
  });
  it('slot: two centres, then the width from the pointer distance to the centre line', () => {
    const r = onClick('slot', [[0, 0], [20, 0]], [10, 4]);
    expect(r.steps[0]).toEqual({ command: 'sketch.slot.center_to_center', params: { p0: [0, 0], p1: [20, 0], width: 8 } });
    expect(onClick('slot', [[0, 0], [20, 0]], [10, 0]).message).toMatch(/centre line/);
    expect(onTyped('slot', [[0, 0], [20, 0]], [0, 0], '6').steps[0]!.params).toMatchObject({ width: 6 });
    expect(onTyped('slot', [[0, 0]], [0, 0], '6').message).toMatch(/Click/);
  });
  it('knows which tools draw', () => { expect(isDraw('slot')).toBe(true); expect(isDraw('trim')).toBe(false); expect(isDraw(null)).toBe(false); });
});

describe('preview', () => {
  it('shows the next shape while the pointer moves', () => {
    expect(preview('rect', [[0, 0]], [4, 3])[0]).toHaveLength(5);
    expect(preview('line', [[0, 0], [1, 1]], [4, 3])).toEqual([[[1, 1], [4, 3]]]);
    expect(preview('rect', [], [1, 1])).toEqual([]);
    const c = preview('circle', [[0, 0]], [3, 4])[0]!;
    expect(Math.hypot(c[10]![0], c[10]![1])).toBeCloseTo(5);
    const arc = preview('arc3', [[0, 0], [10, 0]], [5, 5])[0]!;
    expect(arc[0]).toEqual([0, 0]); expect(arc[arc.length - 1]![0]).toBeCloseTo(10); expect(Math.max(...arc.map((q) => q[1]))).toBeCloseTo(5, 0);
    const down = preview('arc3', [[0, 0], [10, 0]], [5, -5])[0]!; expect(Math.min(...down.map((q) => q[1]))).toBeCloseTo(-5, 0);
    expect(preview('slot', [[0, 0], [20, 0]], [10, 3])).toHaveLength(4);
  });
  it('circleThrough finds the centre, and refuses a straight line', () => {
    const c = circleThrough([0, 0], [10, 0], [5, 5])!;
    expect(c.center[0]).toBeCloseTo(5); expect(c.center[1]).toBeCloseTo(0); expect(c.r).toBeCloseTo(5);
    expect(circleThrough([0, 0], [1, 1], [2, 2])).toBeNull();
  });
});

describe('constraintStep', () => {
  const L = (id: string) => ({ kind: 'curve' as const, id, type: 'line' }), P = (id: string) => ({ kind: 'point' as const, id });
  it('horizontal/vertical: one line, or two points', () => {
    expect(constraintStep('horizontal', [])).toEqual({ done: false });
    expect(constraintStep('horizontal', [L('l1')]).step).toEqual({ command: 'sketch.constraint.horizontal_vertical', params: { line: 'l1' } });
    expect(constraintStep('horizontal', [P('p1')])).toEqual({ done: false });
    expect(constraintStep('horizontal', [P('p1'), P('p2')]).step!.params).toEqual({ points: ['p1', 'p2'] });
    expect(constraintStep('horizontal', [{ kind: 'curve', id: 'c1', type: 'circle' }]).message).toMatch(/line/);
  });
  it('coincident puts the point first, in either pick order', () => {
    expect(constraintStep('coincident', [L('l1'), P('p3')]).step!.params).toEqual({ a: 'p3', b: 'l1' });
    expect(constraintStep('coincident', [P('p1'), P('p2')]).step!.params).toEqual({ a: 'p1', b: 'p2' });
  });
  it('midpoint needs a point and a line; the pair tools need two curves; fix needs one entity', () => {
    expect(constraintStep('midpoint', [L('l1'), P('p1')]).step!.params).toEqual({ point: 'p1', line: 'l1' });
    expect(constraintStep('midpoint', [P('p1'), P('p2')]).message).toMatch(/point and a line/);
    expect(constraintStep('parallel', [L('l1')])).toEqual({ done: false });
    expect(constraintStep('perpendicular', [L('l1'), L('l2')]).step).toEqual({ command: 'sketch.constraint.perpendicular', params: { a: 'l1', b: 'l2' } });
    expect(constraintStep('tangent', [L('l1'), L('c1')]).step!.command).toBe('sketch.constraint.tangent');
    expect(constraintStep('fix', [P('p1')]).step!.params).toEqual({ entity: 'p1' });
  });
});
