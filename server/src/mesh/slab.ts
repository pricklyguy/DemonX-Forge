// Mesh to Solid by slabs: a part whose faces are all either flat across one direction or straight along it (plates, steps, lips, ribs, round
// and slotted holes, rounded corners) is a stack of slabs, each a constant cross-section. The cross-section of every slab is cut out of the
// mesh, turned into sketch lines, arcs and circles, and extruded: the result is real sketches and extrudes in the timeline, not a skin.
// Pure: takes the mesh's numbers, gives back the engine commands. The engine adapter runs them and checks the volume (solidcraft.ts).
import { ringArea, ringToPieces, type Piece, type V2 } from './loops';

export class MeshRefused extends Error {}

type V3 = [number, number, number];
export interface Slab { from: number; to: number; /** each outline with the holes and islands told apart: `hole` is true for a ring inside another */ rings: { pieces: Piece[]; hole: boolean }[]; /** a point inside the material of every region to extrude (not in a hole), in sketch coordinates */ picks: V2[] }
export interface SlabPlan { axis: 0 | 1 | 2; slabs: Slab[]; /** share of the surface (by area) that is flat across or straight along the axis */ coverage: number }

/** The sketch plane for an axis: x_dir and y_dir with x × y pointing along +axis, and the numbers' order (s, t) in world coordinates. */
export const AXES: { u: V3; v: V3; k: [number, number] }[] = [
  { u: [0, 1, 0], v: [0, 0, 1], k: [1, 2] }, // axis X: s = y, t = z
  { u: [0, 0, 1], v: [1, 0, 0], k: [2, 0] }, // axis Y: s = z, t = x
  { u: [1, 0, 0], v: [0, 1, 0], k: [0, 1] }, // axis Z: s = x, t = y
];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

interface Tri { p: [V3, V3, V3]; n: V3; area: number }
function triangles(pos: number[], idx: number[]): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const p: [V3, V3, V3] = [0, 1, 2].map((k) => [pos[idx[i + k]! * 3]!, pos[idx[i + k]! * 3 + 1]!, pos[idx[i + k]! * 3 + 2]!] as V3) as [V3, V3, V3];
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0])), l = Math.hypot(c[0], c[1], c[2]);
    if (l > 1e-12) out.push({ p, n: [c[0] / l, c[1] / l, c[2] / l], area: l / 2 });
  }
  return out;
}

const COS = Math.cos((3 * Math.PI) / 180), SIN = Math.sin((3 * Math.PI) / 180);

/** Which axis makes every face either across it or along it, and how well it does. */
function chooseAxis(tris: Tri[]): { axis: 0 | 1 | 2; coverage: number; horizontal: number } {
  const total = tris.reduce((s, t) => s + t.area, 0) || 1;
  let best = { axis: 2 as 0 | 1 | 2, coverage: -1, horizontal: 0 };
  for (const axis of [2, 0, 1] as const) {
    let ok = 0, h = 0;
    for (const t of tris) { const a = Math.abs(t.n[axis]!); if (a >= COS) { ok += t.area; h += t.area; } else if (a <= SIN) ok += t.area; }
    if (ok / total > best.coverage + 1e-9) best = { axis, coverage: ok / total, horizontal: h / total };
  }
  return best;
}

/** The heights of the flat faces that lie across the axis, merged where they are within `tol`. */
function levels(tris: Tri[], axis: number, tol: number): number[] {
  const hs = tris.filter((t) => Math.abs(t.n[axis]!) >= COS).map((t) => ({ h: (t.p[0][axis]! + t.p[1][axis]! + t.p[2][axis]!) / 3, w: t.area })).sort((a, b) => a.h - b.h);
  const out: { sum: number; w: number; last: number }[] = [];
  for (const x of hs) {
    const c = out[out.length - 1];
    if (c && x.h - c.last <= tol * 2) { c.sum += x.h * x.w; c.w += x.w; c.last = x.h; } else out.push({ sum: x.h * x.w, w: x.w, last: x.h });
  }
  return out.map((c) => c.sum / c.w);
}

