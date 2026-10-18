import type { Snapshot } from '../../server/src/engine/Engine';

export type { Snapshot, Body, Face, Parameter, TimelineItem, Sketch, SketchCurve, SketchPoint, SketchDimension, Profile, Vec2, Vec3 } from '../../server/src/engine/Engine';

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

export const api = {
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
