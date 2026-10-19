// What a click (or a typed number) does for each sketch tool. Pure: the caller sends the steps to the engine.
import type { Vec2 } from '../api';
import type { Picked } from './pick';
import { round3 } from './snap';

export type DrawTool = 'line' | 'rect' | 'rectCenter' | 'circle' | 'circle2' | 'arc3' | 'slot';
export type ConstraintTool = 'horizontal' | 'coincident' | 'parallel' | 'perpendicular' | 'tangent' | 'equal' | 'midpoint' | 'concentric' | 'fix';
export type PickTool = 'dimension' | 'trim' | 'extend' | 'offset' | 'fillet' | ConstraintTool;
export type Tool = DrawTool | PickTool;
export interface Step { command: string; params: Record<string, unknown> }
export interface Result { steps: Step[]; pending: Vec2[]; message?: string }

const DRAW: DrawTool[] = ['line', 'rect', 'rectCenter', 'circle', 'circle2', 'arc3', 'slot'];
export const isDraw = (t: Tool | null): t is DrawTool => !!t && (DRAW as string[]).includes(t);
/** What the pointer can land on for a tool that picks existing geometry. */
export const PICK_MODE: Record<PickTool, 'curve' | 'point' | 'any'> = {
  dimension: 'curve', trim: 'curve', extend: 'curve', offset: 'curve', fillet: 'point',
  horizontal: 'any', coincident: 'any', parallel: 'curve', perpendicular: 'curve', tangent: 'curve', equal: 'curve', midpoint: 'any', concentric: 'curve', fix: 'any',
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r3 = (p: Vec2): Vec2 => [round3(p[0]), round3(p[1])];
const EPS = 1e-6;
/** Distance from `p` to the infinite line through a and b. */
const lineDist = (a: Vec2, b: Vec2, p: Vec2) => { const l = dist(a, b); return l < EPS ? dist(a, p) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l; };

/** A click at `pt` while `pending` holds the points already placed by this tool. */
export function onClick(tool: DrawTool, pending: Vec2[], pt: Vec2): Result {
  const p = r3(pt);
  const a = pending[0], b = pending[1];
  switch (tool) {
    case 'line': {
      const last = pending[pending.length - 1];
      if (!last) return { steps: [], pending: [p] };
      if (dist(last, p) < EPS) return { steps: [], pending };
      // pending keeps every point of the chain; landing on the first one (after two segments) closes the shape and ends the tool
      const closes = pending.length >= 3 && dist(pending[0]!, p) < EPS;
      return { steps: [{ command: 'sketch.line', params: { points: [last, p] } }], pending: closes ? [] : [...pending, p] };
    }
    case 'rect':
      if (!a) return { steps: [], pending: [p] };
      if (Math.abs(a[0] - p[0]) < EPS || Math.abs(a[1] - p[1]) < EPS) return { steps: [], pending, message: 'A rectangle needs a width and a height' };
      return { steps: [{ command: 'sketch.rectangle.two_point', params: { p0: a, p1: p } }], pending: [] };
    case 'rectCenter':
      if (!a) return { steps: [], pending: [p] };
      if (Math.abs(a[0] - p[0]) < EPS || Math.abs(a[1] - p[1]) < EPS) return { steps: [], pending, message: 'A rectangle needs a width and a height' };
      return { steps: [{ command: 'sketch.rectangle.center', params: { center: a, corner: p } }], pending: [] };
    case 'circle': {
      if (!a) return { steps: [], pending: [p] };
      const r = dist(a, p);
      if (r < EPS) return { steps: [], pending, message: 'A circle needs a size' };
      return { steps: [{ command: 'sketch.circle.center', params: { center: a, diameter: round3(2 * r) } }], pending: [] };
    }
    case 'circle2':
      if (!a) return { steps: [], pending: [p] };
      if (dist(a, p) < EPS) return { steps: [], pending, message: 'A circle needs a size' };
      return { steps: [{ command: 'sketch.circle.two_point', params: { p0: a, p1: p } }], pending: [] };
    case 'arc3': // start, end, then a point the arc passes through
      if (!a) return { steps: [], pending: [p] };
      if (!b) return dist(a, p) < EPS ? { steps: [], pending } : { steps: [], pending: [a, p] };
      if (lineDist(a, b, p) < EPS) return { steps: [], pending, message: 'The third point must not lie on the line between the first two' };
      return { steps: [{ command: 'sketch.arc.three_point', params: { start: a, end: b, through: p } }], pending: [] };
    case 'slot': // the two end-circle centres, then a point that sets the width
      if (!a) return { steps: [], pending: [p] };
      if (!b) return dist(a, p) < EPS ? { steps: [], pending } : { steps: [], pending: [a, p] };
      if (lineDist(a, b, p) < EPS) return { steps: [], pending, message: 'Click away from the centre line to set the width' };
      return { steps: [{ command: 'sketch.slot.center_to_center', params: { p0: a, p1: b, width: round3(2 * lineDist(a, b, p)) } }], pending: [] };
  }
}

const nums = (text: string) => text.replace(/[x×;]/gi, ' ').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);

