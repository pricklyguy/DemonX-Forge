// Turns the engine's list of edges into lines to draw and pick. The engine names an edge by the two faces it lies between, and the display mesh
// tags every triangle with its face, so an edge is where the triangles of those two faces meet. Pure functions, no engine needed.
import type { Body, Vec3 } from './Engine';

export interface EdgeGeometry {
  index: number;
  name: string;
  /** Flat x y z pairs: the two ends of each mesh segment along the edge. */
  segments: number[];
  mid: Vec3;
  length: number;
  /** The two faces the edge lies between, when the engine's name says so. */
  faces?: [number, number];
}

interface Seg { a: number; b: number }

/** Shortest distance from `p` to the segment a-b. */
export function pointToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy), p[2] - (a[2] + t * dz));
}

export function buildEdgeGeometry(body: Body): EdgeGeometry[] {
  const { positions, indices, faceIds, faces, edges } = body;
  const nv = positions.length / 3;
  const vert = (i: number): Vec3 => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];

  // 1. every mesh edge shared by triangles of two different faces is a piece of a B-rep edge, filed under that pair of faces
  const first = new Map<number, number>(); // mesh edge -> face of its first triangle, or -1 once seen twice
  const byPair = new Map<string, Seg[]>();
  for (let t = 0; t < faceIds.length; t++) {
    const f = faceIds[t]!;
    for (let k = 0; k < 3; k++) {
      const a = indices[t * 3 + k]!, b = indices[t * 3 + ((k + 1) % 3)]!;
      const key = a < b ? a * nv + b : b * nv + a;
      const f0 = first.get(key);
      if (f0 === undefined) first.set(key, f);
      else {
        if (f0 !== -1 && f0 !== f) { const pk = f0 < f ? `${f0}|${f}` : `${f}|${f0}`; (byPair.get(pk) ?? byPair.set(pk, []).get(pk)!).push({ a, b }); }
        first.set(key, -1);
      }
    }
  }

  // 2. within a pair of faces, segments that touch form one edge: group them
  const groups = new Map<string, Seg[][]>();
  for (const [pk, segs] of byPair) {
    const parent = new Map<number, number>();
    const find = (x: number): number => { let r = x; while ((parent.get(r) ?? r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
    for (const s of segs) { parent.set(s.a, parent.get(s.a) ?? s.a); parent.set(s.b, parent.get(s.b) ?? s.b); parent.set(find(s.a), find(s.b)); }
    const comp = new Map<number, Seg[]>();
    for (const s of segs) { const r = find(s.a); (comp.get(r) ?? comp.set(r, []).get(r)!).push(s); }
    groups.set(pk, [...comp.values()]);
  }

  // 3. give each engine edge the group (of the faces it is named for) that passes through its midpoint
  const faceByName = new Map<string, number>();
  for (const f of faces) faceByName.set(f.name, f.index);
  const flat = (segs: Seg[]) => segs.flatMap((s) => [...vert(s.a), ...vert(s.b)]);
  const distTo = (segs: Seg[], p: Vec3) => segs.reduce((m, s) => Math.min(m, pointToSegment(p, vert(s.a), vert(s.b))), Infinity);

  return edges.map((e) => {
    const [n1, n2] = e.name.replace(/~\d+$/, '').split('|');
    const f1 = n1 !== undefined ? faceByName.get(n1) : undefined, f2 = n2 !== undefined ? faceByName.get(n2) : undefined;
    let segments: number[] = [];
    if (f1 !== undefined && f2 !== undefined) {
      const pk = f1 < f2 ? `${f1}|${f2}` : `${f2}|${f1}`;
      const cands = groups.get(pk) ?? [];
      let best = -1, bd = Infinity;
      cands.forEach((c, i) => { const d = distTo(c, e.mid); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { segments = flat(cands[best]!); cands.splice(best, 1); } // each group belongs to one edge
    }
    // an edge with no two-face boundary in the mesh (a seam inside one face): a straight line between its ends keeps it selectable
    if (!segments.length) segments = [...e.start, ...e.end];
    return { index: e.index, name: e.name, segments, mid: e.mid, length: e.length, ...(f1 !== undefined && f2 !== undefined ? { faces: [f1, f2] as [number, number] } : {}) };
  });
}

/** The edge (and where on it) nearest to a point; used for tests and for picking. */
export function nearestEdge(geo: EdgeGeometry[], p: Vec3): { edge: EdgeGeometry; distance: number } | null {
  let best: { edge: EdgeGeometry; distance: number } | null = null;
  for (const g of geo) for (let i = 0; i < g.segments.length; i += 6) {
    const d = pointToSegment(p, [g.segments[i]!, g.segments[i + 1]!, g.segments[i + 2]!], [g.segments[i + 3]!, g.segments[i + 4]!, g.segments[i + 5]!]);
    if (!best || d < best.distance) best = { edge: g, distance: d };
  }
  return best;
}
