import { describe, expect, it } from 'vitest';
import type { SketchCurve } from '../api';
import { lineChain, offsetChain, sideDistance } from './offsetChain';

const line = (id: string, a: [number, number], b: [number, number], construction = false): SketchCurve => ({ id, type: 'line', start: a, end: b, construction } as SketchCurve);
const square = [line('a', [0, 0], [10, 0]), line('b', [10, 0], [10, 10]), line('c', [10, 10], [0, 10]), line('d', [0, 10], [0, 0])];

describe('lineChain', () => {
  it('finds the whole closed outline from any one line', () => {
    for (const c of square) { const ch = lineChain(square, c.id)!; expect(ch.closed).toBe(true); expect(ch.points).toHaveLength(4); }
  });
  it('follows an open chain both ways from a line in the middle, and says where the picked one is', () => {
    const open = [line('a', [0, 0], [10, 0]), line('b', [10, 0], [10, 10]), line('c', [10, 10], [0, 10])];
    const ch = lineChain(open, 'b')!;
    expect(ch.closed).toBe(false);
    expect(ch.points).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(ch.picked).toBe(1);
  });
  it('leaves construction lines out and gives up when the chain branches or an arc joins it', () => {
    expect(lineChain([...square, line('x', [0, 0], [5, 5], true)], 'a')!.closed).toBe(true);
    expect(lineChain([...square, line('y', [0, 0], [-5, -5])], 'a')).toBeNull();
    expect(lineChain([...square, { id: 'r', type: 'arc', start: [10, 10], end: [20, 10], center: [15, 10] } as SketchCurve], 'a')).toBeNull();
  });
});

describe('offsetChain', () => {
  it('moves a square outline outward or inward with mitred corners', () => {
    const ch = lineChain(square, 'a')!;
    // the walk a, b, c, d goes counter-clockwise: positive is to the left, inside
    expect(offsetChain(ch, 2).slice(0, 4).map((p) => p.map((v) => Math.round(v * 1000) / 1000))).toEqual([[2, 2], [8, 2], [8, 8], [2, 8]]);
    expect(offsetChain(ch, -2).slice(0, 4).map((p) => p.map((v) => Math.round(v * 1000) / 1000))).toEqual([[-2, -2], [12, -2], [12, 12], [-2, 12]]);
    expect(offsetChain(ch, 2)).toHaveLength(5); // closed: the first point again
  });
  it('moves an open chain with its two ends square to their lines', () => {
    const ch = lineChain([line('a', [0, 0], [10, 0]), line('b', [10, 0], [10, 10])], 'a')!;
    expect(offsetChain(ch, 1).map((p) => p.map((v) => Math.round(v * 1000) / 1000))).toEqual([[0, 1], [9, 1], [9, 10]]);
  });
  it('tells which side of the picked line a point is on', () => {
    const ch = lineChain(square, 'a')!;
    expect(sideDistance(ch, [5, 3])).toBeCloseTo(3); // inside: left of a walk to the right
    expect(sideDistance(ch, [5, -4])).toBeCloseTo(-4);
  });
});
