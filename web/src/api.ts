import type { Snapshot, Vec3 } from '../../server/src/engine/Engine';
import type { UpdateInfo } from '../../server/src/update/model';

export type { UpdateInfo } from '../../server/src/update/model';

export type { Doc, Snapshot, Body, Face, Parameter, TimelineItem, Sketch, SketchCurve, SketchPoint, SketchDimension, Profile, Vec2, Vec3 } from '../../server/src/engine/Engine';

async function call(path: string, body?: unknown): Promise<Snapshot> {
  const r = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `The server answered ${r.status}`);
  return j as Snapshot;
}

export interface FeatureDefinition {
  type: string; name: string; id: number; suppressed: boolean; error: string | null;
  definition: { sketch?: number; operation?: string; extent?: { distance?: string; direction?: string }; profiles?: { type: string; loops?: string[][] }; [k: string]: unknown };
}
export interface Dependents { deleted_with_it: string[]; would_fail: string[] }

async function ask<T>(command: string, params: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/query', { method: 'POST', body: JSON.stringify({ command, params }) });
  const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `The server answered ${r.status}`);
  return j.result as T;
}

async function fileCall(path: string, body: unknown): Promise<{ data: ArrayBuffer; filename: string }> {
  const r = await fetch(`/api/${path}`, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` })); throw new Error(j.error ?? `The server answered ${r.status}`); }
  return { data: await r.arrayBuffer(), filename: decodeURIComponent(r.headers.get('x-forge-filename') ?? 'file') };
}

export const api = {
  /** The design as .forge bytes, called `name` from now on. */
  save: (name: string) => fileCall('save', { name }),
  exportAs: (format: string, sketch?: string) => fileCall('export', { format, ...(sketch ? { sketch } : {}) }),
  /** A flat face's outline as DXF (the design is not changed). */
  exportFaceDxf: (face: { body: string; index: number; point: Vec3 }) => fileCall('export', { format: 'dxf', face }),
  open: async (data: ArrayBuffer, name: string): Promise<Snapshot> => {
    const r = await fetch(`/api/open?name=${encodeURIComponent(name)}`, { method: 'POST', body: data });
    const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` }));
    if (!r.ok) throw new Error(j.error ?? `The server answered ${r.status}`);
    return j as Snapshot;
  },
  /** Insert a STEP or IGES file into the design as a new component. */
  importModel: async (data: ArrayBuffer, name: string, ext: string): Promise<Snapshot> => {
    const r = await fetch(`/api/import?name=${encodeURIComponent(name)}&ext=${encodeURIComponent(ext)}`, { method: 'POST', body: data });
    const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` }));
    if (!r.ok) throw new Error(j.error ?? `The server answered ${r.status}`);
    return j as Snapshot;
  },
  /** A cut through a body as DXF (the design is not changed). */
  exportSection: (section: { plane: 'XY' | 'XZ' | 'YZ'; offset: number; body: string }) => fileCall('export', { format: 'dxf', section }),
  /** Mesh to Solid: rebuild a closed mechanical mesh (an imported STL, OBJ or 3MF) as an editable solid. */
  meshConvert: (body: string, tolerance: number) => call('mesh-convert', { body, tolerance }),
  newDesign: () => call('new', {}),
  inspectFeature: (feature: string | number) => ask<FeatureDefinition>('timeline.inspect', { feature }),
  dependents: (feature: string | number) => ask<Dependents>('timeline.dependents', { feature }),
  state: () => call('state'),
  demo: () => call('demo', {}),
  command: (command: string, params: Record<string, unknown>) => call('command', { command, params }),
  batch: (steps: { command: string; params?: Record<string, unknown> }[]) => call('batch', { steps }),
  param: (name: string, value: number | string) => call('param', { name, value }),
  undo: () => call('undo', {}),
  redo: () => call('redo', {}),
};

/** The update check and Update now (the server's /api/update routes; they work without the engine). */
async function updateCall(path: string, body?: unknown): Promise<UpdateInfo> {
  const r = await fetch(`/api/update${path}`, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `The server answered ${r.status}`);
  return j as UpdateInfo;
}
export const updates = {
  info: () => updateCall(''),
  settings: (patch: { check?: boolean; apply?: boolean; skipped?: string }) => updateCall('/settings', patch),
  check: () => updateCall('/check', {}),
  apply: (version: string) => updateCall('/apply', { version }),
};

