import type { Snapshot } from '../../server/src/engine/Engine';

export type { Snapshot, Body, Face, Parameter, TimelineItem, Sketch, SketchCurve, SketchPoint, SketchDimension, Profile, Vec2, Vec3 } from '../../server/src/engine/Engine';

async function call(path: string, body?: unknown): Promise<Snapshot> {
  const r = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `The server answered ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `The server answered ${r.status}`);
  return j as Snapshot;
}

export const api = {
  state: () => call('state'),
  demo: () => call('demo', {}),
  command: (command: string, params: Record<string, unknown>) => call('command', { command, params }),
  batch: (steps: { command: string; params?: Record<string, unknown> }[]) => call('batch', { steps }),
  param: (name: string, value: number | string) => call('param', { name, value }),
  undo: () => call('undo', {}),
  redo: () => call('redo', {}),
};
