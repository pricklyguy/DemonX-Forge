// What a click (or a typed number) does for each sketch tool. Pure: the caller sends the steps to the engine.
import type { Vec2 } from '../api';
import { round3 } from './snap';

export type Tool = 'line' | 'rect' | 'circle' | 'dimension';
export interface Step { command: string; params: Record<string, unknown> }
export interface Result { steps: Step[]; pending: Vec2[]; message?: string }

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r3 = (p: Vec2): Vec2 => [round3(p[0]), round3(p[1])];
const EPS = 1e-6;

/** A click at `pt` while `pending` holds the points already placed by this tool. */
export function onClick(tool: Tool, pending: Vec2[], pt: Vec2): Result {
  const p = r3(pt);
  switch (tool) {
    case 'line': {
      const a = pending[pending.length - 1];
      if (!a) return { steps: [], pending: [p] };
      if (dist(a, p) < EPS) return { steps: [], pending };
      // pending keeps every point of the chain; landing on the first one (after two segments) closes the shape and ends the tool
      const closes = pending.length >= 3 && dist(pending[0]!, p) < EPS;
      return { steps: [{ command: 'sketch.line', params: { points: [a, p] } }], pending: closes ? [] : [...pending, p] };
    }
    case 'rect': {
      const a = pending[0];
      if (!a) return { steps: [], pending: [p] };
      if (Math.abs(a[0] - p[0]) < EPS || Math.abs(a[1] - p[1]) < EPS) return { steps: [], pending, message: 'A rectangle needs a width and a height' };
      return { steps: [{ command: 'sketch.rectangle.two_point', params: { p0: a, p1: p } }], pending: [] };
    }
    case 'circle': {
      const c = pending[0];
      if (!c) return { steps: [], pending: [p] };
      const r = dist(c, p);
      if (r < EPS) return { steps: [], pending, message: 'A circle needs a size' };
      return { steps: [{ command: 'sketch.circle.center', params: { center: c, diameter: round3(2 * r) } }], pending: [] };
    }
    default:
      return { steps: [], pending };
  }
}

const nums = (text: string) => text.replace(/[x×;]/gi, ' ').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);

/** Numbers typed while a tool has its first point down: rectangle "40,30", circle "10" (diameter), line "25" or "25,45" (length, angle in degrees). The cursor only decides which way the shape goes. */
export function onTyped(tool: Tool, pending: Vec2[], cursor: Vec2, text: string): Result {
  const a = pending[0];
  const v = nums(text);
  if (!a || !v.length || v.some((x) => !Number.isFinite(x))) return { steps: [], pending, message: 'Type numbers, for example 40,30' };
  if (tool === 'rect') {
    const w = v[0]!, h = v.length > 1 ? v[1]! : v[0]!;
    if (!(w > 0) || !(h > 0)) return { steps: [], pending, message: 'Width and height must be above 0' };
    const sx = cursor[0] >= a[0] ? 1 : -1, sy = cursor[1] >= a[1] ? 1 : -1;
    return { steps: [{ command: 'sketch.rectangle.two_point', params: { p0: a, p1: r3([a[0] + sx * w, a[1] + sy * h]) } }], pending: [] };
  }
  if (tool === 'circle') {
    if (!(v[0]! > 0)) return { steps: [], pending, message: 'The diameter must be above 0' };
    return { steps: [{ command: 'sketch.circle.center', params: { center: a, diameter: round3(v[0]!) } }], pending: [] };
  }
  if (tool === 'line') {
    const from = pending[pending.length - 1]!;
    const len = v[0]!;
    if (!(len > 0)) return { steps: [], pending, message: 'The length must be above 0' };
    const ang = v.length > 1 ? (v[1]! * Math.PI) / 180 : Math.atan2(cursor[1] - from[1], cursor[0] - from[0]);
    const end = r3([from[0] + len * Math.cos(ang), from[1] + len * Math.sin(ang)]);
    return { steps: [{ command: 'sketch.line', params: { points: [from, end] } }], pending: [...pending, end] };
  }
  return { steps: [], pending };
}

/** The dimension type and the text the engine wants for a clicked curve. */
export function dimensionFor(curve: { id: string; type: string }, value: string): Step | null {
  const type = curve.type === 'line' ? 'length' : curve.type === 'circle' ? 'diameter' : curve.type === 'arc' ? 'radius' : null;
  if (!type) return null;
  const n = Number(value);
  return { command: 'sketch.dimension', params: { entities: [curve.id], type, value: value.trim() !== '' && Number.isFinite(n) ? n : value.trim() } };
}
