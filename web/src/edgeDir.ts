// Which way the Fillet / Chamfer arrow points: from the edge into the material, halfway between its two faces.
import type { Body, Vec3 } from '../../server/src/engine/Engine';

/** The outward normal of face `face` of the mesh near `near` (from the triangle whose centre is closest; the mesh winds outward). */
export function faceNormalNear(body: Body, face: number, near: Vec3): Vec3 | null {
  const { positions: P, indices: I, faceIds } = body;
  let best = -1, bd = Infinity;
  for (let t = 0; t < faceIds.length; t++) {
    if (faceIds[t] !== face) continue;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]! * 3; cx += P[v]! / 3; cy += P[v + 1]! / 3; cz += P[v + 2]! / 3; }
    const d = Math.hypot(cx - near[0], cy - near[1], cz - near[2]);
    if (d < bd) { bd = d; best = t; }
  }
  if (best < 0) return null;
  const v = (k: number): Vec3 => { const i = I[best * 3 + k]! * 3; return [P[i]!, P[i + 1]!, P[i + 2]!]; };
  const a = v(0), b = v(1), c = v(2), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(...n);
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : null;
}

/** Unit vector pointing into the material from an edge between two faces, or null when it cannot be told (the faces are opposite or the edge is smooth). */
export function inwardBisector(body: Body, faces: [number, number], mid: Vec3): Vec3 | null {
  const n1 = faceNormalNear(body, faces[0], mid), n2 = faceNormalNear(body, faces[1], mid);
  if (!n1 || !n2) return null;
  const s: Vec3 = [-(n1[0] + n2[0]), -(n1[1] + n2[1]), -(n1[2] + n2[2])], l = Math.hypot(...s);
  return l > 1e-6 ? [s[0] / l, s[1] / l, s[2] / l] : null;
}
