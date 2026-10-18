// Finding the sketch entity under the pointer. Distances are in sketch units (mm); the caller passes a tolerance worth a few screen pixels.
import type { Sketch, SketchCurve, Vec2 } from '../api';
import { curvePoints } from './loops';

export interface Picked { kind: 'curve' | 'point'; id: string; type?: string }
export type PickMode = 'curve' | 'point' | 'any';

/** Shortest distance from `pt` to the curve (lines, arcs and circles are walked as short segments). */
export function distToCurve(c: SketchCurve, pt: Vec2): number {
  const pts = curvePoints(c, 48);
  if (pts.length < 2) return Infinity;
  const loop = c.type === 'circle';
  let best = Infinity;
  for (let i = 0; i < pts.length - (loop ? 0 : 1); i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)));
  }
  return best;
}

/** Points win over curves when both are in reach (a corner is also on two lines), unless only curves are wanted. */
export function pickEntity(s: Sketch, pt: Vec2, tol: number, mode: PickMode): Picked | null {
  if (mode !== 'curve') {
    let best: Picked | null = null, bd = tol;
    for (const q of s.points) { const d = Math.hypot(q.at[0] - pt[0], q.at[1] - pt[1]); if (d <= bd) { bd = d; best = { kind: 'point', id: q.id }; } }
    if (best) return best;
  }
  if (mode !== 'point') {
    let best: Picked | null = null, bd = tol;
    for (const c of s.curves) { const d = distToCurve(c, pt); if (d <= bd) { bd = d; best = { kind: 'curve', id: c.id, type: c.type }; } }
    return best;
  }
  return null;
}

export const midpointOf = (c: SketchCurve): Vec2 => c.start && c.end ? [(c.start[0] + c.end[0]) / 2, (c.start[1] + c.end[1]) / 2] : c.center ? [c.center[0] + (c.radius ?? 0), c.center[1]] : [0, 0];
