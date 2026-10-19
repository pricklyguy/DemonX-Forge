import type { Vec2 } from './api';

/** A sketch's lines and arcs in the order they join end to end (the engine wants a path in order); unchanged when they do not form one chain. */
export function chainOrder(curves: { id: string; start?: Vec2; end?: Vec2 }[]): string[] {
  const ends = (c: { start?: Vec2; end?: Vec2 }) => (c.start && c.end ? [c.start, c.end] as const : null);
  const same = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  if (curves.length < 2 || curves.some((c) => !ends(c))) return curves.map((c) => c.id);
  // begin at a free end (a point no other curve touches) so a chain listed from its middle still comes out in order; a closed loop begins anywhere
  const touches = (c: { id: string }, p: Vec2) => curves.some((o) => o.id !== c.id && (same(ends(o)![0], p) || same(ends(o)![1], p)));
  const first = curves.find((c) => !touches(c, ends(c)![0]) || !touches(c, ends(c)![1])) ?? curves[0]!;
  const left = curves.filter((c) => c !== first); const out = [first];
  let tail = !touches(first, ends(first)![0]) ? ends(first)![1] : ends(first)![0] && !touches(first, ends(first)![1]) ? ends(first)![0] : ends(first)![1];
  while (left.length) {
    const i = left.findIndex((c) => same(ends(c)![0], tail) || same(ends(c)![1], tail));
    if (i < 0) return curves.map((c) => c.id);
    const c = left.splice(i, 1)[0]!; out.push(c);
    tail = same(ends(c)![0], tail) ? ends(c)![1] : ends(c)![0];
  }
  return out.map((c) => c.id);
}
