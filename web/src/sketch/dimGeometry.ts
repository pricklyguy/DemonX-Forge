// Where to draw the lines and the label of an angle dimension and of a distance dimension. Pure: sketch coordinates in, sketch coordinates out.
import type { SketchCurve, Vec2 } from '../api';

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];

export interface AngleLayout {
  vertex: Vec2;
  /** the arc, as points from one line to the other */
  arc: Vec2[];
  /** where the label goes */
  label: Vec2;
  /** the angle drawn, in degrees (the acute one or its supplement, whichever the dimension's value is nearer) */
  degrees: number;
}

/** The sector between two lines that an angle dimension of `value` (radians) measures, as an arc of radius `r`; null for parallel lines. */
export function angleLayout(a: SketchCurve, b: SketchCurve, value: number, r: number): AngleLayout | null {
  if (!a.start || !a.end || !b.start || !b.end) return null;
  const da = sub(a.end, a.start), db = sub(b.end, b.start), den = cross(da, db);
  if (Math.abs(den) < 1e-9 * len(da) * len(db)) return null;
  const t = cross(sub(b.start, a.start), db) / den;
  const v = add(a.start, mul(da, t));
  // the ray of each line from the vertex towards its far end
  const far = (c: SketchCurve) => (len(sub(c.start!, v)) >= len(sub(c.end!, v)) ? c.start! : c.end!);
  const ra = unit(sub(far(a), v)), rb = unit(sub(far(b), v));
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(ra, rb))));
  const useRays = Math.abs(value - theta) <= Math.abs(value - (Math.PI - theta));
  const second: Vec2 = useRays ? rb : [-rb[0], -rb[1]];
  const sweepAbs = useRays ? theta : Math.PI - theta;
  const sign = cross(ra, second) >= 0 ? 1 : -1, start = Math.atan2(ra[1], ra[0]);
  const arc: Vec2[] = Array.from({ length: 25 }, (_, i) => { const ang = start + sign * sweepAbs * (i / 24); return [v[0] + r * Math.cos(ang), v[1] + r * Math.sin(ang)] as Vec2; });
  const mid = start + (sign * sweepAbs) / 2;
  return { vertex: v, arc, label: [v[0] + r * 1.4 * Math.cos(mid), v[1] + r * 1.4 * Math.sin(mid)], degrees: (sweepAbs * 180) / Math.PI };
}

export interface DistanceLayout {
  /** line segments to draw (extension lines and the dimension line), as pairs of points */
  segments: [Vec2, Vec2][];
  label: Vec2;
}

/** The dimension line between two points: along the line joining them (`distance`), or across (`distance_x`) or up (`distance_y`), set `off` away from the points. */
export function distanceLayout(p: Vec2, q: Vec2, kind: 'distance' | 'distance_x' | 'distance_y', off: number): DistanceLayout {
  if (kind === 'distance_x') {
    const y = Math.max(p[1], q[1]) + off;
    return { segments: [[p, [p[0], y]], [q, [q[0], y]], [[p[0], y], [q[0], y]]], label: [(p[0] + q[0]) / 2, y + off * 0.4] };
  }
  if (kind === 'distance_y') {
    const x = Math.max(p[0], q[0]) + off;
    return { segments: [[p, [x, p[1]]], [q, [x, q[1]]], [[x, p[1]], [x, q[1]]]], label: [x + off * 0.4, (p[1] + q[1]) / 2] };
  }
  const d = unit(sub(q, p)), n: Vec2 = [-d[1], d[0]], o = mul(n, off);
  return { segments: [[p, add(p, o)], [q, add(q, o)], [add(p, o), add(q, o)]], label: add(mul(add(p, q), 0.5), mul(o, 1.35)) };
}

/** From a point to a line: the foot of the perpendicular, the segment to it and the label beside its middle. */
export function pointLineLayout(p: Vec2, line: SketchCurve, off: number): { foot: Vec2; segments: [Vec2, Vec2][]; label: Vec2 } | null {
  if (!line.start || !line.end) return null;
  const d = sub(line.end, line.start), l2 = dot(d, d); if (l2 < 1e-18) return null;
  const t = dot(sub(p, line.start), d) / l2, foot = add(line.start, mul(d, t));
  const away = unit(sub(p, foot)), mid = mul(add(p, foot), 0.5);
  return { foot, segments: [[p, foot]], label: add(mid, mul([-away[1], away[0]], off)) };
}
