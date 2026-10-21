// The Measure tool (INSPECT tab): what to say about one picked point, edge or face, or about a pair. Pure functions, in millimetres and degrees.
import type { Vec3 } from '../../server/src/engine/Engine';

export type MeasureItem =
  | { kind: 'point'; at: Vec3 }
  | { kind: 'edge'; body: string; index: number; segments: number[] }
  | { kind: 'face'; body: string; face: number; area: number; at: Vec3; normal?: Vec3; cylinder?: { origin: Vec3; axis: Vec3; radius: number } };

export interface Row { label: string; value: string }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const fmtMm = (v: number) => `${Math.round(v * 1000) / 1000} mm`;
const fmtDeg = (r: number) => `${Math.round(((r * 180) / Math.PI) * 100) / 100}°`;

/** The corner points of an edge's mesh segments, in order of appearance without repeats. */
function edgePoints(segs: number[]): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < segs.length; i += 6) { out.push([segs[i]!, segs[i + 1]!, segs[i + 2]!], [segs[i + 3]!, segs[i + 4]!, segs[i + 5]!]); }
  return out;
}
export const edgeLength = (segs: number[]) => { let l = 0; for (let i = 0; i < segs.length; i += 6) l += Math.hypot(segs[i + 3]! - segs[i]!, segs[i + 4]! - segs[i + 1]!, segs[i + 5]! - segs[i + 2]!); return l; };

/** Segments of an edge as [a, b] pairs. */
const pairs = (segs: number[]): [Vec3, Vec3][] => { const o: [Vec3, Vec3][] = []; for (let i = 0; i < segs.length; i += 6) o.push([[segs[i]!, segs[i + 1]!, segs[i + 2]!], [segs[i + 3]!, segs[i + 4]!, segs[i + 5]!]]); return o; };

/** A straight edge's direction, or null when the edge bends. */
export function straightDir(segs: number[]): Vec3 | null {
  const ps = pairs(segs); if (!ps.length) return null;
  const a = ps[0]![0], d = unit(sub(ps[0]![1], ps[0]![0]));
  for (const [p, q] of ps) for (const r of [p, q]) if (len(cross(sub(r, a), d)) > 1e-4 * Math.max(1, edgeLength(segs))) return null;
  return d;
}

/** A closed round edge: its radius, else null. */
export function circleRadius(segs: number[]): number | null {
  const pts = edgePoints(segs); if (pts.length < 8) return null;
  const n = pts.length, c: Vec3 = [0, 0, 0];
  for (const p of pts) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
  const rs = pts.map((p) => len(sub(p, c))), r = rs.reduce((s, x) => s + x, 0) / n;
  if (!(r > 0) || Math.max(...rs.map((x) => Math.abs(x - r))) > 0.02 * r) return null;
  const L = edgeLength(segs);
  return Math.abs(L - 2 * Math.PI * r) < 0.03 * L ? r : null; // a whole circle, not an arc (its middle is not its centre)
}

const pointPoint = (a: Vec3, b: Vec3) => len(sub(a, b));
function pointSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const d = sub(b, a), l2 = dot(d, d), t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  return len(sub(p, [a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]]));
}
const pointEdge = (p: Vec3, segs: number[]) => pairs(segs).reduce((m, [a, b]) => Math.min(m, pointSegment(p, a, b)), Infinity);
/** Closest approach of two edges (to the resolution of their mesh segments, refined by one pass along each segment). */
function edgeEdge(a: number[], b: number[]): number {
  let best = Infinity;
  const sample = (segs: number[]): Vec3[] => pairs(segs).flatMap(([p, q]) => [0, 0.25, 0.5, 0.75, 1].map((t): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]));
  const pa = sample(a), pb = sample(b);
  for (const p of pa) best = Math.min(best, pointEdge(p, b));
  for (const p of pb) best = Math.min(best, pointEdge(p, a));
  return best;
}

export const describe = (it: MeasureItem): string => (it.kind === 'point' ? 'Point' : it.kind === 'edge' ? `Edge ${it.index} of ${it.body}` : `Face ${it.face} of ${it.body}`);

export function measureOne(it: MeasureItem): Row[] {
  if (it.kind === 'point') return [{ label: 'X', value: fmtMm(it.at[0]) }, { label: 'Y', value: fmtMm(it.at[1]) }, { label: 'Z', value: fmtMm(it.at[2]) }];
  if (it.kind === 'edge') {
    const rows: Row[] = [{ label: 'Length', value: fmtMm(edgeLength(it.segments)) }];
    const r = circleRadius(it.segments); if (r) rows.push({ label: 'Diameter', value: fmtMm(2 * r) }, { label: 'Radius', value: fmtMm(r) });
    return rows;
  }
  const rows: Row[] = [{ label: 'Area', value: `${Math.round(it.area * 100) / 100} mm²` }];
  if (it.cylinder) rows.push({ label: 'Diameter', value: fmtMm(2 * it.cylinder.radius) }, { label: 'Radius', value: fmtMm(it.cylinder.radius) });
  else if (it.normal) rows.push({ label: 'Flat, facing', value: `${it.normal.map((x) => Math.round(x * 1000) / 1000).join(', ')}` });
  return rows;
}