/** Cut the mesh at height h: the closed outlines of the section, as rings of (s, t) points. */
function section(tris: Tri[], axis: 0 | 1 | 2, h: number, tol: number): V2[][] {
  const [ks, kt] = AXES[axis]!.k;
  const segs: [V2, V2][] = [];
  const cut = (a: V3, b: V3): V2 => { const f = (h - a[axis]!) / (b[axis]! - a[axis]!); return [a[ks]! + (b[ks]! - a[ks]!) * f, a[kt]! + (b[kt]! - a[kt]!) * f]; };
  for (const t of tris) {
    const lo = Math.min(t.p[0][axis]!, t.p[1][axis]!, t.p[2][axis]!), hi = Math.max(t.p[0][axis]!, t.p[1][axis]!, t.p[2][axis]!);
    if (!(lo < h && hi > h)) continue;
    const above = t.p.map((q) => q[axis]! > h), pts: V2[] = [];
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; if (above[i] !== above[j]) pts.push(cut(t.p[i]!, t.p[j]!)); }
    if (pts.length === 2) segs.push([pts[0]!, pts[1]!]);
  }
  // join the segments end to end: points within a small distance are the same point
  const g = Math.max(tol / 4, 1e-6), cell = new Map<string, number>(), nodes: V2[] = [];
  const node = (p: V2): number => {
    const cx = Math.round(p[0] / g), cy = Math.round(p[1] / g);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const id = cell.get(`${cx + dx},${cy + dy}`); if (id !== undefined && Math.hypot(nodes[id]![0] - p[0], nodes[id]![1] - p[1]) <= g * 1.5) return id; }
    nodes.push(p); cell.set(`${cx},${cy}`, nodes.length - 1); return nodes.length - 1;
  };
  const adj = new Map<number, number[]>();
  for (const [a, b] of segs) { const i = node(a), j = node(b); if (i === j) continue; (adj.get(i) ?? adj.set(i, []).get(i)!).push(j); (adj.get(j) ?? adj.set(j, []).get(j)!).push(i); }
  const used = new Set<string>(), rings: V2[][] = [];
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const [s, nb] of adj) {
    if (nb.length !== 2) throw new MeshRefused('the mesh is not closed (its section has loose ends or branches), so it cannot be rebuilt');
    for (const first of nb) {
      if (used.has(key(s, first))) continue;
      const ring: V2[] = [nodes[s]!]; let prev = s, cur = first; used.add(key(s, first));
      while (cur !== s) {
        ring.push(nodes[cur]!);
        const n = adj.get(cur)!; if (n.length !== 2) throw new MeshRefused('the mesh is not closed (its section has loose ends or branches), so it cannot be rebuilt');
        const next = n[0] === prev && n[1] !== prev ? n[1]! : n[0] === prev ? n[1]! : n[0]!; // (a ring of two points back and forth is not a ring)
        used.add(key(cur, next)); prev = cur; cur = next;
        if (ring.length > segs.length + 2) throw new MeshRefused('the mesh section does not close up');
      }
      if (ring.length >= 3) rings.push(ring);
    }
  }
  return rings;
}

