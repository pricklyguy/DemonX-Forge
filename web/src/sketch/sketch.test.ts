import { describe, expect, it } from 'vitest';
import type { SketchCurve } from '../api';
import { loopPolygon, curvePoints } from './loops';
import { ORIGIN_PLANES, normalOf, rayToSketch, toSketch, toWorld } from './plane';
import { niceStep, snapGrid, snapPoints } from './snap';
import { dimensionFor, onClick, onTyped } from './tools';

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
