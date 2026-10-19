// The closed regions of a sketch as polygons, found from its lines, circles and arcs. The engine says which regions exist (index, area, centre) but its curve
// lists cannot draw a region that is only part of a circle (two circles' worth of curves for a lens), so the regions are found here and matched to the
// engine's by area and centre. Used to fill and pick the shapes of a sketch.
import type { Profile, SketchCurve, Vec2 } from '../api';

export interface Region { index: number; outer: Vec2[]; holes: Vec2[][] }

const TAU = Math.PI * 2;
const EPS = 1e-7;
const VTOL = 1e-4;

interface Edge { a: number; b: number; pts: Vec2[] }
const angOf = (c: Vec2, p: Vec2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

const areaOf = (p: Vec2[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; s += p[i]![0] * q[1] - q[0] * p[i]![1]; } return s / 2; };
const centroidOf = (p: Vec2[]): Vec2 => { let cx = 0, cy = 0, a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!, k = p[i]![0] * q[1] - q[0] * p[i]![1]; cx += (p[i]![0] + q[0]) * k; cy += (p[i]![1] + q[1]) * k; a += k; } return Math.abs(a) < 1e-12 ? p[0]! : [cx / (3 * a), cy / (3 * a)]; };
export const pointInPolygon = (pt: Vec2, poly: Vec2[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

/** Points where two curves cross or touch, as points. */
function intersections(a: SketchCurve, b: SketchCurve): Vec2[] {
  const out: Vec2[] = [];
  const onArc = (c: SketchCurve, p: Vec2) => c.type === 'circle' || (c.type === 'arc' && !!c.center && !!c.start && !!c.end && norm(angOf(c.center, p) - angOf(c.center, c.start)) <= norm(angOf(c.center, c.end) - angOf(c.center, c.start)) + 1e-6);
  const lineLine = (l: SketchCurve, m: SketchCurve) => {
    const [p, r] = [l.start!, [l.end![0] - l.start![0], l.end![1] - l.start![1]] as Vec2], [q, s] = [m.start!, [m.end![0] - m.start![0], m.end![1] - m.start![1]] as Vec2];
    const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) out.push([p[0] + t * r[0], p[1] + t * r[1]]);
  };
  const lineCirc = (l: SketchCurve, c: SketchCurve) => {
    const p = l.start!, d: Vec2 = [l.end![0] - p[0], l.end![1] - p[1]], f: Vec2 = [p[0] - c.center![0], p[1] - c.center![1]];
    const A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - c.radius! * c.radius!;
    if (A < 1e-18) return;
    const disc = B * B - 4 * A * C; if (disc < -1e-9) return;
    for (const sg of disc < 1e-9 ? [0] : [-1, 1]) {
      const t = (-B + sg * Math.sqrt(Math.max(disc, 0))) / (2 * A);
      if (t < -EPS || t > 1 + EPS) continue;
      const pt: Vec2 = [p[0] + t * d[0], p[1] + t * d[1]];
      if (onArc(c, pt)) out.push(pt);
    }
  };
  const circCirc = (c1: SketchCurve, c2: SketchCurve) => {
    const [x1, y1] = c1.center!, [x2, y2] = c2.center!, r1 = c1.radius!, r2 = c2.radius!;
    const d = Math.hypot(x2 - x1, y2 - y1); if (d < 1e-9 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return;
    const aa = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(r1 * r1 - aa * aa, 0));
    const mx = x1 + (aa * (x2 - x1)) / d, my = y1 + (aa * (y2 - y1)) / d;
    for (const sg of h < 1e-9 ? [0] : [-1, 1]) { const pt: Vec2 = [mx + (sg * h * (y2 - y1)) / d, my - (sg * h * (x2 - x1)) / d]; if (onArc(c1, pt) && onArc(c2, pt)) out.push(pt); }
  };
  if (a.type === 'line' && b.type === 'line') lineLine(a, b);
  else if (a.type === 'line') lineCirc(a, b);
  else if (b.type === 'line') lineCirc(b, a);
  else circCirc(a, b);
  return out;
}

const usable = (c: SketchCurve) => !c.construction && ((c.type === 'line' && !!c.start && !!c.end) || ((c.type === 'circle' || c.type === 'arc') && !!c.center && c.radius !== undefined && (c.type === 'circle' || (!!c.start && !!c.end))));

/** Every closed region of the sketch as a polygon with its holes (the outer face of the drawing is left out). */
export function findRegions(curves: SketchCurve[], profiles: Profile[]): Region[] {
  const cs = curves.filter(usable);
  const verts: Vec2[] = [];
  const vert = (p: Vec2) => { let i = verts.findIndex((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < VTOL); if (i < 0) { verts.push([p[0], p[1]]); i = verts.length - 1; } return i; };
  const edges: Edge[] = [];
  for (const c of cs) {
    const splits: Vec2[] = [];
    for (const o of cs) if (o !== c) splits.push(...intersections(c, o));
    if (c.type === 'line') {
      const p = c.start!, d: Vec2 = [c.end![0] - p[0], c.end![1] - p[1]], L2 = d[0] * d[0] + d[1] * d[1];
      const ts = [0, 1, ...splits.map((s) => ((s[0] - p[0]) * d[0] + (s[1] - p[1]) * d[1]) / L2)].filter((t) => t >= -EPS && t <= 1 + EPS).sort((x, y) => x - y);
      for (let i = 0; i + 1 < ts.length; i++) {
        const a: Vec2 = [p[0] + ts[i]! * d[0], p[1] + ts[i]! * d[1]], b: Vec2 = [p[0] + ts[i + 1]! * d[0], p[1] + ts[i + 1]! * d[1]];
        const va = vert(a), vb = vert(b); if (va !== vb) edges.push({ a: va, b: vb, pts: [verts[va]!, verts[vb]!] });
      }
    } else {
      const ctr = c.center!, r = c.radius!, a0 = c.type === 'circle' ? 0 : angOf(ctr, c.start!), span = c.type === 'circle' ? TAU : norm(angOf(ctr, c.end!) - a0) || TAU;
      const offs = [...splits.map((s) => norm(angOf(ctr, s) - a0))].filter((o) => o <= span + 1e-9);
      let list = [0, ...offs, ...(c.type === 'circle' ? [] : [span])].sort((x, y) => x - y);
      list = list.filter((o, i) => i === 0 || o - list[i - 1]! > 1e-9);
      if (c.type === 'circle') { for (const extra of [Math.PI]) if (!list.some((o) => Math.abs(o - extra) < 1e-6)) list.push(extra); list.sort((x, y) => x - y); list.push(TAU); }
      for (let i = 0; i + 1 < list.length; i++) {
        const o0 = list[i]!, o1 = list[i + 1]!, n = Math.max(2, Math.ceil(((o1 - o0) / TAU) * 72));
        const pts: Vec2[] = Array.from({ length: n + 1 }, (_, k) => { const t = a0 + o0 + ((o1 - o0) * k) / n; return [ctr[0] + r * Math.cos(t), ctr[1] + r * Math.sin(t)] as Vec2; });
        const va = vert(pts[0]!), vb = vert(pts[n]!); pts[0] = verts[va]!; pts[n] = verts[vb]!;
        if (va !== vb || n > 2) edges.push({ a: va, b: vb, pts });
      }
    }
  }
  // half-edges: 2i is a→b, 2i+1 is b→a
  const he = edges.flatMap((e) => [{ from: e.a, to: e.b, pts: e.pts }, { from: e.b, to: e.a, pts: [...e.pts].reverse() }]);
  const out: number[][] = verts.map(() => []);
  he.forEach((h, i) => out[h.from]!.push(i));
  const dirAng = (i: number) => { const p = he[i]!.pts; return Math.atan2(p[1]![1] - p[0]![1], p[1]![0] - p[0]![0]); };
  for (const list of out) list.sort((x, y) => dirAng(x) - dirAng(y));
  const next = (i: number) => { const twin = i ^ 1, list = out[he[i]!.to]!, k = list.indexOf(twin); return list[(k - 1 + list.length) % list.length]!; };
  const seen = new Set<number>(), faces: Vec2[][] = [], outers: Vec2[][] = [];
  for (let s = 0; s < he.length; s++) {
    if (seen.has(s)) continue;
    const poly: Vec2[] = []; let i = s, guard = 0;
    while (!seen.has(i) && guard++ < he.length + 2) { seen.add(i); poly.push(...he[i]!.pts.slice(0, -1)); i = next(i); }
    if (i !== s || poly.length < 3) continue;
    const a = areaOf(poly);
    if (a > 1e-6) faces.push(poly); else if (a < -1e-6) outers.push(poly); // counter-clockwise: a region; clockwise: the outside of a separate piece
  }
  // a separate piece inside a region leaves a hole in it
  const holesOf = new Map<number, Vec2[][]>();
  for (const o of outers) {
    const probe = o[0]!; let best = -1, bestArea = Infinity;
    faces.forEach((f, k) => { const fa = areaOf(f); if (fa > Math.abs(areaOf(o)) + 1e-6 && fa < bestArea && pointInPolygon(probe, f)) { best = k; bestArea = fa; } });
    if (best >= 0) holesOf.set(best, [...(holesOf.get(best) ?? []), o]);
  }
  const cand = faces.map((f, k) => { const holes = holesOf.get(k) ?? [], area = areaOf(f) - holes.reduce((s, h) => s + Math.abs(areaOf(h)), 0); return { outer: f, holes, area, centre: centroidOf(f) }; });
  // match to the engine's list of regions (area first, then nearest centre)
  const regions: Region[] = [], used = new Set<number>();
  for (const pr of profiles) {
    let best = -1, bd = Infinity;
    cand.forEach((c, k) => { if (used.has(k)) return; const da = Math.abs(c.area - pr.area) / Math.max(pr.area, 1e-9); if (da > 0.03) return; const d = Math.hypot(c.centre[0] - pr.centroid[0], c.centre[1] - pr.centroid[1]) + da; if (d < bd) { bd = d; best = k; } });
    if (best < 0) {
      // fall back to the face containing the engine's centre
      cand.forEach((c, k) => { if (used.has(k)) return; if (pointInPolygon(pr.centroid, c.outer) && !c.holes.some((h) => pointInPolygon(pr.centroid, h)) && Math.abs(c.area - pr.area) / Math.max(pr.area, 1e-9) < 0.25) best = k; });
    }
    if (best >= 0) { used.add(best); regions.push({ index: pr.index, outer: cand[best]!.outer, holes: cand[best]!.holes }); }
  }
  return regions;
}
