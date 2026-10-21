// Mesh to Solid by slabs and features. A part is rebuilt as sketches and extrudes:
//  * along one direction (the axis) every wall is flat across it, or straight along it, or tilted by the same draft angle: the part is a stack
//    of slabs, each a constant cross-section (extruded with a taper when its walls lean);
//  * what does not fit that (a countersink, a hole through a wall, a boss on the side) is found as a group of faces of its own and rebuilt as a
//    cut or a join along the direction that suits it.
// Pure: takes the mesh's numbers, gives back the engine commands. The engine adapter runs them and checks the volume (solidcraft.ts).
import { ringArea, ringToPieces, fitCircle, type Piece, type V2 } from './loops';

export class MeshRefused extends Error {}

type V3 = [number, number, number];
export interface Ring { pieces: Piece[]; hole: boolean }
/** One constant (or evenly tapering) cross-section, from `from` to `to` along the axis. `taper` is in degrees, the engine's way: positive grows the section along the axis. */
export interface Slab { from: number; to: number; rings: Ring[]; /** a point inside the material of every region to extrude, in sketch coordinates */ picks: V2[]; taper: number }
/** A cut (a hole, a countersink, a slot) or a join (a boss) along its own axis. */
export interface Feature { axis: 0 | 1 | 2; from: number; depth: number; op: 'cut' | 'join'; pieces: Piece[]; pick: V2; taper: number }
export interface MeshPlan { axis: 0 | 1 | 2; slabs: Slab[]; features: Feature[]; /** the share of the surface (by area) rebuilt as slab walls and flat levels */ explained: number }

/** The sketch plane for an axis: x_dir and y_dir with x × y pointing along +axis, and the numbers' order (s, t) in world coordinates. */
export const AXES: { u: V3; v: V3; k: [number, number] }[] = [
  { u: [0, 1, 0], v: [0, 0, 1], k: [1, 2] }, // axis X: s = y, t = z
  { u: [0, 0, 1], v: [1, 0, 0], k: [2, 0] }, // axis Y: s = z, t = x
  { u: [1, 0, 0], v: [0, 1, 0], k: [0, 1] }, // axis Z: s = x, t = y
];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const DEG = 180 / Math.PI;

interface Tri { p: [V3, V3, V3]; n: V3; area: number; lo: number; hi: number }

/** The mesh's triangles with outward normals (the winding is turned round when the mesh encloses a negative volume). */
function triangles(pos: number[], idx: number[]): Tri[] {
  const out: Tri[] = []; let vol = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const p: [V3, V3, V3] = [0, 1, 2].map((k) => [pos[idx[i + k]! * 3]!, pos[idx[i + k]! * 3 + 1]!, pos[idx[i + k]! * 3 + 2]!] as V3) as [V3, V3, V3];
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0])), l = Math.hypot(c[0], c[1], c[2]);
    if (l < 1e-12) continue;
    vol += (p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])) / 6;
    out.push({ p, n: [c[0] / l, c[1] / l, c[2] / l], area: l / 2, lo: 0, hi: 0 });
  }
  if (vol < 0) for (const t of out) t.n = [-t.n[0], -t.n[1], -t.n[2]];
  return out;
}
const setRange = (tris: Tri[], axis: number) => { for (const t of tris) { const h = [t.p[0][axis]!, t.p[1][axis]!, t.p[2][axis]!]; t.lo = Math.min(...h); t.hi = Math.max(...h); } };

const COS3 = Math.cos((3 * Math.PI) / 180);
const TILT = 0.03; // how far apart two walls' tilts (sine of the angle to the axis) may be and still be the same draft

/** Sorted values merged where they are within `gap` of the previous one (each group becomes its mean). */
function groups(values: number[], gap: number, weights?: number[]): number[] {
  const order = values.map((v, i) => i).sort((a, b) => values[a]! - values[b]!);
  const out: { sum: number; w: number; last: number }[] = [];
  for (const i of order) { const v = values[i]!, w = weights?.[i] ?? 1, c = out[out.length - 1]; if (c && v - c.last <= gap) { c.sum += v * w; c.w += w; c.last = v; } else out.push({ sum: v * w, w, last: v }); }
  return out.map((c) => c.sum / c.w);
}

