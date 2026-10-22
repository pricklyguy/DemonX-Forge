import { describe, expect, it } from 'vitest';
import { TOOLS, createBridge, summarize } from '../src/mcp';

/** A stand-in for the Forge server: records what was asked, answers from a table. */
function fake(answers: Record<string, unknown | ((body: any) => unknown)>) {
  const calls: { path: string; body: any }[] = [];
  const f = (async (url: string, init?: { method?: string; body?: string }) => {
    const path = new URL(url).pathname + new URL(url).search;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    const a = answers[path] ?? answers[new URL(url).pathname];
    if (a === undefined) return new Response(JSON.stringify({ error: 'Unknown route' }), { status: 404 });
    const v = typeof a === 'function' ? (a as (b: unknown) => unknown)(body) : a;
    if (v instanceof Uint8Array) return new Response(v as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } });
    if (v && typeof v === 'object' && 'status' in (v as object)) return new Response(JSON.stringify((v as { body: unknown }).body), { status: (v as { status: number }).status });
    return new Response(JSON.stringify(v), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const body = { name: 'Body1', mesh: false, positions: [0, 0, 0, 40, 30, 10], indices: [], faceIds: [], faces: [{ index: 0, name: 'top', area: 1200.0004, point: [20, 15, 10], centroid: [20, 15, 10], planeNormal: [0, 0, 1] }], edges: [{ index: 0, name: 'e', mid: [20, 0, 10], start: [0, 0, 10], end: [40, 0, 10], length: 40 }] };
const state = { doc: { name: 'Untitled', dirty: true }, bodies: [body], parameters: [], timeline: [{ id: 1, name: 'Sketch1', type: 'Sketch', suppressed: false, error: null }], marker: 1, stamp: 'a', sketches: [], ms: 5, warnings: [] };

describe('the MCP bridge', () => {
  it('starts a session: the protocol version it supports (the client\'s own when it is one), its tools, no reply to a notification', async () => {
    const { f } = fake({});
    const b = createBridge({ base: 'http://forge.test', fetch: f, version: '9.9.9' });
    const init: any = await b.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    expect(init.result.protocolVersion).toBe('2024-11-05');
    expect(init.result.serverInfo).toMatchObject({ name: 'demonx-forge', version: '9.9.9' });
    expect(init.result.capabilities).toEqual({ tools: {} });
    expect(((await b.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })) as any).result.protocolVersion).toBe('2025-06-18');
    expect(await b.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const list: any = await b.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
    for (const t of list.result.tools) { expect(t.description.length).toBeGreaterThan(20); expect(t.inputSchema.type).toBe('object'); }
    expect(((await b.handle({ jsonrpc: '2.0', id: 4, method: 'ping' })) as any).result).toEqual({});
    expect(((await b.handle({ jsonrpc: '2.0', id: 5, method: 'nope' })) as any).error.code).toBe(-32601);
  });

  it('keeps the established tool names and their client-facing argument contracts', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'forge_get_design', 'forge_list_commands', 'forge_run_commands', 'forge_query',
      'forge_measure', 'forge_screenshot', 'forge_set_parameter', 'forge_undo', 'forge_redo',
    ]);
    const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t.inputSchema]));
    expect(byName.forge_run_commands).toMatchObject({
      required: ['steps'], properties: { steps: { type: 'array', minItems: 1, maxItems: 200 } },
    });
    expect(byName.forge_query).toMatchObject({
      required: ['command'], properties: { command: { enum: ['timeline.inspect', 'timeline.dependents', 'component.list'] } },
    });
    expect(byName.forge_screenshot).toMatchObject({
      properties: { width: { minimum: 100, maximum: 2000 }, height: { minimum: 100, maximum: 2000 } },
    });
    expect(byName.forge_set_parameter).toMatchObject({ required: ['name', 'value'] });
  });

  it('reads the design without the triangle lists, and lists faces and edges only when asked', async () => {
    const { f } = fake({ '/api/state': state });
    const b = createBridge({ base: 'http://forge.test', fetch: f });
    const s: any = JSON.parse(((await b.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forge_get_design', arguments: {} } })) as any).result.content[0].text);
    expect(s.bodies[0]).toMatchObject({ name: 'Body1', kind: 'solid', boundingBox: { min: [0, 0, 0], max: [40, 30, 10] }, faceCount: 1, edgeCount: 1 });
    expect(s.bodies[0].faces).toBeUndefined();
    const full: any = JSON.parse(((await b.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'forge_get_design', arguments: { detail: 'full' } } })) as any).result.content[0].text);
    expect(full.bodies[0].faces[0]).toMatchObject({ index: 0, area: 1200, pointOnFace: [20, 15, 10], planeNormal: [0, 0, 1] });
    expect(full.bodies[0].edges[0]).toMatchObject({ index: 0, length: 40 });
    expect(JSON.stringify(s)).not.toContain('positions');
  });

  it('runs commands as one batch and says what the design is afterwards; a refusal comes back as a tool error with the reason', async () => {
    const { f, calls } = fake({ '/api/batch': (b: any) => (b.steps[0].command === 'bad.command' ? { status: 400, body: { error: 'Command not allowed: bad.command' } } : state) });
    const bridge = createBridge({ base: 'http://forge.test', fetch: f });
    const steps = [{ command: 'solid.box', params: { length: 40, width: 30, height: 10 } }];
    const ok: any = await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forge_run_commands', arguments: { steps } } });
    expect(ok.result.isError).toBeUndefined();
    expect(calls[0]).toEqual({ path: '/api/batch', body: { steps } });
    const bad: any = await bridge.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'forge_run_commands', arguments: { steps: [{ command: 'bad.command' }] } } });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toBe('Command not allowed: bad.command');
  });

  it('passes the other tools on to the right routes', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const { f, calls } = fake({ '/api/commands?filter=fillet': { commands: [{ id: 'solid.fillet', label: 'Fillet', params: 'edges, radius', enabled: true }] }, '/api/query': { result: { a: 1 } }, '/api/measure': { measure: { bodies: [{ volume_mm3: 12000 }] } }, '/api/screenshot': png, '/api/param': state, '/api/undo': state, '/api/redo': state });
    const b = createBridge({ base: 'http://forge.test', fetch: f });
    const run = async (name: string, args: object) => ((await b.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as any).result;
    expect(JSON.parse((await run('forge_list_commands', { filter: 'fillet' })).content[0].text)[0].id).toBe('solid.fillet');
    expect(JSON.parse((await run('forge_query', { command: 'timeline.inspect', params: { feature: 1 } })).content[0].text)).toEqual({ a: 1 });
    expect(JSON.parse((await run('forge_measure', { body: 'Body1' })).content[0].text)).toEqual({ bodies: [{ volume_mm3: 12000 }] });
    const shot = await run('forge_screenshot', { view: 'top', width: 400 });
    expect(shot.content[0]).toEqual({ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' });
    await run('forge_set_parameter', { name: 'width', value: 50 }); await run('forge_undo', {}); await run('forge_redo', {});
    expect(calls.map((c) => c.path)).toEqual(['/api/commands?filter=fillet', '/api/query', '/api/measure', '/api/screenshot', '/api/param', '/api/undo', '/api/redo']);
    expect(calls[3]!.body).toEqual({ view: 'top', width: 400 });
  });

  it('says plainly when Forge is not running, and about a tool that does not exist', async () => {
    const b = createBridge({ base: 'http://forge.test', fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    const r: any = await b.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forge_get_design', arguments: {} } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/Forge is not running at http:\/\/forge\.test.*Start DemonX Forge/s);
    expect(((await b.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'file_delete', arguments: {} } })) as any).error.code).toBe(-32602);
  });

  it('never offers a way to open, save, export or delete files', () => {
    for (const t of TOOLS) expect(t.name).not.toMatch(/open|save|export|import|file|delete|new/);
  });

  it('keeps MCP file access behind the Forge server policy', async () => {
    const { f, calls } = fake({ '/api/batch': { status: 400, body: { error: 'Command not allowed: file.open' } } });
    const b = createBridge({ base: 'http://forge.test', fetch: f });
    const r: any = await b.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forge_run_commands', arguments: { steps: [{ command: 'file.open', params: { path: 'C:/private/design.step' } }] } } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toBe('Command not allowed: file.open');
    expect(calls.map((c) => c.path)).toEqual(['/api/batch']);
  });
});

describe('summarize', () => {
  it('marks a mesh body so the AI knows it has no real faces yet', () => {
    expect((summarize({ ...state, bodies: [{ ...body, mesh: true }] }).bodies as { kind: string }[])[0]!.kind).toMatch(/^mesh/);
  });
});