/** Distance, angle and offsets between two picks; a note when the pair is not one the tool can answer. */
export function measureTwo(a: MeasureItem, b: MeasureItem): Row[] {
  const rows: Row[] = [];
  const pt = (it: MeasureItem): Vec3 | null => (it.kind === 'point' ? it.at : null);
  if (a.kind === 'point' && b.kind === 'point') {
    const d = sub(b.at, a.at);
    return [{ label: 'Distance', value: fmtMm(len(d)) }, { label: 'ΔX', value: fmtMm(Math.abs(d[0])) }, { label: 'ΔY', value: fmtMm(Math.abs(d[1])) }, { label: 'ΔZ', value: fmtMm(Math.abs(d[2])) }];
  }
  if (a.kind === 'point' || b.kind === 'point') {
    const p = (pt(a) ?? pt(b))!, o = a.kind === 'point' ? b : a;
    if (o.kind === 'edge') return [{ label: 'Distance', value: fmtMm(pointEdge(p, o.segments)) }];
    if (o.kind === 'face' && o.normal) return [{ label: 'Distance to the plane', value: fmtMm(Math.abs(dot(sub(p, o.at), unit(o.normal)))) }];
    if (o.kind === 'face' && o.cylinder) { const ax = unit(o.cylinder.axis), v = sub(p, o.cylinder.origin), r = len(sub(v, [ax[0] * dot(v, ax), ax[1] * dot(v, ax), ax[2] * dot(v, ax)])); return [{ label: 'Distance to the axis', value: fmtMm(r) }, { label: 'Distance to the wall', value: fmtMm(Math.abs(r - o.cylinder.radius)) }]; }
    return [{ label: 'Note', value: 'Pick a flat or round face, an edge or a point for this one.' }];
  }
  if (a.kind === 'edge' && b.kind === 'edge') {
    rows.push({ label: 'Closest distance', value: fmtMm(edgeEdge(a.segments, b.segments)) });
    const da = straightDir(a.segments), db = straightDir(b.segments);
    if (da && db) { const c = Math.min(1, Math.abs(dot(da, db))); rows.push({ label: 'Angle', value: fmtDeg(Math.acos(c)) }); }
    return rows;
  }
  if (a.kind === 'face' && b.kind === 'face') {
    if (a.normal && b.normal) {
      const na = unit(a.normal), nb = unit(b.normal), c = Math.max(-1, Math.min(1, dot(na, nb))), ang = Math.acos(c);
      if (Math.abs(Math.abs(c) - 1) < 1e-6) return [{ label: 'Distance between the planes', value: fmtMm(Math.abs(dot(sub(b.at, a.at), na))) }, { label: 'Angle', value: '0° (parallel)' }];
      return [{ label: 'Angle between the planes', value: fmtDeg(Math.min(ang, Math.PI - ang)) }];
    }
    if (a.cylinder && b.cylinder) {
      const x = unit(a.cylinder.axis), y = unit(b.cylinder.axis);
      if (len(cross(x, y)) < 1e-6) { const v = sub(b.cylinder.origin, a.cylinder.origin), perp = sub(v, [x[0] * dot(v, x), x[1] * dot(v, x), x[2] * dot(v, x)]); return [{ label: 'Distance between the axes', value: fmtMm(len(perp)) }]; }
    }
    return [{ label: 'Note', value: 'Two flat faces, or two round parallel holes, give a distance and an angle.' }];
  }
  const e = (a.kind === 'edge' ? a : b) as Extract<MeasureItem, { kind: 'edge' }>, f = (a.kind === 'face' ? a : b) as Extract<MeasureItem, { kind: 'face' }>;
  if (f.normal) {
    const n = unit(f.normal), pts = edgePoints(e.segments), d = pts.map((p) => Math.abs(dot(sub(p, f.at), n)));
    return [{ label: 'Distance to the plane', value: `${fmtMm(Math.min(...d))}${Math.max(...d) - Math.min(...d) > 1e-3 ? ` to ${fmtMm(Math.max(...d))} (the edge slants)` : ''}` }];
  }
  return [{ label: 'Note', value: 'Pick a point, an edge or a flat face with that edge.' }];
}