/** Cut the triangles at height h: the closed outlines of the section, as rings of (s, t) points. `open` allows loose ends (returned as chains). */
function section(tris: Tri[], axis: 0 | 1 | 2, h: number, tol: number, open = false): { rings: V2[][]; chains: V2[][] } {
  const [ks, kt] = AXES[axis]!.k;
  const segs: [V2, V2][] = [];
  const cut = (a: V3, b: V3): V2 => { const f = (h - a[axis]!) / (b[axis]! - a[axis]!); return [a[ks]! + (b[ks]! - a[ks]!) * f, a[kt]! + (b[kt]! - a[kt]!) * f]; };
  for (const t of tris) {
    if (!(t.lo < h && t.hi > h)) continue;
    const above = t.p.map((q) => q[axis]! > h), pts: V2[] = [];
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; if (above[i] !== above[j]) pts.push(cut(t.p[i]!, t.p[j]!)); }
    if (pts.length === 2) segs.push([pts[0]!, pts[1]!]);
  }
  const g = Math.max(tol * 0.002, 1e-6), cell = new Map<string, number>(), nodes: V2[] = []; // (the same edge cut from two triangles gives the same point to within rounding; points nearer than that to a vertex stay apart)
  const node = (p: V2): number => {
    const cx = Math.round(p[0] / g), cy = Math.round(p[1] / g);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const id = cell.get(`${cx + dx},${cy + dy}`); if (id !== undefined && Math.hypot(nodes[id]![0] - p[0], nodes[id]![1] - p[1]) <= g * 1.5) return id; }
    nodes.push(p); cell.set(`${cx},${cy}`, nodes.length - 1); return nodes.length - 1;
  };
  const adj = new Map<number, number[]>();
  for (const [a, b] of segs) { const i = node(a), j = node(b); if (i === j) continue; (adj.get(i) ?? adj.set(i, []).get(i)!).push(j); (adj.get(j) ?? adj.set(j, []).get(j)!).push(i); }
  const used = new Set<string>(), rings: V2[][] = [], chains: V2[][] = [];
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const loose = 'the mesh is not closed (its section has loose ends or branches), so it cannot be rebuilt';
  for (const [s, nb] of adj) {
    if (nb.length !== 2 && !open) throw new MeshRefused(loose);
    if (nb.length === 1 && open) { // a loose end: follow it to the other end
      if (used.has(key(s, nb[0]!))) continue;
      const chain: V2[] = [nodes[s]!]; let prev = s, cur = nb[0]!; used.add(key(s, cur));
      for (;;) { chain.push(nodes[cur]!); const n = adj.get(cur)!; if (n.length !== 2) break; const next = n[0] === prev ? n[1]! : n[0]!; used.add(key(cur, next)); prev = cur; cur = next; if (chain.length > segs.length + 2) break; }
      chains.push(chain); continue;
    }
    if (nb.length !== 2) throw new MeshRefused(loose);
    for (const first of nb) {
      if (used.has(key(s, first))) continue;
      const ring: V2[] = [nodes[s]!]; let prev = s, cur = first; used.add(key(s, first));
      while (cur !== s) {
        ring.push(nodes[cur]!);
        const n = adj.get(cur)!; if (n.length !== 2) { if (open) break; throw new MeshRefused(loose); }
        const next = n[0] === prev ? n[1]! : n[0]!;
        used.add(key(cur, next)); prev = cur; cur = next;
        if (ring.length > segs.length + 2) throw new MeshRefused('the mesh section does not close up');
      }
      if (cur === s && ring.length >= 3) rings.push(ring); else if (open && ring.length >= 3) chains.push(ring);
    }
  }
  return { rings, chains };
}

const inside = (p: V2, ring: V2[]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i]!, b = ring[j]!; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/** Rings with a flag for those that are holes (inside an odd number of other rings), and how deep each is nested. */
function nest(rings: V2[][]): { ring: V2[]; hole: boolean; depth: number }[] {
  return rings.map((r, i) => {
    const mid: V2 = [(r[0]![0] + r[1]![0]) / 2, (r[0]![1] + r[1]![1]) / 2];
    let depth = 0; for (let j = 0; j < rings.length; j++) if (j !== i && inside(mid, rings[j]!) && inside(r[0]!, rings[j]!)) depth++;
    return { ring: r, hole: depth % 2 === 1, depth };
  });
}

