import type { Vec2 } from '../api';

/** Whether the segment a-b passes through the axis-aligned box (Liang-Barsky clipping). */
const segmentHitsBox = (a: Vec2, b: Vec2, x0: number, y0: number, x1: number, y1: number): boolean => {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
};

/** Whether the polyline through `pts` touches the box, even when none of its points lies inside it. */
export const segmentsTouchBox = (pts: Vec2[], x0: number, y0: number, x1: number, y1: number): boolean => {
  for (let i = 1; i < pts.length; i++) if (segmentHitsBox(pts[i - 1]!, pts[i]!, x0, y0, x1, y1)) return true;
  return false;
};
