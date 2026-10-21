import { describe, it, expect } from 'vitest';
import { measureOne, measureTwo, circleRadius, edgeLength, type MeasureItem } from './measure';

const seg = (a: number[], b: number[]) => [...a, ...b];
const line = (a: number[], b: number[]): MeasureItem => ({ kind: 'edge', body: 'B', index: 1, segments: seg(a, b) });
const plane = (z: number, nz = 1): MeasureItem => ({ kind: 'face', body: 'B', face: 1, area: 100, at: [5, 5, z], normal: [0, 0, nz] });
const circle = (r: number, n = 48) => { const s: number[] = []; for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n, b = (2 * Math.PI * (i + 1)) / n; s.push(r * Math.cos(a), r * Math.sin(a), 0, r * Math.cos(b), r * Math.sin(b), 0); } return s; };
const val = (rows: { label: string; value: string }[], l: string) => rows.find((r) => r.label === l)?.value;

describe('measure', () => {
  it('measures a point pair', () => {
    const r = measureTwo({ kind: 'point', at: [0, 0, 0] }, { kind: 'point', at: [3, 4, 12] });
    expect(val(r, 'Distance')).toBe('13 mm'); expect(val(r, 'ΔX')).toBe('3 mm'); expect(val(r, 'ΔZ')).toBe('12 mm');
  });
  it('gives the length of an edge and the diameter of a whole circle, not an arc', () => {
    expect(val(measureOne(line([0, 0, 0], [30, 40, 0])), 'Length')).toBe('50 mm');
    const c = circle(5);
    expect(circleRadius(c)).toBeCloseTo(5, 2);
    expect(val(measureOne({ kind: 'edge', body: 'B', index: 2, segments: c }), 'Diameter')).toBe('10 mm');
    expect(circleRadius(c.slice(0, 6 * 24))).toBeNull();
    expect(edgeLength(c)).toBeGreaterThan(31);
  });
  it('measures two parallel flat faces and two tilted ones', () => {
    const r = measureTwo(plane(0), plane(12, -1));
    expect(val(r, 'Distance between the planes')).toBe('12 mm');
    const tilted: MeasureItem = { kind: 'face', body: 'B', face: 2, area: 10, at: [0, 0, 0], normal: [0, Math.SQRT1_2, Math.SQRT1_2] };
    expect(val(measureTwo(plane(0), tilted), 'Angle between the planes')).toBe('45°');
  });
  it('measures a point to a face, an edge to an edge, and two round holes', () => {
    expect(val(measureTwo({ kind: 'point', at: [1, 1, 9] }, plane(2)), 'Distance to the plane')).toBe('7 mm');
    const r = measureTwo(line([0, 0, 0], [10, 0, 0]), line([0, 5, 0], [0, 5, 10]));
    expect(val(r, 'Closest distance')).toBe('5 mm'); expect(val(r, 'Angle')).toBe('90°');
    const hole = (x: number): MeasureItem => ({ kind: 'face', body: 'B', face: 3, area: 5, at: [x, 0, 0], cylinder: { origin: [x, 0, 0], axis: [0, 0, 1], radius: 2 } });
    expect(val(measureTwo(hole(0), hole(15)), 'Distance between the axes')).toBe('15 mm');
  });
  it('says so when a pair has no answer', () => {
    expect(val(measureTwo(plane(0), { kind: 'face', body: 'B', face: 3, area: 5, at: [0, 0, 0], cylinder: { origin: [0, 0, 0], axis: [1, 0, 0], radius: 1 } }), 'Note')).toBeTruthy();
  });
});