/** A point in the material of the region bounded by `outer` (inside it, outside the holes one level down), found along a few horizontal lines. */
function regionPoint(outer: { ring: V2[]; depth: number }, all: { ring: V2[]; depth: number }[], tol: number): V2 | null {
  const holes = all.filter((r) => r.depth === outer.depth + 1 && inside(r.ring[0]!, outer.ring));
  const ys = outer.ring.map((q) => q[1]), lo = Math.min(...ys), hi = Math.max(...ys);
  for (const f of [0.5, 0.37, 0.63, 0.23, 0.77, 0.11, 0.89, 0.03, 0.97]) {
    const y0 = lo + (hi - lo) * f, xs: number[] = [];
    for (const { ring } of all) for (let i = 0; i < ring.length; i++) { const a = ring[i]!, b = ring[(i + 1) % ring.length]!; if ((a[1] > y0) !== (b[1] > y0)) xs.push(a[0] + ((y0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
    xs.sort((x, y) => x - y);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1]! - xs[k]! < tol * 2) continue;
      const m: V2 = [(xs[k]! + xs[k + 1]!) / 2, y0];
      if (inside(m, outer.ring) && !holes.some((h) => inside(m, h.ring))) return m;
    }
  }
  return null;
}

const sameRings = (a: Slab, b: Slab, tol: number) => {
  if (a.rings.length !== b.rings.length || Math.abs(a.taper - b.taper) > 0.2) return false;
  const sig = (s: Slab) => s.rings.map((r) => { const pts = r.pieces.flatMap((p) => (p.kind === 'circle' ? [p.center] : [p.from])); return { n: pts.length, a: Math.abs(ringArea(pts)), cx: pts.reduce((x, p) => x + p[0], 0) / pts.length, cy: pts.reduce((x, p) => x + p[1], 0) / pts.length, hole: r.hole }; }).sort((p, q) => p.a - q.a || p.cx - q.cx);
  const x = sig(a), y = sig(b);
  return x.every((p, i) => p.n === y[i]!.n && p.hole === y[i]!.hole && Math.abs(p.cx - y[i]!.cx) <= tol && Math.abs(p.cy - y[i]!.cy) <= tol && Math.abs(p.a - y[i]!.a) <= Math.max(tol * 4, p.a * 1e-4));
};

interface Span { lo: number; hi: number }

/** The indices of the intervals (sorted, not overlapping) that a triangle reaching from lo to hi passes through. */
function overlapping<T extends { lo: number; hi: number }>(iv: T[], lo: number, hi: number): T[] {
  let a = 0, b = iv.length; while (a < b) { const m = (a + b) >> 1; if (iv[m]!.hi > lo) b = m; else a = m + 1; }
  const out: T[] = []; for (let k = a; k < iv.length && iv[k]!.lo < hi; k++) out.push(iv[k]!);
  return out;
}

/** Connected groups of triangles (sharing a vertex position). */
function clusters(tris: Tri[], tol: number): Tri[][] {
  const g = Math.max(tol / 2, 1e-6), id = (q: V3) => `${Math.round(q[0] / g)},${Math.round(q[1] / g)},${Math.round(q[2] / g)}`;
  const parent = tris.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<string, number>();
  tris.forEach((t, i) => { for (const q of t.p) { const k = id(q), o = owner.get(k); if (o === undefined) owner.set(k, i); else parent[find(i)] = find(o); } });
  const by = new Map<number, Tri[]>();
  tris.forEach((t, i) => { const r = find(i); (by.get(r) ?? by.set(r, []).get(r)!).push(t); });
  return [...by.values()];
}

/**
 * Rings for one extrude: the closed rings; and when only loose arcs are left (a notch in the edge of the part, or a round hole of which only the
 * facets that face away from the main direction were gathered), the one circle through them.
 */
function ringsAt(tris: Tri[], axis: 0 | 1 | 2, h: number, tol: number): V2[][] {
  const { rings, chains } = section(tris, axis, h, tol, true);
  const out = [...rings];
  const circle = (f: { c: V2; r: number }) => Array.from({ length: 48 }, (_, i) => [f.c[0] + f.r * Math.cos((i / 48) * Math.PI * 2), f.c[1] + f.r * Math.sin((i / 48) * Math.PI * 2)] as V2);
  const onCircle = (pts: V2[], f: { c: V2; r: number } | null) => !!f && pts.length >= 4 && pts.every((q) => Math.abs(Math.hypot(q[0] - f.c[0], q[1] - f.c[1]) - f.r) <= tol * 1.5);
  if (chains.length) {
    const all = chains.flat(), f = fitCircle(all);
    if (onCircle(all, f)) out.push(circle(f!)); // every loose arc lies on the same circle
    else for (const c of chains) { const g = fitCircle(c); if (onCircle(c, g) && c.length >= 6) out.push(circle(g!)); else throw new MeshRefused('a group of faces of the part is not closed round (a cut or a boss that ends in a loose edge)'); }
  }
  return out;
}

/** The mesh as slabs and features along one axis, or why not. */
function planAxis(tris: Tri[], axis: 0 | 1 | 2, tol: number): MeshPlan {
  setRange(tris, axis);
  const total = tris.reduce((s, t) => s + t.area, 0) || 1;
  const horizontal = tris.filter((t) => Math.abs(t.n[axis]!) >= COS3), walls = tris.filter((t) => Math.abs(t.n[axis]!) < COS3);
  if (!horizontal.length) throw new MeshRefused('the part has no flat faces across this direction');
  // the heights of every vertex, merged: the walls are looked at between neighbouring ones
  const G = groups(tris.flatMap((t) => [t.lo, t.hi]), tol * 0.5);
  if (G.length < 2) throw new MeshRefused('the part has no thickness in this direction');
  const iv = G.slice(0, -1).map((g, k) => ({ lo: g, hi: G[k + 1]!, w: new Map<number, number>(), total: 0, s: 0, has: false })).filter((x) => x.hi - x.lo > tol * 2);
  for (const t of walls) for (const x of overlapping(iv, t.lo, t.hi)) { const b = Math.round(t.n[axis]! / 0.02); x.w.set(b, (x.w.get(b) ?? 0) + t.area); x.total += t.area; }
  for (const x of iv) {
    if (!x.total) continue;
    let best = 0, bw = -1; for (const b of x.w.keys()) { const w = (x.w.get(b - 1) ?? 0) + (x.w.get(b) ?? 0) + (x.w.get(b + 1) ?? 0); if (w > bw) { bw = w; best = b; } }
    x.s = 0; x.has = true; (x as { best?: number }).best = best;
  }
  { const sw = new Map<object, number>(), ss = new Map<object, number>(); // the dominant tilt of each interval: the mean over the walls within a bin of the commonest one
    for (const t of walls) for (const x of overlapping(iv, t.lo, t.hi)) { if (!x.has || Math.abs(Math.round(t.n[axis]! / 0.02) - (x as { best?: number }).best!) > 1) continue; sw.set(x, (sw.get(x) ?? 0) + t.area); ss.set(x, (ss.get(x) ?? 0) + t.area * t.n[axis]!); }
    for (const x of iv) if (x.has) x.s = sw.get(x) ? ss.get(x)! / sw.get(x)! : 0; }
  // walls whose tilt matches none of the dominant tilts they span belong to a feature
  const residual: Tri[] = [], normal: Tri[] = [...horizontal];
  for (const t of walls) {
    const over = overlapping(iv, t.lo, t.hi).filter((x) => x.has);
    if (!over.length || over.some((x) => Math.abs(t.n[axis]! - x.s) <= TILT)) normal.push(t); else residual.push(t);
  }
  // a flat sliver at the very top or bottom of a round wall (a facet that happens to face straight up) is part of that wall, not a level of the part
  {
    const g = Math.max(tol / 2, 1e-6), vk = (q: V3) => `${Math.round(q[0] / g)},${Math.round(q[1] / g)},${Math.round(q[2] / g)}`;
    const touching = new Set<string>(); for (const t of residual) for (const q of t.p) touching.add(vk(q));
    const levels = new Map<number, number>(); for (const u of horizontal) { const k = Math.round((u.lo + u.hi) / 2 / (tol * 2)); levels.set(k, (levels.get(k) ?? 0) + u.area); }
    const levelArea = (t: Tri) => levels.get(Math.round((t.lo + t.hi) / 2 / (tol * 2))) ?? 0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = normal.length - 1; i >= 0; i--) {
        const t = normal[i]!;
        if (Math.abs(t.n[axis]!) < COS3 || !t.p.some((q) => touching.has(vk(q))) || levelArea(t) > 0.01 * total) continue;
        normal.splice(i, 1); residual.push(t); for (const q of t.p) touching.add(vk(q)); moved = true;
      }
      if (!moved) break;
    }
  }
  const resSet = new Set(residual), flatKeep = horizontal.filter((t) => !resSet.has(t));
  const resArea = residual.reduce((s, t) => s + t.area, 0);
  if (resArea / total > 0.4) throw new MeshRefused(`in the best direction ${((1 - resArea / total) * 100).toFixed(0)}% of the part's surface is flat steps and straight or evenly leaning walls; the rest (${(resArea / total * 100).toFixed(0)}%) is slanted, curved or sculpted`);
  // features first (their spans along the axis tell where a clean cut can be made)
  // (the facets of one round hole that face away from the main direction can come in several groups: those with the same outline over the same
  // depth are one feature, and it blocks a cut anywhere across the whole of its span)
  const features: Feature[] = [], avoid: Span[] = [], found: { f: Feature; lo: number; hi: number }[] = [];
  const sig = (f: Feature) => { const pts = f.pieces.flatMap((p) => (p.kind === 'circle' ? [p.center] : [p.from])); return { cx: pts.reduce((x, p) => x + p[0], 0) / pts.length, cy: pts.reduce((x, p) => x + p[1], 0) / pts.length, a: Math.abs(f.pieces[0]!.kind === 'circle' ? Math.PI * (f.pieces[0] as { radius: number }).radius ** 2 : ringArea(pts)) }; };
  for (const c of clusters(residual, tol)) {
    const n = featureOf(c, axis, tol), s = sig(n.feature);
    const same = found.find((o) => o.f.axis === n.feature.axis && o.f.op === n.feature.op && Math.abs(o.f.taper - n.feature.taper) < 0.5 && (() => { const q = sig(o.f); return Math.abs(q.cx - s.cx) <= tol * 2 && Math.abs(q.cy - s.cy) <= tol * 2 && Math.abs(q.a - s.a) <= Math.max(tol * 4, s.a * 0.01); })()
      && n.feature.from <= o.f.from + o.f.depth + tol * 2 && o.f.from <= n.feature.from + n.feature.depth + tol * 2);
    if (same) { const end = Math.max(same.f.from + same.f.depth, n.feature.from + n.feature.depth); same.f.from = Math.min(same.f.from, n.feature.from); same.f.depth = end - same.f.from; same.lo = Math.min(same.lo, n.lo); same.hi = Math.max(same.hi, n.hi); }
    else found.push({ f: n.feature, lo: n.lo, hi: n.hi });
  }
  for (const o of found) { features.push(o.f); avoid.push({ lo: o.lo, hi: o.hi }); }
  // slab boundaries: the flat levels, the ends, and the heights where the walls' tilt changes
  const ivs = iv.filter((x) => x.has);
  const flat = groups(flatKeep.map((t) => (t.lo + t.hi) / 2), tol * 2, flatKeep.map((t) => t.area));
  const bounds = [G[0]!, G[G.length - 1]!, ...flat];
  for (let k = 1; k < ivs.length; k++) if (Math.abs(ivs[k]!.s - ivs[k - 1]!.s) > TILT && Math.abs(ivs[k]!.lo - ivs[k - 1]!.hi) <= tol * 2) bounds.push((ivs[k]!.lo + ivs[k - 1]!.hi) / 2);
  const B = groups(bounds, tol * 2);
  if (B.length > 60) throw new MeshRefused('the part has too many levels to rebuild (is its wall curved along the thickness?)');
  const blocked = (h: number) => avoid.some((a) => h > a.lo - tol && h < a.hi + tol);
  const slabs: Slab[] = [];
  for (let i = 0; i + 1 < B.length; i++) {
    const lo = B[i]!, hi = B[i + 1]!;
    const spanIv = ivs.filter((x) => x.hi > lo + tol && x.lo < hi - tol);
    const s = spanIv.length ? spanIv.reduce((a, x) => a + x.s * (x.hi - x.lo), 0) / spanIv.reduce((a, x) => a + (x.hi - x.lo), 0) : 0;
    const taper = Math.abs(s) < 0.0175 ? 0 : Math.round(-Math.asin(Math.max(-0.999, Math.min(0.999, s))) * DEG * 100) / 100;
    let h: number | null = null;
    if (taper === 0) { // any clean height will do: the widest gap between vertex heights, outside the features' spans
      const pts = [lo, ...G.filter((v) => v > lo + tol * 2 && v < hi - tol * 2), hi];
      let best = 0;
      for (let k = 0; k + 1 < pts.length; k++) { const m = (pts[k]! + pts[k + 1]!) / 2; if (pts[k + 1]! - pts[k]! > best && !blocked(m)) { best = pts[k + 1]! - pts[k]!; h = m; } }
    } else { // a leaning slab: cut just above its bottom, so the sketch at the bottom is right to within the tolerance
      const next = G.find((v) => v > lo + tol * 2) ?? hi, d = Math.min(tol * 0.5, (Math.min(next, hi) - lo) / 2);
      if (!blocked(lo + d)) h = lo + d;
    }
    if (h === null) throw new MeshRefused('no clean cut could be made through a level of the part (a hole or boss reaches all the way across it)');
    const { rings } = section(normal, axis, h, tol);
    if (!rings.length) continue; // nothing in this slab (a gap between two separate parts)
    const slab: Slab = { from: lo, to: hi, rings: [], picks: [], taper };
    const nested = nest(rings);
    for (const { ring, hole } of nested) {
      const pieces = ringToPieces(ring, tol);
      if (!pieces) throw new MeshRefused('an outline of the part is too small to rebuild');
      slab.rings.push({ pieces, hole });
    }
    for (const n of nested) if (!n.hole) { const m = regionPoint(n, nested, tol); if (!m) throw new MeshRefused('a region of the part is too thin to pick out'); slab.picks.push(m); }
    const last = slabs[slabs.length - 1];
    if (last && Math.abs(last.to - slab.from) <= tol * 2 && sameRings(last, slab, tol)) last.to = slab.to; // the same section carries on: one extrude
    else slabs.push(slab);
  }
  if (!slabs.length) throw new MeshRefused('nothing was found inside the mesh');
  return { axis, slabs, features, explained: 1 - resArea / total };
}

