import { describe, expect, it } from 'vitest';
import type { SketchCurve } from '../api';
import { angleLayout, distanceLayout, pointLineLayout } from './dimGeometry';

const line = (a: [number, number], b: [number, number]): SketchCurve => ({ id: 'l', type: 'line', start: a, end: b } as SketchCurve);
const deg = (d: number) => (d * Math.PI) / 180;

describe('angleLayout', () => {
  it('draws the arc round the corner of two lines that meet, with its label out beyond the middle of the arc', () => {
    const r = angleLayout(line([0, 0], [40, 0]), line([0, 0], [0, 30]), deg(90), 10)!;
    expect(r.vertex).toEqual([0, 0]);
    expect(r.degrees).toBeCloseTo(90);
    expect(r.arc[0]).toEqual([10, 0]);
    expect(r.arc[24]![0]).toBeCloseTo(0, 6); expect(r.arc[24]![1]).toBeCloseTo(10, 6);
    expect(r.label[0]).toBeCloseTo(14 * Math.cos(deg(45)), 6);
  });
  it('finds the corner of lines that only meet when extended, and measures from the near end of each', () => {
    const r = angleLayout(line([10, 0], [40, 0]), line([0, 10], [0, 40]), deg(90), 5)!;
    expect(r.vertex[0]).toBeCloseTo(0); expect(r.vertex[1]).toBeCloseTo(0);
    expect(r.degrees).toBeCloseTo(90);
  });
  it('draws the acute sector for an acute value and the other one when the value is nearer the supplement', () => {
    const a = line([0, 0], [40, 0]), b = line([0, 0], [-30, 30]); // 135 degrees apart as rays
    expect(angleLayout(a, b, deg(45), 10)!.degrees).toBeCloseTo(45);
    expect(angleLayout(a, b, deg(135), 10)!.degrees).toBeCloseTo(135);
  });
  it('has nothing to draw for parallel lines', () => {
    expect(angleLayout(line([0, 0], [10, 0]), line([0, 5], [10, 5]), deg(0), 5)).toBeNull();
  });
});

describe('distanceLayout', () => {
  it('puts the aligned dimension line beside the line joining the points, label in the middle of it', () => {
    const r = distanceLayout([0, 0], [40, 0], 'distance', 6);
    expect(r.segments[2]).toEqual([[0, 6], [40, 6]]);
    expect(r.label[0]).toBeCloseTo(20); expect(r.label[1]).toBeGreaterThan(6);
  });
  it('puts a horizontal one above the higher point and a vertical one right of the further one', () => {
    const h = distanceLayout([0, 0], [30, 10], 'distance_x', 5);
    expect(h.segments[2]).toEqual([[0, 15], [30, 15]]);
    const v = distanceLayout([0, 0], [30, 10], 'distance_y', 5);
    expect(v.segments[2]).toEqual([[35, 0], [35, 10]]);
  });
});

describe('pointLineLayout', () => {
  it('drops a perpendicular from the point to the line', () => {
    const r = pointLineLayout([10, 20], line([0, 0], [40, 0]), 4)!;
    expect(r.foot).toEqual([10, 0]);
    expect(r.segments).toEqual([[[10, 20], [10, 0]]]);
  });
});
