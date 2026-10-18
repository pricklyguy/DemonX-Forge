// Turns the engine's closed regions (lists of curve ids) into polygons for drawing and picking.
import type { SketchCurve, Vec2 } from '../api';

const TAU = Math.PI * 2;

/** Points along one curve. Lines give their two ends; arcs run counter-clockwise; a circle gives its full ring (first point not repeated). */
export function curvePoints(c: SketchCurve, segments = 48): Vec2[] {
  if (c.type === 'line' && c.start && c.end) return [c.start, c.end];
  if (c.type === 'circle' && c.center && c.radius) {
    return Array.from({ length: segments * 2 }, (_, i) => { const a = (i / (segments * 2)) * TAU; return [c.center![0] + c.radius! * Math.cos(a), c.center![1] + c.radius! * Math.sin(a)] as Vec2; });
  }
  if (c.type === 'arc' && c.center && c.start && c.end) {
    const a0 = Math.atan2(c.start[1] - c.center[1], c.start[0] - c.center[0]);
    let sweep = Math.atan2(c.end[1] - c.center[1], c.end[0] - c.center[0]) - a0;
    while (sweep <= 1e-9) sweep += TAU;
    const r = Math.hypot(c.start[0] - c.center[0], c.start[1] - c.center[1]);
    const n = Math.max(2, Math.ceil((sweep / TAU) * segments * 2));
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (sweep * i) / n; pts.push([c.center[0] + r * Math.cos(a), c.center[1] + r * Math.sin(a)]); }
    pts[0] = c.start; pts[n] = c.end;
    return pts;
  }
  return [];
}

const same = (a: Vec2, b: Vec2, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/** One closed loop as a polygon (not repeating the first point), or [] when the curves do not join up. */
export function loopPolygon(all: SketchCurve[], ids: string[], tol = 1e-4): Vec2[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const curves = ids.map((i) => byId.get(i)).filter((c): c is SketchCurve => !!c);
  if (curves.length !== ids.length || !curves.length) return [];
  const first = curves[0]!;
  if (first.type === 'circle') return curvePoints(first);
  const rest = curves.slice(1);
  let pts = curvePoints(first);
  if (pts.length < 2) return [];
  while (rest.length) {
    const end = pts[pts.length - 1]!;
    const i = rest.findIndex((c) => { const p = curvePoints(c); return p.length > 1 && (same(p[0]!, end, tol) || same(p[p.length - 1]!, end, tol)); });
    if (i < 0) return [];
    let p = curvePoints(rest[i]!);
    if (!same(p[0]!, end, tol)) p = [...p].reverse();
    pts = pts.concat(p.slice(1));
    rest.splice(i, 1);
  }
  if (same(pts[0]!, pts[pts.length - 1]!, tol)) pts.pop();
  return pts.length >= 3 ? pts : [];
}