/** One group of leftover faces as a cut or a join along the direction in which they all lean the same way. */
function featureOf(c: Tri[], from: 0 | 1 | 2, tol: number): { feature: Feature; lo: number; hi: number } {
  const area = c.reduce((s, t) => s + t.area, 0);
  let why = 'a group of faces of the part (a hole or boss across the main direction) could not be rebuilt';
  for (const axis of ([0, 1, 2] as const).filter((a) => a !== from).concat([from])) {
    const s0 = c.reduce((a, t) => a + t.n[axis]! * t.area, 0) / area;
    if (!c.every((t) => Math.abs(t.n[axis]! - s0) <= 0.05)) continue;
    setRange(c, axis);
    const lo = Math.min(...c.map((t) => t.lo)), hi = Math.max(...c.map((t) => t.hi));
    if (hi - lo < tol * 2) continue;
    const near = c.map((t) => t.hi).concat(c.map((t) => t.lo)).filter((v) => v > lo + tol * 2).sort((a, b) => a - b)[0] ?? hi;
    const h = lo + Math.min(tol * 0.5, (near - lo) / 2);
    let rings: V2[][];
    try { rings = ringsAt(c, axis, h, tol); } catch (e) { why = (e as Error).message; continue; }
    if (rings.length !== 1) { why = 'a group of leftover faces has more than one outline'; continue; }
    const ring = rings[0]!;
    // hole or boss: which way do the outward normals point, towards the middle of the outline or away from it?
    const [ks, kt] = AXES[axis]!.k, mid: V2 = [ring.reduce((a, q) => a + q[0], 0) / ring.length, ring.reduce((a, q) => a + q[1], 0) / ring.length];
    const t = c.find((x) => x.lo < h && x.hi > h)!, cen: V2 = [(t.p[0][ks]! + t.p[1][ks]! + t.p[2][ks]!) / 3, (t.p[0][kt]! + t.p[1][kt]! + t.p[2][kt]!) / 3];
    const toward = (mid[0] - cen[0]) * t.n[ks]! + (mid[1] - cen[1]) * t.n[kt]!;
    const hole = toward > 0, sine = Math.max(-0.999, Math.min(0.999, s0));
    const pieces = ringToPieces(ring, tol);
    if (!pieces) continue;
    const pick = regionPoint({ ring, depth: 0 }, [{ ring, depth: 0 }], tol);
    if (!pick) continue;
    const taper = Math.abs(s0) < 0.0175 ? 0 : Math.round((hole ? Math.asin(sine) : -Math.asin(sine)) * DEG * 100) / 100;
    setRange(c, from);
    return { feature: { axis, from: lo, depth: hi - lo, op: hole ? 'cut' : 'join', pieces, pick, taper }, lo: Math.min(...c.map((x) => x.lo)), hi: Math.max(...c.map((x) => x.hi)) };
  }
  throw new MeshRefused(why);
}