/** Numbers typed while a tool has its first point down: rectangle "40,30", circle "10" (diameter), line "25" or "25,45" (length, angle in degrees), slot width. The cursor only decides which way the shape goes. */
export function onTyped(tool: DrawTool, pending: Vec2[], cursor: Vec2, text: string): Result {
  const a = pending[0];
  const v = nums(text);
  if (!a || !v.length || v.some((x) => !Number.isFinite(x))) return { steps: [], pending, message: 'Type numbers, for example 40,30' };
  if (tool === 'rect' || tool === 'rectCenter') {
    const w = v[0]!, h = v.length > 1 ? v[1]! : v[0]!;
    if (!(w > 0) || !(h > 0)) return { steps: [], pending, message: 'Width and height must be above 0' };
    const sx = cursor[0] >= a[0] ? 1 : -1, sy = cursor[1] >= a[1] ? 1 : -1;
    if (tool === 'rect') return { steps: [{ command: 'sketch.rectangle.two_point', params: { p0: a, p1: r3([a[0] + sx * w, a[1] + sy * h]) } }], pending: [] };
    return { steps: [{ command: 'sketch.rectangle.center', params: { center: a, corner: r3([a[0] + sx * w / 2, a[1] + sy * h / 2]) } }], pending: [] }; // typed values are the full width and height
  }
  if (tool === 'circle') {
    if (!(v[0]! > 0)) return { steps: [], pending, message: 'The diameter must be above 0' };
    return { steps: [{ command: 'sketch.circle.center', params: { center: a, diameter: round3(v[0]!) } }], pending: [] };
  }
  if (tool === 'circle2') {
    if (!(v[0]! > 0)) return { steps: [], pending, message: 'The diameter must be above 0' };
    const ang = dist(a, cursor) < EPS ? 0 : Math.atan2(cursor[1] - a[1], cursor[0] - a[0]);
    return { steps: [{ command: 'sketch.circle.two_point', params: { p0: a, p1: r3([a[0] + v[0]! * Math.cos(ang), a[1] + v[0]! * Math.sin(ang)]) } }], pending: [] };
  }
  if (tool === 'line') {
    const from = pending[pending.length - 1]!;
    const len = v[0]!;
    if (!(len > 0)) return { steps: [], pending, message: 'The length must be above 0' };
    const ang = v.length > 1 ? (v[1]! * Math.PI) / 180 : Math.atan2(cursor[1] - from[1], cursor[0] - from[0]);
    const end = r3([from[0] + len * Math.cos(ang), from[1] + len * Math.sin(ang)]);
    return { steps: [{ command: 'sketch.line', params: { points: [from, end] } }], pending: [...pending, end] };
  }
  if (tool === 'slot' && pending.length === 2) {
    if (!(v[0]! > 0)) return { steps: [], pending, message: 'The width must be above 0' };
    return { steps: [{ command: 'sketch.slot.center_to_center', params: { p0: pending[0], p1: pending[1], width: round3(v[0]!) } }], pending: [] };
  }
  return { steps: [], pending, message: 'Click to place this one' };
}

const ring = (c: Vec2, r: number, n = 64): Vec2[] => Array.from({ length: n + 1 }, (_, i) => { const t = (i / n) * Math.PI * 2; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as Vec2; });
const arcPts = (c: Vec2, r: number, from: number, to: number, n = 24): Vec2[] => Array.from({ length: n + 1 }, (_, i) => { const t = from + ((to - from) * i) / n; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as Vec2; });

