import { describe, expect, it } from 'vitest';
import type { Profile, SketchCurve, Vec2 } from '../api';
import { findRegions } from './regions';

const line = (id: string, a: Vec2, b: Vec2): SketchCurve => ({ id, type: 'line', construction: false, fullyConstrained: false, start: a, end: b });
const circle = (id: string, c: Vec2, r: number): SketchCurve => ({ id, type: 'circle', construction: false, fullyConstrained: false, center: c, radius: r });
const rect = (x0: number, y0: number, x1: number, y1: number): SketchCurve[] => [line('r1', [x0, y0], [x1, y0]), line('r2', [x1, y0], [x1, y1]), line('r3', [x1, y1], [x0, y1]), line('r4', [x0, y1], [x0, y0])];
const area = (p: Vec2[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
const prof = (index: number, a: number, c: Vec2): Profile => ({ index, area: a, centroid: c, curves: [], holes: [] });

describe('findRegions', () => {
  it('finds a lone rectangle', () => {
    const r = findRegions(rect(0, 0, 40, 30), [prof(0, 1200, [20, 15])]);
    expect(r).toHaveLength(1); expect(area(r[0]!.outer)).toBeCloseTo(1200, 3);
  });

  it('splits a rectangle and a circle that cross into three regions (the lens is its own shape)', () => {
    // the circle's centre sits on the rectangle's right edge: two halves of equal area and the rest of the rectangle
    const curves = [...rect(0, 0, 40, 30), circle('c1', [40, 15], 15)];
    const r = findRegions(curves, [prof(0, 846.5708, [14.3, 15]), prof(1, 353.4292, [33.63, 15]), prof(2, 353.4292, [46.37, 15])]);
    expect(r.map((x) => x.index).sort()).toEqual([0, 1, 2]);
    const byIndex = Object.fromEntries(r.map((x) => [x.index, area(x.outer)]));
    expect(byIndex[0]).toBeCloseTo(846.57, 0); expect(byIndex[1]).toBeCloseTo(353.43, 0); expect(byIndex[2]).toBeCloseTo(353.43, 0);
    // region 1 is the half inside the rectangle: all its points have x <= 40; region 2 is outside it
    expect(Math.max(...r.find((x) => x.index === 1)!.outer.map((p) => p[0]))).toBeLessThanOrEqual(40.001);
    expect(Math.min(...r.find((x) => x.index === 2)!.outer.map((p) => p[0]))).toBeGreaterThanOrEqual(39.999);
  });

  it('leaves a hole where a circle sits inside a rectangle, and gives the disc as its own region', () => {
    const curves = [...rect(0, 0, 40, 30), circle('c1', [20, 15], 5)];
    const disc = Math.PI * 25;
    const r = findRegions(curves, [prof(0, 1200 - disc, [20, 15]), prof(1, disc, [20, 15])]);
    expect(r).toHaveLength(2);
    const plate = r.find((x) => x.holes.length === 1);
    expect(plate).toBeTruthy(); expect(r.find((x) => x.holes.length === 0 && area(x.outer) < 100)).toBeTruthy();
  });

  it('ignores construction lines and open lines', () => {
    const curves = [...rect(0, 0, 10, 10), { ...line('k', [0, 0], [10, 10]), construction: true }, line('open', [20, 0], [30, 0])];
    expect(findRegions(curves, [prof(0, 100, [5, 5])])).toHaveLength(1);
  });
});
