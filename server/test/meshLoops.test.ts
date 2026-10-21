import { describe, expect, it } from 'vitest';
import { fitCircle, ringArea, ringToPieces, simplifyRing, type V2 } from '../src/mesh/loops';

const circle = (cx: number, cy: number, r: number, n: number, from = 0, to = Math.PI * 2, closed = true): V2[] =>
  Array.from({ length: closed ? n : n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as V2; });

describe('simplifyRing', () => {
  it('drops points that are on the line between their neighbours and repeated points', () => {
    expect(simplifyRing([[0, 0], [5, 0], [10, 0], [10, 10], [10, 10], [0, 10]], 0.05)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });
});

describe('fitCircle', () => {
  it('finds the centre and radius of points on a circle', () => {
    const f = fitCircle(circle(3, -2, 5, 12))!;
    expect(f.c[0]).toBeCloseTo(3, 6); expect(f.c[1]).toBeCloseTo(-2, 6); expect(f.r).toBeCloseTo(5, 6);
  });
  it('gives nothing for points in a line', () => { expect(fitCircle([[0, 0], [1, 0], [2, 0]])).toBeNull(); });
});

describe('ringToPieces', () => {
  it('turns a tessellated hole into one circle', () => {
    const p = ringToPieces(circle(10, 10, 4, 48), 0.05)!;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: 'circle', radius: expect.closeTo(4, 2) });
  });
  it('keeps a rectangle as four lines (its four corners are on a circle, but they turn 90 degrees)', () => {
    const p = ringToPieces([[0, 0], [20, 0], [20, 10], [0, 10]], 0.05)!;
    expect(p.map((x) => x.kind)).toEqual(['line', 'line', 'line', 'line']);
  });
  it('finds the rounded corner of a plate as an arc between lines', () => {
    const arc = circle(8, 8, 8, 8, Math.PI, Math.PI * 1.5, false); // from (0,8) round to (8,0)
    const p = ringToPieces([...arc, [30, 0], [30, 20], [0, 20]], 0.05)!;
    expect(p.filter((x) => x.kind === 'arc')).toHaveLength(1);
    expect(p.filter((x) => x.kind === 'line')).toHaveLength(4);
  });
  it('finds a slot: two lines joined by two half circles without any sharp corner', () => {
    const left = circle(0, 0, 5, 10, Math.PI / 2, Math.PI * 1.5, false), right = circle(30, 0, 5, 10, -Math.PI / 2, Math.PI / 2, false);
    const p = ringToPieces([...left, ...right], 0.05)!;
    expect(p.filter((x) => x.kind === 'arc')).toHaveLength(2);
    expect(p.filter((x) => x.kind === 'line')).toHaveLength(2);
  });
  it('turns a smooth ring that is not a circle into arcs that join end to end', () => {
    const ellipse: V2[] = Array.from({ length: 40 }, (_, i) => [10 * Math.cos((i / 40) * Math.PI * 2), 4 * Math.sin((i / 40) * Math.PI * 2)]);
    const p = ringToPieces(ellipse, 0.05)!;
    expect(p.length).toBeGreaterThan(2);
    const ends = p.map((x) => (x.kind === 'circle' ? null : [x.kind === 'line' ? x.from : x.from, x.to] as [V2, V2]));
    for (let i = 0; i < p.length; i++) expect(ends[i]![1]).toEqual(ends[(i + 1) % p.length]![0]);
  });
});

describe('ringArea', () => {
  it('is positive counter-clockwise and negative clockwise', () => {
    expect(ringArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBeCloseTo(100);
    expect(ringArea([[0, 0], [0, 10], [10, 10], [10, 0]])).toBeCloseTo(-100);
  });
});