/** The circle through three points, or null when they are in a line. */
export function circleThrough(a: Vec2, b: Vec2, c: Vec2): { center: Vec2; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { center: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}

/** The outline to show while placing the next point: lists of points to join with lines. */
export function preview(tool: DrawTool, pending: Vec2[], cur: Vec2): Vec2[][] {
  const a = pending[0], b = pending[1];
  if (!a) return [];
  switch (tool) {
    case 'line': return [[pending[pending.length - 1]!, cur]];
    case 'rect': return [[a, [cur[0], a[1]], cur, [a[0], cur[1]], a]];
    case 'rectCenter': { const dx = Math.abs(cur[0] - a[0]), dy = Math.abs(cur[1] - a[1]); return [[[a[0] - dx, a[1] - dy], [a[0] + dx, a[1] - dy], [a[0] + dx, a[1] + dy], [a[0] - dx, a[1] + dy], [a[0] - dx, a[1] - dy]]]; }
    case 'circle': return [ring(a, dist(a, cur))];
    case 'circle2': return [ring([(a[0] + cur[0]) / 2, (a[1] + cur[1]) / 2], dist(a, cur) / 2)];
    case 'arc3': {
      if (!b) return [[a, cur]];
      const c = circleThrough(a, b, cur);
      if (!c) return [[a, b]];
      // the arc runs from a to b on the side of the pointer
      const ta = Math.atan2(a[1] - c.center[1], a[0] - c.center[0]), tb = Math.atan2(b[1] - c.center[1], b[0] - c.center[0]), tm = Math.atan2(cur[1] - c.center[1], cur[0] - c.center[0]);
      const ccw = (x: number, y: number) => ((y - x) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const throughCcw = ccw(ta, tm) < ccw(ta, tb);
      const pts = throughCcw ? arcPts(c.center, c.r, ta, ta + ccw(ta, tb), 40) : arcPts(c.center, c.r, ta, ta - ccw(tb, ta), 40);
      pts[0] = a; pts[pts.length - 1] = b; // end exactly on the clicked points
      return [pts];
    }
    case 'slot': {
      if (!b) return [[a, cur]];
      const w = lineDist(a, b, cur), len = dist(a, b);
      if (w < EPS || len < EPS) return [[a, b]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
      const o = (p: Vec2, k: number): Vec2 => [p[0] + nx * w * k, p[1] + ny * w * k];
      return [[o(a, 1), o(b, 1)], [o(a, -1), o(b, -1)], arcPts(b, w, ang - Math.PI / 2, ang + Math.PI / 2, 16), arcPts(a, w, ang + Math.PI / 2, ang + (3 * Math.PI) / 2, 16)];
    }
  }
}

/** Where a constraint tool is after the entities picked so far: ready with a step, still needing more picks, or refusing with a reason. */
export function constraintStep(tool: ConstraintTool, picks: Picked[]): { step?: Step; done: boolean; message?: string } {
  const [x, y] = picks;
  switch (tool) {
    case 'horizontal':
      if (!x) return { done: false };
      if (x.kind === 'curve') return x.type === 'line' ? { done: true, step: { command: 'sketch.constraint.horizontal_vertical', params: { line: x.id } } } : { done: true, message: 'Pick a line, or two points' };
      if (!y) return { done: false };
      return y.kind === 'point' ? { done: true, step: { command: 'sketch.constraint.horizontal_vertical', params: { points: [x.id, y.id] } } } : { done: true, message: 'Pick two points, or one line' };
    case 'coincident':
      if (!x || !y) return { done: false };
      return x.kind === 'curve' && y.kind === 'point' ? { done: true, step: { command: 'sketch.constraint.coincident', params: { a: y.id, b: x.id } } } : { done: true, step: { command: 'sketch.constraint.coincident', params: { a: x.id, b: y.id } } };
    case 'midpoint': {
      if (!x || !y) return { done: false };
      const pt = [x, y].find((q) => q.kind === 'point'), ln = [x, y].find((q) => q.kind === 'curve' && q.type === 'line');
      return pt && ln ? { done: true, step: { command: 'sketch.constraint.midpoint', params: { point: pt.id, line: ln.id } } } : { done: true, message: 'Pick a point and a line' };
    }
    case 'fix':
      return x ? { done: true, step: { command: 'sketch.constraint.fix', params: { entity: x.id } } } : { done: false };
    default: { // parallel, perpendicular, tangent, equal, concentric: two curves
      if (!x || !y) return { done: false };
      return { done: true, step: { command: `sketch.constraint.${tool}`, params: { a: x.id, b: y.id } } };
    }
  }
}

/** The dimension step for a clicked curve and the typed text. */
export function dimensionFor(curve: { id: string; type: string }, value: string): Step | null {
  const type = curve.type === 'line' ? 'length' : curve.type === 'circle' ? 'diameter' : curve.type === 'arc' ? 'radius' : null;
  if (!type) return null;
  const n = Number(value);
  return { command: 'sketch.dimension', params: { entities: [curve.id], type, value: value.trim() !== '' && Number.isFinite(n) ? n : value.trim() } };
}

/** The boxes on a shape being drawn: what each is called, for a tool. Empty for tools that are placed by clicking only. */
export function sizeFields(tool: Tool | null): string[] {
  switch (tool) {
    case 'rect': case 'rectCenter': return ['Width', 'Height'];
    case 'circle': case 'circle2': return ['Diameter'];
    case 'line': return ['Length', 'Angle'];
    default: return [];
  }
}

/** The sizes the shape has at `cursor`, in the order of sizeFields (angle in degrees). */
export function liveSizes(tool: DrawTool, pending: Vec2[], cursor: Vec2): number[] {
  const a = pending[0]; if (!a) return [];
  const dx = cursor[0] - a[0], dy = cursor[1] - a[1];
  switch (tool) {
    case 'rect': return [Math.abs(dx), Math.abs(dy)];
    case 'rectCenter': return [2 * Math.abs(dx), 2 * Math.abs(dy)];
    case 'circle': return [2 * Math.hypot(dx, dy)];
    case 'circle2': return [Math.hypot(dx, dy)];
    case 'line': { const f = pending[pending.length - 1]!; return [Math.hypot(cursor[0] - f[0], cursor[1] - f[1]), (Math.atan2(cursor[1] - f[1], cursor[0] - f[0]) * 180) / Math.PI]; }
    default: return [];
  }
}

/** The point the pointer would have to be at to give the typed sizes ('' keeps what the pointer gives). Which way the shape goes still follows the pointer. */
export function applyTyped(tool: DrawTool, pending: Vec2[], cursor: Vec2, typed: string[]): Vec2 {
  const a = pending[0]; if (!a) return cursor;
  const num = (i: number): number | null => { const s = (typed[i] ?? '').trim(); const n = Number(s); return s !== '' && Number.isFinite(n) ? n : null; };
  const live = liveSizes(tool, pending, cursor);
  const sx = cursor[0] >= a[0] ? 1 : -1, sy = cursor[1] >= a[1] ? 1 : -1;
  const ang = Math.atan2(cursor[1] - a[1], cursor[0] - a[0]);
  switch (tool) {
    case 'rect': { const w = num(0), h = num(1); return [a[0] + sx * (w !== null && w > 0 ? w : live[0]!), a[1] + sy * (h !== null && h > 0 ? h : live[1]!)]; }
    case 'rectCenter': { const w = num(0), h = num(1); return [a[0] + (sx * (w !== null && w > 0 ? w : live[0]!)) / 2, a[1] + (sy * (h !== null && h > 0 ? h : live[1]!)) / 2]; }
    case 'circle': { const d = num(0); const r = (d !== null && d > 0 ? d : live[0]!) / 2; return [a[0] + r * Math.cos(ang), a[1] + r * Math.sin(ang)]; }
    case 'circle2': { const d = num(0); const r = d !== null && d > 0 ? d : live[0]!; return [a[0] + r * Math.cos(ang), a[1] + r * Math.sin(ang)]; }
    case 'line': {
      const f = pending[pending.length - 1]!, len = num(0), an = num(1);
      const L = len !== null && len > 0 ? len : live[0]!, A = an !== null ? (an * Math.PI) / 180 : Math.atan2(cursor[1] - f[1], cursor[0] - f[0]);
      return [f[0] + L * Math.cos(A), f[1] + L * Math.sin(A)];
    }
    default: return cursor;
  }
}
