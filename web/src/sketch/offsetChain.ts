// Preview of Offset for a chain of connected lines (what the engine offsets when a curve is picked): the whole outline moves, not just the line clicked.
import type { SketchCurve, Vec2 } from '../api';

const TOL = 1e-3;
const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOL;

export interface LineChain { points: Vec2[]; closed: boolean; /** index of the picked line's segment in `points` */ picked: number }

/**
 * The lines connected end to end with the picked line (construction lines left out), walked in the picked line's own direction.
 * null when the chain is not only lines or it branches, so the caller falls back to previewing the one curve.
 */
export function lineChain(curves: SketchCurve[], pickedId: string): LineChain | null {
  const lines = curves.filter((c) => !c.construction && c.type === 'line' && c.start && c.end);
  const first = lines.find((c) => c.id === pickedId); if (!first) return null;
  const used = new Set([first.id]);
  const pts: Vec2[] = [first.start!, first.end!];
  const touching = (p: Vec2) => lines.filter((c) => !used.has(c.id) && (same(c.start!, p) || same(c.end!, p)));
  let closed = false, picked = 0;
  for (;;) { // forward from the end
    const end = pts[pts.length - 1]!;
    if (pts.length > 2 && same(end, pts[0]!)) { closed = true; break; }
    const next = touching(end); if (!next.length) break; if (next.length > 1) return null;
    const c = next[0]!; used.add(c.id); pts.push(same(c.start!, end) ? c.end! : c.start!);
  }
  if (!closed) for (;;) { // backward from the start
    const start = pts[0]!, prev = touching(start); if (!prev.length) break; if (prev.length > 1) return null;
    const c = prev[0]!; used.add(c.id); pts.unshift(same(c.start!, start) ? c.end! : c.start!); picked++;
  }
  const touchesChain = (c: SketchCurve) => pts.some((q) => (c.start && same(c.start, q)) || (c.end && same(c.end, q)));
  if (curves.some((c) => !c.construction && c.type !== 'line' && touchesChain(c))) return null; // an arc or circle joins it: the engine does the exact work
  if (lines.some((c) => !used.has(c.id) && pts.some((q) => same(c.start!, q) || same(c.end!, q)))) return null; // a line branches off the chain
  return { points: closed ? pts.slice(0, -1) : pts, closed, picked };
}

/** The chain moved sideways by d (positive: to the left of the walk), corners mitred where neighbouring offset lines meet. */
export function offsetChain(chain: LineChain, d: number): Vec2[] {
  const P = chain.points, n = P.length, segs = chain.closed ? n : n - 1;
  const lineAt = (i: number) => { // offset line i: a point on it and its direction
    const a = P[i]!, b = P[(i + 1) % n]!, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return { p: [a[0] - (dy / l) * d, a[1] + (dx / l) * d] as Vec2, v: [dx / l, dy / l] as Vec2 };
  };
  const out: Vec2[] = [];
  const corner = (i: number, j: number): Vec2 => { // where offset line i meets offset line j
    const A = lineAt(i), B = lineAt(j), cross = A.v[0] * B.v[1] - A.v[1] * B.v[0];
    if (Math.abs(cross) < 1e-9) return [B.p[0], B.p[1]];
    const t = ((B.p[0] - A.p[0]) * B.v[1] - (B.p[1] - A.p[1]) * B.v[0]) / cross;
    return [A.p[0] + A.v[0] * t, A.p[1] + A.v[1] * t];
  };
  if (!chain.closed) out.push(lineAt(0).p);
  for (let i = chain.closed ? 0 : 1; i < segs + (chain.closed ? 0 : 0); i++) out.push(corner((i - 1 + segs) % segs, i % segs));
  if (!chain.closed) { const l = lineAt(segs - 1); out.push([l.p[0] + l.v[0] * Math.hypot(P[n - 1]![0] - P[n - 2]![0], P[n - 1]![1] - P[n - 2]![1]), l.p[1] + l.v[1] * Math.hypot(P[n - 1]![0] - P[n - 2]![0], P[n - 1]![1] - P[n - 2]![1])]); }
  else out.push(out[0]!);
  return out;
}

/** Signed distance of q from the picked segment's line, positive to the left of the walk. */
export function sideDistance(chain: LineChain, q: Vec2): number {
  const a = chain.points[chain.picked]!, b = chain.points[(chain.picked + 1) % chain.points.length]!;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  return l < 1e-9 ? 0 : (dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / l;
}
