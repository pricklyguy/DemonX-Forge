// The DemonX Forge MCP server: lets an AI client (Claude, Codex, anything that speaks the Model Context Protocol over standard input and
// output) look at and change the design that is open in Forge. It is a thin bridge: every tool is one call to the running Forge server
// (http://127.0.0.1:8120 by default), which keeps its own rules (only this computer; only the modelling commands, never file commands).
// No packages: the protocol is JSON-RPC, one message per line.
//
//   node mcp.mjs                       (in the Windows package: node.exe launcher.mjs mcp)
//   FORGE_URL=http://127.0.0.1:8120    where Forge is
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const BASE = (process.env.FORGE_URL ?? `http://127.0.0.1:${process.env.FORGE_PORT ?? 8120}`).replace(/\/+$/, '');

type Json = Record<string, unknown>;
export interface Bridge { handle(msg: Json): Promise<Json | null> }
export interface BridgeOptions { base?: string; fetch?: typeof fetch; version?: string }

const obj = (properties: Json, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const stepSchema = { type: 'object', properties: { command: { type: 'string', description: 'A command id such as sketch.create or solid.extrude (see forge_list_commands)' }, params: { type: 'object', description: 'The command\'s parameters' } }, required: ['command'] };

export const TOOLS = [
  { name: 'forge_get_design', description: 'What is in the open design: bodies (size, volume figures, face and edge counts), sketches, the timeline, parameters. All lengths are millimetres, Z is up. With detail "full" every body also lists its faces (index, area, a point on it, plane normal or cylinder) and edges (index, middle, length), which commands like solid.fillet and solid.hole refer to, and every sketch lists its curves.',
    inputSchema: obj({ detail: { type: 'string', enum: ['summary', 'full'], description: 'summary (default) or full' } }) },
  { name: 'forge_list_commands', description: 'The modelling commands you may run with forge_run_commands: id, label, one-line parameter text. Give a filter (for example "fillet", "sketch", "extrude") to keep the answer short; without one it lists every command.',
    inputSchema: obj({ filter: { type: 'string', description: 'Part of a command id or label' } }) },
  { name: 'forge_run_commands', description: 'Run modelling commands in order, as one batch: if one fails, none of them are kept and the reason is returned. Typical: sketch.create (plane XY, XZ or YZ), sketch.rectangle.two_point, sketch.circle.center, sketch.finish, solid.extrude, solid.fillet, solid.hole. The reply is the design afterwards (summary). The person sees the result in their window within a couple of seconds, and can press Ctrl+Z to take it back.',
    inputSchema: obj({ steps: { type: 'array', items: stepSchema, minItems: 1, maxItems: 200, description: 'The commands to run' }, single_undo: { type: 'boolean', description: 'Run as a version 1 Forge script with validated permissions, full rollback, visible progress, and one undo step on success' }, script_name: { type: 'string', minLength: 1, maxLength: 120, description: 'Optional name used by the native Scripts & Add-Ins runner when single_undo is true' } }, ['steps']) },
  { name: 'forge_query', description: 'Read something without changing the design: timeline.inspect {feature} (a feature\'s definition), timeline.dependents {feature} (what depends on it), component.list.',
    inputSchema: obj({ command: { type: 'string', enum: ['timeline.inspect', 'timeline.dependents', 'component.list'] }, params: { type: 'object' } }, ['command']) },
  { name: 'forge_measure', description: 'Volume (mm³), surface area, centre of mass and bounding box of one body, or of all bodies.',
    inputSchema: obj({ body: { type: 'string', description: 'A body name (default: all)' } }) },
  { name: 'forge_screenshot', description: 'A picture of the design (PNG): use it to check what you built.',
    inputSchema: obj({ view: { type: 'string', description: 'iso (default), home, front, back, top, bottom, left, right or fit' }, width: { type: 'integer', minimum: 100, maximum: 2000 }, height: { type: 'integer', minimum: 100, maximum: 2000 } }) },
  { name: 'forge_set_parameter', description: 'Change a user parameter (a named value the design uses, such as width) by name; the parts built from it follow.',
    inputSchema: obj({ name: { type: 'string' }, value: { description: 'A number (millimetres) or an expression such as "2 * width"' } }, ['name', 'value']) },
  { name: 'forge_undo', description: 'Undo the last change to the design.', inputSchema: obj({}) },
  { name: 'forge_redo', description: 'Redo the last undone change.', inputSchema: obj({}) },
];

/** The design without the heavy numbers (triangle lists), for an AI to read. */
export function summarize(s: any, detail: 'summary' | 'full' = 'summary'): Json {
  const bbox = (pos: number[]) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3]!, pos[i]!); hi[i % 3] = Math.max(hi[i % 3]!, pos[i]!); } return Number.isFinite(lo[0]!) ? { min: lo.map((v) => Math.round(v * 1000) / 1000), max: hi.map((v) => Math.round(v * 1000) / 1000) } : null; };
  const r3 = (n: number) => Math.round(n * 1000) / 1000, v3 = (v: number[]) => v.map(r3);
  return {
    document: s.doc,
    bodies: (s.bodies ?? []).map((b: any) => ({
      name: b.name, kind: b.mesh ? 'mesh (a skin of triangles: Mesh to Solid in the app makes it a solid)' : 'solid', boundingBox: bbox(b.positions ?? []), faceCount: b.faces?.length ?? 0, edgeCount: b.edges?.length ?? 0,
      ...(detail === 'full' ? {
        faces: (b.faces ?? []).map((f: any) => ({ index: f.index, name: f.name, area: r3(f.area), pointOnFace: v3(f.point), ...(f.planeNormal ? { planeNormal: v3(f.planeNormal) } : {}), ...(f.cylinder ? { cylinder: { axisPoint: v3(f.cylinder.origin), axis: v3(f.cylinder.axis), radius: r3(f.cylinder.radius) } } : {}) })),
        edges: (b.edges ?? []).map((e: any) => ({ index: e.index, name: e.name, middle: v3(e.mid), length: r3(e.length) })),
      } : {}),
    })),
    sketches: (s.sketches ?? []).map((k: any) => ({ name: k.name, id: k.id, active: !!k.active, plane: k.plane, curveCount: k.curves?.length ?? 0, profileCount: k.profiles?.length ?? 0, ...(detail === 'full' ? { curves: (k.curves ?? []).map((c: any) => ({ id: c.id, type: c.type, construction: !!c.construction, ...(c.start ? { start: c.start } : {}), ...(c.end ? { end: c.end } : {}), ...(c.center ? { center: c.center } : {}), ...(c.radius !== undefined ? { radius: c.radius } : {}) })) } : {}) })),
    timeline: s.timeline, rolledBackAfter: s.marker, parameters: s.parameters, warnings: s.warnings,
  };
}