/** Every way to rebuild the mesh, best first: fewest features, most of the surface explained, fewest slabs. Throws when no axis works (with the reason of the nearest). */
export function planMesh(positions: number[], indices: number[], tol: number): MeshPlan[] {
  const tris = triangles(positions, indices);
  if (tris.length < 4) throw new MeshRefused('the mesh has too few triangles');
  const plans: MeshPlan[] = []; let why = '', best = -1;
  for (const axis of [2, 0, 1] as const) {
    try { plans.push(planAxis(tris, axis, tol)); } catch (e) { if (!(e instanceof MeshRefused)) throw e; const m = /(\d+)% of the part's surface is flat/.exec(e.message); const share = m ? Number(m[1]) : 0; if (!why || share > best) { why = `along ${'XYZ'[axis]}: ${e.message}`; best = share; } }
  }
  if (!plans.length) throw new MeshRefused(`this part cannot be rebuilt: ${why}`);
  return plans.sort((a, b) => a.features.length - b.features.length || b.explained - a.explained || a.slabs.length - b.slabs.length);
}

export interface Step { command: string; params: Record<string, unknown> }
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const pt = (p: V2): [number, number] => [r6(p[0]), r6(p[1])];

function draw(steps: Step[], rings: { pieces: Piece[] }[]) {
  for (const ring of rings) {
    let chain: V2[] = [];
    const flush = () => { if (chain.length > 1) steps.push({ command: 'sketch.line', params: { points: chain.map(pt) } }); chain = []; };
    for (const p of ring.pieces) {
      if (p.kind === 'circle') steps.push({ command: 'sketch.circle.center', params: { center: pt(p.center), radius: r6(p.radius) } });
      else if (p.kind === 'line') { if (!chain.length) chain.push(p.from); chain.push(p.to); }
      else { flush(); steps.push({ command: 'sketch.arc.three_point', params: { start: pt(p.from), end: pt(p.to), through: pt(p.through) } }); }
    }
    flush();
  }
}
const plane = (axis: number, at: number) => { const { u, v } = AXES[axis]!; const o: V3 = [0, 0, 0]; o[axis] = r6(at); return { origin: o, x_dir: u, y_dir: v }; };

/** The engine commands for a plan: a sketch and an extrude for each slab (the first makes the body, the rest join it), then each feature as a cut or a join. */
export function meshSteps(plan: MeshPlan, bodyName: string, label: string): Step[] {
  const steps: Step[] = [];
  plan.slabs.forEach((slab, k) => {
    const name = `${label} ${k + 1}`;
    steps.push({ command: 'sketch.create', params: { plane: plane(plan.axis, slab.from), name } });
    draw(steps, slab.rings);
    steps.push({ command: 'sketch.finish', params: {} });
    steps.push({ command: 'solid.extrude', params: { sketch: name, profiles: slab.picks.map((m) => ({ point: pt(m) })), distance: r6(slab.to - slab.from), ...(slab.taper ? { taper: slab.taper } : {}), operation: k === 0 ? 'new' : 'join', ...(k === 0 ? { body_name: bodyName } : {}) } });
  });
  plan.features.forEach((f, k) => {
    const name = `${label} ${f.op === 'cut' ? 'cut' : 'boss'} ${k + 1}`;
    steps.push({ command: 'sketch.create', params: { plane: plane(f.axis, f.from), name } });
    draw(steps, [{ pieces: f.pieces }]);
    steps.push({ command: 'sketch.finish', params: {} });
    steps.push({ command: 'solid.extrude', params: { sketch: name, profiles: [{ point: pt(f.pick) }], distance: r6(f.depth), ...(f.taper ? { taper: f.taper } : {}), operation: f.op } });
  });
  return steps;
}

/** For the tests and the adapter's message: how a plan reads in words. */
export const describePlan = (p: MeshPlan) => `${p.slabs.length} slab${p.slabs.length === 1 ? '' : 's'}${p.features.length ? ` and ${p.features.length} feature${p.features.length === 1 ? '' : 's'}` : ''} along ${'XYZ'[p.axis]}`;
