// Turns a closed outline cut from a mesh (a ring of points) into sketch pieces: straight lines, arcs (where the points sit on a circle,
// as the facets of a round wall do) and whole circles. Pure functions, no engine.
export type V2 = [number, number];

export type Piece =
  | { kind: 'circle'; center: V2; radius: number }
  | { kind: 'line'; from: V2; to: V2 }
  | { kind: 'arc'; from: V2; through: V2; to: V2 };

const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const DEG = Math.PI / 180;
/** The turn at b going a -> b -> c, in radians, positive to the left. */
const turn = (a: V2, b: V2, c: V2) => { const x1 = b[0] - a[0], y1 = b[1] - a[1], x2 = c[0] - b[0], y2 = c[1] - b[1]; return Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2); };

/** Signed area (positive when the ring runs counter-clockwise). */
export const ringArea = (p: V2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;

/** The ring without repeated points and without points that lie on the straight line between their neighbours. */
export function simplifyRing(ring: V2[], tol: number): V2[] {
  let p = ring.filter((q, i) => dist(q, ring[(i + ring.length - 1) % ring.length]!) > tol * 0.01);
  for (let again = true; again && p.length > 3;) {
    again = false;
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const a = p[(i + p.length - 1) % p.length]!, b = p[i]!, c = p[(i + 1) % p.length]!;
      const l = dist(a, c); if (l < 1e-12) continue;
      const off = Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / l; // how far b is from the line a-c
      if (off <= tol * 0.1 && Math.abs(turn(a, b, c)) < 0.35 * DEG) { p = [...p.slice(0, i), ...p.slice(i + 1)]; again = true; i--; }
    }
  }
  return p;
}

/** The circle through the points that fits them best (algebraic fit), or null when they are (nearly) in a line. */
export function fitCircle(p: V2[]): { c: V2; r: number } | null {
  const n = p.length; if (n < 3) return null;
  const mx = p.reduce((s, q) => s + q[0], 0) / n, my = p.reduce((s, q) => s + q[1], 0) / n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const q of p) { const u = q[0] - mx, v = q[1] - my; suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-12 * (suu + svv) ** 2) return null;
  const a = [[suu, suv], [suv, svv]], b = [(suuu + suvv) / 2, (svvv + svuu) / 2];
  const d = a[0]![0]! * a[1]![1]! - a[0]![1]! * a[1]![0]!;
  const u0 = (b[0]! * a[1]![1]! - b[1]! * a[0]![1]!) / d, v0 = (a[0]![0]! * b[1]! - a[1]![0]! * b[0]!) / d;
  const c: V2 = [mx + u0, my + v0];
  const r = p.reduce((s, q) => s + dist(q, c), 0) / n;
  return Number.isFinite(r) && r > 0 ? { c, r } : null;
}

const fits = (pts: V2[], tol: number): { c: V2; r: number } | null => {
  const f = fitCircle(pts); if (!f) return null;
  return pts.every((q) => Math.abs(dist(q, f.c) - f.r) <= tol) ? f : null;
};

/** Do these consecutive points look like the facets of one round wall: the same way round, small turns, similar facet lengths? */
function facets(pts: V2[]): boolean {
  let sign = 0, lo = Infinity, hi = 0;
  for (let i = 1; i < pts.length; i++) { const l = dist(pts[i - 1]!, pts[i]!); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  if (hi > 2.5 * lo) return false;
  for (let i = 1; i < pts.length - 1; i++) {
    const t = turn(pts[i - 1]!, pts[i]!, pts[i + 1]!);
    if (Math.abs(t) < 0.3 * DEG || Math.abs(t) > 46 * DEG) return false;
    if (sign === 0) sign = Math.sign(t); else if (Math.sign(t) !== sign) return false;
  }
  return true;
}

/** One closed ring as sketch pieces that join end to end: lines, arcs and, for a round hole, a circle. (A smooth shape that is not a circle, such as an ellipse, comes out as several arcs; null only when the ring is too small to be a shape.) */
export function ringToPieces(ring: V2[], tol: number): Piece[] | null {
  const p = simplifyRing(ring, tol), n = p.length; if (n < 3) return null;
  const turns = p.map((q, i) => turn(p[(i + n - 1) % n]!, q, p[(i + 1) % n]!));
  const sharp = turns.map((t) => Math.abs(t) > 46 * DEG);
  if (!sharp.some(Boolean)) { // smooth all the way round: a circle, or a slot-like shape whose lines join the arcs without a corner
    const whole = fits(p, tol);
    if (whole && n >= 8 && facets([...p, p[0]!, p[1]!])) return [{ kind: 'circle', center: whole.c, radius: whole.r }];
  }
  // start at a corner; with none, at the end of the longest side (a line meeting an arc)
  let start = sharp.findIndex(Boolean);
  if (start < 0) { let best = 0, l = 0; for (let i = 0; i < n; i++) { const d = dist(p[i]!, p[(i + 1) % n]!); if (d > l) { l = d; best = i; } } start = (best + 1) % n; }
  const q = [...p.slice(start), ...p.slice(0, start), p[start]!]; // closed: the first point again at the end
  const out: Piece[] = [];
  const longSide = (i: number) => { const ls = q.slice(1).map((v, k) => dist(q[k]!, v)).sort((a, b) => a - b); return dist(q[i]!, q[i + 1]!) > 2.5 * ls[Math.floor(ls.length / 2)]!; };
  let i = 0;
  while (i < q.length - 1) {
    let best = -1, circ: { c: V2; r: number } | null = null;
    if (!longSide(i)) for (let e = i + 3; e < q.length; e++) {
      const run = q.slice(i, e + 1), f = fits(run, tol);
      if (!f || !facets(run)) break;
      best = e; circ = f;
    }
    if (best > 0 && circ) {
      const mid = q[Math.floor((i + best) / 2)]!; // a real point of the ring between the ends, so the arc passes through three of the mesh's own points
      out.push({ kind: 'arc', from: q[i]!, through: mid, to: q[best]! }); i = best;
    } else { out.push({ kind: 'line', from: q[i]!, to: q[i + 1]! }); i++; }
  }
  return out;
}