const text = (v: unknown) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const failure = (m: string) => ({ isError: true, content: [{ type: 'text', text: m }] });

export function createBridge(o: BridgeOptions = {}): Bridge {
  const base = (o.base ?? BASE).replace(/\/+$/, ''), f = o.fetch ?? fetch;
  async function forge(path: string, body?: unknown): Promise<{ ok: boolean; status: number; res: Response }> {
    try { const res = await f(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) }); return { ok: res.ok, status: res.status, res }; }
    catch { throw new Error(`Forge is not running at ${base}. Start it (in the Windows package: "Start DemonX Forge.bat") and try again.`); }
  }
  async function json(path: string, body?: unknown): Promise<any> {
    const { ok, status, res } = await forge(path, body);
    const j = await res.json().catch(() => ({ error: `Forge answered ${status}` }));
    if (!ok) throw new Error(j.error ?? `Forge answered ${status}`);
    return j;
  }

  async function call(name: string, a: Json): Promise<Json> {
    switch (name) {
      case 'forge_get_design': return text(summarize(await json('/api/state'), a.detail === 'full' ? 'full' : 'summary'));
      case 'forge_list_commands': return text((await json(`/api/commands${typeof a.filter === 'string' && a.filter ? `?filter=${encodeURIComponent(a.filter)}` : ''}`)).commands);
      case 'forge_run_commands': {
        const batch: Json = { steps: a.steps };
        if (a.single_undo === true) {
          batch.single_undo = true;
          if (typeof a.script_name === 'string') batch.script_name = a.script_name;
        }
        const s = await json('/api/batch', batch);
        return text(summarize(s));
      }
      case 'forge_query': return text((await json('/api/query', { command: a.command, params: a.params ?? {} })).result);
      case 'forge_measure': return text((await json('/api/measure', { body: a.body })).measure);
      case 'forge_screenshot': {
        const { ok, status, res } = await forge('/api/screenshot', { view: a.view, width: a.width, height: a.height });
        if (!ok) { const j = await res.json().catch(() => ({ error: `Forge answered ${status}` })); throw new Error(j.error ?? `Forge answered ${status}`); }
        return { content: [{ type: 'image', data: Buffer.from(await res.arrayBuffer()).toString('base64'), mimeType: 'image/png' }] };
      }
      case 'forge_set_parameter': return text(summarize(await json('/api/param', { name: a.name, value: a.value })));
      case 'forge_undo': return text(summarize(await json('/api/undo', {})));
      case 'forge_redo': return text(summarize(await json('/api/redo', {})));
      default: return failure(`There is no tool called ${name}`);
    }
  }

  return {
    async handle(msg) {
      const id = msg.id as string | number | undefined, method = msg.method as string | undefined, params = (msg.params ?? {}) as Json;
      const reply = (result: Json) => ({ jsonrpc: '2.0', id: id!, result });
      const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
      if (method === undefined) return null; // a response to something we never asked
      if (id === undefined) return null; // a notification (initialized, cancelled ...): nothing to answer
      switch (method) {
        case 'initialize': { const want = String(params.protocolVersion ?? ''); return reply({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0]!, capabilities: { tools: {} }, serverInfo: { name: 'demonx-forge', title: 'DemonX Forge', version: o.version ?? '1' }, instructions: 'Controls the design open in DemonX Forge (a parametric CAD program). Lengths are millimetres, Z is up. Start with forge_get_design, use forge_list_commands to find command parameters, build with forge_run_commands, check with forge_screenshot.' }); }
        case 'ping': return reply({});
        case 'tools/list': return reply({ tools: TOOLS });
        case 'tools/call': {
          const name = String(params.name ?? ''), a = (params.arguments ?? {}) as Json;
          if (!TOOLS.some((t) => t.name === name)) return error(-32602, `Unknown tool: ${name.slice(0, 60)}`);
          try { return reply(await call(name, a)); } catch (e) { return reply(failure((e as Error).message)); }
        }
        default: return error(-32601, `Method not found: ${String(method).slice(0, 60)}`);
      }
    },
  };
}

/** Read messages (one JSON object per line) from standard input, answer on standard output. */
export function serve(bridge: Bridge) {
  const rl = createInterface({ input: process.stdin });
  const pending = new Set<Promise<void>>();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    const p = (async () => {
      let msg: Json;
      try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
      const out = await bridge.handle(msg);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    })().finally(() => pending.delete(p));
    pending.add(p);
  });
  rl.on('close', () => { void Promise.all(pending).then(() => process.exit(0)); });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve(createBridge({ version: process.env.FORGE_VERSION }));
