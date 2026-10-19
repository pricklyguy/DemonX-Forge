// Fusion-style snapping for the sketch: ends, centres, intersections, midpoints, and alignment with other points.
import type { SketchCurve, Vec2 } from '../api';
import { curvePoints } from './loops';

export type PointKind = 'end' | 'center' | 'inter' | 'mid' | 'origin';
export type Inference =
  | { kind: PointKind; point: Vec2 }
  | { kind: 'align'; x?: { value: number; from: Vec2 }; y?: { value: number; from: Vec2 } };

const TAU = Math.PI * 2;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The middle of a curve: a line's midpoint, an arc's halfway point. (A circle has no end to take a middle of.) */
export function midpoint(c: SketchCurve): Vec2 | null {
  if (c.type === 'line' && c.start && c.end) return [(c.start[0] + c.end[0]) / 2, (c.start[1] + c.end[1]) / 2];
  if (c.type === 'arc' && c.center && c.start && c.end) {
    const a0 = Math.atan2(c.start[1] - c.center[1], c.start[0] - c.center[0]);
    let sweep = Math.atan2(c.end[1] - c.center[1], c.end[0] - c.center[0]) - a0;
    while (sweep <= 1e-9) sweep += TAU;
    const r = dist(c.start, c.center), a = a0 + sweep / 2;
    return [c.center[0] + r * Math.cos(a), c.center[1] + r * Math.sin(a)];
  }
  return null;
}

const segIntersect = (p: Vec2, p2: Vec2, q: Vec2, q2: Vec2): Vec2 | null => {
  const rx = p2[0] - p[0], ry = p2[1] - p[1], sx = q2[0] - q[0], sy = q2[1] - q[1];
  const den = rx * sy - ry * sx; if (Math.abs(den) < 1e-12) return null;
  const t = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / den, u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [p[0] + t * rx, p[1] + t * ry];
};

/** Where two curves cross. Round curves are followed as short segments, then the point is moved back onto the circle. */
export function intersections(a: SketchCurve, b: SketchCurve): Vec2[] {
  const pa = curvePoints(a), pb = curvePoints(b); if (pa.length < 2 || pb.length < 2) return [];
  const closed = (c: SketchCurve, p: Vec2[]) => (c.type === 'circle' ? [...p, p[0]!] : p);
  const A = closed(a, pa), B = closed(b, pb), out: Vec2[] = [];
  for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
    let x = segIntersect(A[i - 1]!, A[i]!, B[j - 1]!, B[j]!); if (!x) continue;
    for (const c of [a, b]) if ((c.type === 'circle' || c.type === 'arc') && c.center) {
      const r = c.type === 'circle' ? c.radius! : dist(c.start!, c.center), d = dist(x, c.center);
      if (d > 1e-9) x = [c.center[0] + ((x[0] - c.center[0]) * r) / d, c.center[1] + ((x[1] - c.center[1]) * r) / d];
    }
    if (!out.some((o) => dist(o, x!) < 1e-6)) out.push(x);
  }
  return out;
}

const nearest = (raw: Vec2, pts: Vec2[], tol: number): Vec2 | null => {
  let best: Vec2 | null = null, bd = tol;
  for (const p of pts) { const d = dist(raw, p); if (d <= bd) { bd = d; best = p; } }
  return best;
};

/**
 * What the pointer snaps to, in Fusion's order: ends and centres, then crossings, then midpoints, then alignment
 * (the same x or y as another point, or as the point the shape under way started from).
 */
export function inferSnap(raw: Vec2, curves: SketchCurve[], tol: number, last?: Vec2): Inference | null {
  const ends: Vec2[] = [[0, 0]], mids: Vec2[] = [], inters: Vec2[] = [];
  for (const c of curves) {
    if (c.start) ends.push(c.start); if (c.end) ends.push(c.end); if (c.center) ends.push(c.center);
    const m = midpoint(c); if (m) mids.push(m);
  }
  const hitEnd = nearest(raw, ends, tol);
  if (hitEnd) return { kind: hitEnd[0] === 0 && hitEnd[1] === 0 ? 'origin' : 'end', point: hitEnd };
  // crossings: only curves whose bounding box reaches the pointer are worth testing
  const near = curves.filter((c) => { const p = curvePoints(c); if (!p.length) return false; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return raw[0] >= x0 - tol && raw[0] <= x1 + tol && raw[1] >= y0 - tol && raw[1] <= y1 + tol; });
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) inters.push(...intersections(near[i]!, near[j]!));
  const hitInter = nearest(raw, inters, tol);
  if (hitInter) return { kind: 'inter', point: hitInter };
  const hitMid = nearest(raw, mids, tol);
  if (hitMid) return { kind: 'mid', point: hitMid };
  // alignment with the other points (and with where the current shape began)
  const keys = [...ends, ...mids, ...(last ? [last] : [])];
  let ax: { value: number; from: Vec2 } | undefined, ay: { value: number; from: Vec2 } | undefined;
  for (const k of keys) {
    if (Math.abs(k[0] - raw[0]) <= tol && (!ax || Math.abs(k[0] - raw[0]) < Math.abs(ax.value - raw[0]))) ax = { value: k[0], from: k };
    if (Math.abs(k[1] - raw[1]) <= tol && (!ay || Math.abs(k[1] - raw[1]) < Math.abs(ay.value - raw[1]))) ay = { value: k[1], from: k };
  }
  return ax || ay ? { kind: 'align', ...(ax ? { x: ax } : {}), ...(ay ? { y: ay } : {}) } : null;
}
