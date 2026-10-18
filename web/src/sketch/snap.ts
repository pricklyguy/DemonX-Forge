import type { Vec2 } from '../api';

/** A "nice" grid step (1, 2, 5, 10, 20, ...) no smaller than `min`. */
export function niceStep(min: number): number {
  if (!(min > 0) || !Number.isFinite(min)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(min)));
  for (const m of [1, 2, 5, 10]) if (m * e >= min * (1 - 1e-9)) return m * e;
  return 10 * e;
}

export const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function snapGrid(p: Vec2, step: number): Vec2 {
  return [round3(Math.round(p[0] / step) * step), round3(Math.round(p[1] / step) * step)];
}

/** The nearest candidate within `tol`, or null. */
export function snapPoints(p: Vec2, candidates: Vec2[], tol: number): Vec2 | null {
  let best: Vec2 | null = null, bd = tol;
  for (const c of candidates) { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d <= bd) { bd = d; best = c; } }
  return best;
}
