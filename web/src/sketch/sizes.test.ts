import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../api';
import { applyTyped, circleThrough, onClick, sizeBoxes, sizeFields } from './tools';

describe('size boxes for arcs and slots', () => {
  const a: Vec2 = [0, 0], b: Vec2 = [30, 0];
  it('names the boxes by stage', () => {
    expect(sizeFields('arc3', 1)).toEqual(['Length', 'Angle']);
    expect(sizeFields('arc3', 2)).toEqual(['Radius']);
    expect(sizeFields('slot', 1)).toEqual(['Length', 'Angle']);
    expect(sizeFields('slot', 2)).toEqual(['Width']);
    expect(sizeFields('rect', 1)).toEqual(['Width', 'Height']);
    expect(sizeFields('trim', 1)).toEqual([]);
  });

  it('first stage: a typed length and angle place the second point', () => {
    const p = applyTyped('arc3', [a], [10, 3], ['30', '0']);
    expect(p[0]).toBeCloseTo(30, 6); expect(p[1]).toBeCloseTo(0, 6);
    const q = applyTyped('slot', [a], [10, 3], ['20', '90']);
    expect(q[0]).toBeCloseTo(0, 6); expect(q[1]).toBeCloseTo(20, 6);
  });

  it('arc: a typed radius gives an arc of that radius on the pointer side, short way or long way', () => {
    const short = applyTyped('arc3', [a, b], [15, 5], ['20']);
    expect(circleThrough(a, b, short)!.r).toBeCloseTo(20, 6);
    expect(short[1]).toBeGreaterThan(0); expect(short[1]).toBeLessThan(20); // bulges up, less than a half circle
    const below = applyTyped('arc3', [a, b], [15, -5], ['20']);
    expect(below[1]).toBeLessThan(0);
    const long = applyTyped('arc3', [a, b], [15, 28], ['20']); // pointer past the middle of the circle: the long way round
    expect(circleThrough(a, b, long)!.r).toBeCloseTo(20, 6); expect(long[1]).toBeGreaterThan(20);
    expect(applyTyped('arc3', [a, b], [15, 5], ['10'])).toEqual([15, 5]); // too small to reach: left to the pointer
    expect(onClick('arc3', [a, b], short).steps[0]?.command).toBe('sketch.arc.three_point');
  });

  it('slot: a typed width sets the distance from the centre line (half the width)', () => {
    const p = applyTyped('slot', [a, b], [15, 2], ['10']);
    expect(p[1]).toBeCloseTo(5, 6);
    const r = onClick('slot', [a, b], p).steps[0]!;
    expect(r.command).toBe('sketch.slot.center_to_center'); expect(r.params.width).toBeCloseTo(10, 3);
    expect(applyTyped('slot', [a, b], [15, -2], ['10'])[1]).toBeCloseTo(-5, 6);
  });

  it('reads the live values from the pointer', () => {
    expect(sizeBoxes('arc3', [a, b], [15, 5])[0]!.value).toBeCloseTo(circleThrough(a, b, [15, 5])!.r, 9);
    expect(sizeBoxes('slot', [a, b], [15, 4])[0]!.value).toBeCloseTo(8, 9);
    expect(sizeBoxes('arc3', [a], [3, 4])[0]!.value).toBeCloseTo(5, 9);
  });
});
