import { describe, expect, it } from 'vitest';
import type { SketchCurve } from '../api';
import { inferSnap, intersections, midpoint } from './inference';

const line = (id: string, a: [number, number], b: [number, number]): SketchCurve => ({ id, type: 'line', start: a, end: b } as SketchCurve);
const circle = (id: string, c: [number, number], r: number): SketchCurve => ({ id, type: 'circle', center: c, radius: r } as SketchCurve);

describe('inference', () => {
  it('finds the midpoint of a line', () => {
    expect(midpoint(line('a', [0, 0], [10, 4]))).toEqual([5, 2]);
    expect(inferSnap([5.1, 2.1], [line('a', [0, 0], [10, 4])], 0.5)).toEqual({ kind: 'mid', point: [5, 2] });
  });
  it('prefers an end to a midpoint', () => {
    expect(inferSnap([0.1, 0], [line('a', [0, 0], [10, 0])], 0.5)?.kind).toBe('origin');
    expect(inferSnap([10.1, 0], [line('a', [0, 0], [10, 0])], 0.5)).toEqual({ kind: 'end', point: [10, 0] });
  });
  it('finds where two lines cross', () => {
    const cs = [line('a', [0, 10], [20, 10]), line('b', [8, 0], [8, 30])];
    expect(inferSnap([8.1, 10.1], cs, 0.5)).toEqual({ kind: 'inter', point: [8, 10] });
  });
  it('finds where a line meets a circle, on the circle', () => {
    const p = intersections(line('a', [-20, 0], [20, 0]), circle('c', [0, 0], 10));
    expect(p).toHaveLength(2);
    for (const q of p) expect(Math.hypot(q[0], q[1])).toBeCloseTo(10, 9);
  });
  it('aligns with another point when nothing is hit', () => {
    const cs = [line('a', [30, 30], [40, 30])];
    const s = inferSnap([30.2, 55], cs, 0.5);
    expect(s).toEqual({ kind: 'align', x: { value: 30, from: [30, 30] } });
    const t = inferSnap([30.2, 30.3 + 8], [line('a', [30, 30], [40, 30]), line('b', [60, 38.1], [70, 50])], 0.5, undefined);
    expect(t).toMatchObject({ kind: 'align', x: { value: 30 } });
  });
  it('aligns with where the shape under way began', () => {
    expect(inferSnap([12, 5.1], [], 0.5, [3, 5])).toEqual({ kind: 'align', y: { value: 5, from: [3, 5] } });
  });
  it('returns null when nothing is near', () => {
    expect(inferSnap([100, 100], [line('a', [30, 30], [40, 30])], 0.5)).toBeNull();
  });
});