const inside = (p: V2, ring: V2[]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i]!, b = ring[j]!; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/** Rings with a flag for those that are holes (inside an odd number of other rings). */
function nest(rings: V2[][]): { ring: V2[]; hole: boolean; depth: number }[] {
  return rings.map((r, i) => {
    const probe = r[0]!; // a vertex is on its own ring: use the midpoint of the first edge, nudged along nothing, but compare against the other rings only
    const mid: V2 = [(r[0]![0] + r[1]![0]) / 2, (r[0]![1] + r[1]![1]) / 2];
    let depth = 0; for (let j = 0; j < rings.length; j++) if (j !== i && inside(mid, rings[j]!) && inside(probe, rings[j]!)) depth++;
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
  if (a.rings.length !== b.rings.length) return false;
  const sig = (s: Slab) => s.rings.map((r) => { const pts = r.pieces.flatMap((p) => (p.kind === 'circle' ? [p.center] : [p.from])); return { n: pts.length, a: Math.abs(ringArea(pts)), cx: pts.reduce((x, p) => x + p[0], 0) / pts.length, cy: pts.reduce((x, p) => x + p[1], 0) / pts.length, hole: r.hole }; }).sort((p, q) => p.a - q.a || p.cx - q.cx);
  const x = sig(a), y = sig(b);
  return x.every((p, i) => p.n === y[i]!.n && p.hole === y[i]!.hole && Math.abs(p.cx - y[i]!.cx) <= tol && Math.abs(p.cy - y[i]!.cy) <= tol && Math.abs(p.a - y[i]!.a) <= Math.max(tol * 4, p.a * 1e-4));
};

/** Work out the slabs of a mesh, or say why it cannot be done. `positions` are xyz per vertex, `indices` three vertex numbers per triangle. */
export function planSlabs(positions: number[], indices: number[], tol: number): SlabPlan {
  const tris = triangles(positions, indices);
  if (tris.length < 4) throw new MeshRefused('the mesh has too few triangles');
  const { axis, coverage, horizontal } = chooseAxis(tris);
  if (coverage < 0.999) throw new MeshRefused(`this part has slanted, tapered or curved faces along its thickness (even the best direction fits only ${(coverage * 100).toFixed(1)}% of its surface): only parts made of flat steps and straight walls can be rebuilt`);
  if (horizontal <= 0) throw new MeshRefused('the part has no flat faces across any direction');
  const L = levels(tris, axis, tol);
  if (L.length < 2) throw new MeshRefused('the part has only one flat level, so it has no thickness');
  // the heights of all vertices: a cut must not pass through a vertex (a round wall can have rings of vertices between the flat levels)
  const heights = [...new Set(tris.flatMap((t) => t.p.map((q) => Math.round(q[axis]! / 1e-6))))].map((v) => v * 1e-6).sort((x, y) => x - y);
  const cutHeight = (lo: number, hi: number) => {
    const pts = [lo, ...heights.filter((v) => v > lo + tol * 2 && v < hi - tol * 2), hi];
    let best = 0, at = (lo + hi) / 2;
    for (let k = 0; k + 1 < pts.length; k++) if (pts[k + 1]! - pts[k]! > best) { best = pts[k + 1]! - pts[k]!; at = (pts[k]! + pts[k + 1]!) / 2; }
    return at;
  };
  const slabs: Slab[] = [];
  for (let i = 0; i + 1 < L.length; i++) {
    const rings = section(tris, axis, cutHeight(L[i]!, L[i + 1]!), tol);
    if (!rings.length) continue; // nothing in this slab (a gap between two separate parts)
    const slab: Slab = { from: L[i]!, to: L[i + 1]!, rings: [], picks: [] };
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
  return { axis, slabs, coverage };
}

export interface Step { command: string; params: Record<string, unknown> }
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const pt = (p: V2): [number, number] => [r6(p[0]), r6(p[1])];

/** The engine commands for a plan: for each slab a sketch on the plane at its bottom with the outlines, then an extrude (the first makes the body, the rest join it). */
export function slabSteps(plan: SlabPlan, bodyName: string, label: string): Step[] {
  const { u, v } = AXES[plan.axis]!;
  const steps: Step[] = [];
  const axisVec: V3 = [0, 0, 0]; axisVec[plan.axis] = 1;
  plan.slabs.forEach((slab, k) => {
    const name = `${label} ${k + 1}`;
    steps.push({ command: 'sketch.create', params: { plane: { origin: [r6(axisVec[0] * slab.from), r6(axisVec[1] * slab.from), r6(axisVec[2] * slab.from)], x_dir: u, y_dir: v }, name } });
    for (const ring of slab.rings) {
      let chain: V2[] = [];
      const flush = () => { if (chain.length > 1) steps.push({ command: 'sketch.line', params: { points: chain.map(pt) } }); chain = []; };
      for (const p of ring.pieces) {
        if (p.kind === 'circle') steps.push({ command: 'sketch.circle.center', params: { center: pt(p.center), radius: r6(p.radius) } });
        else if (p.kind === 'line') { if (!chain.length) chain.push(p.from); chain.push(p.to); }
        else { flush(); steps.push({ command: 'sketch.arc.three_point', params: { start: pt(p.from), end: pt(p.to), through: pt(p.through) } }); }
      }
      flush();
    }
    steps.push({ command: 'sketch.finish', params: {} });
    steps.push({ command: 'solid.extrude', params: { sketch: name, profiles: slab.picks.map((m) => ({ point: pt(m) })), distance: r6(slab.to - slab.from), operation: k === 0 ? 'new' : 'join', ...(k === 0 ? { body_name: bodyName } : {}) } });
  });
  return steps;
}
