// Sketch plane maths. A plane is an origin and two unit directions; the sketch's (x, y) maps to origin + x * xDir + y * yDir.
import type { Vec2, Vec3 } from '../api';

export interface Plane { origin: Vec3; xDir: Vec3; yDir: Vec3 }

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The side the sketch is seen from when x points right and y points up. */
export const normalOf = (p: Plane): Vec3 => cross(p.xDir, p.yDir);

export const toWorld = (p: Plane, q: Vec2): Vec3 => add(p.origin, add(scale(p.xDir, q[0]), scale(p.yDir, q[1])));
export const toSketch = (p: Plane, w: Vec3): Vec2 => { const d = sub(w, p.origin); return [dot(d, p.xDir), dot(d, p.yDir)]; };

/** Where a ray (origin o, direction d) meets the plane, in sketch coordinates; null when parallel or behind the ray. */
export function rayToSketch(p: Plane, o: Vec3, d: Vec3): Vec2 | null {
  const n = normalOf(p), denom = dot(d, n);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(sub(p.origin, o), n) / denom;
  if (t < 0) return null;
  return toSketch(p, add(o, scale(d, t)));
}

/** The three origin planes as the engine orients them (see docs/PLAN.md): sketch y on XZ points down the world's Z. */
export const ORIGIN_PLANES: Record<'XY' | 'XZ' | 'YZ', Plane> = {
  XY: { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0] },
  XZ: { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 0, -1] },
  YZ: { origin: [0, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, 1] },
};
