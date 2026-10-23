/**
 * Exposes Forge's existing nine-tool MCP contract against the running native SolidCraft window.
 * Tool definitions and command validation are imported from the Forge server, so this prototype
 * does not maintain a second MCP schema or a broader modeling allowlist.
 */
import { connect } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createBridge, serve } from '../server/src/mcp';
import { checkStep, isAllowedCommand } from '../server/src/commands';

const configuredPort = Number(process.env.SOLIDCRAFT_CONTROL_PORT ?? process.env.FORGE_NATIVE_PORT ?? 0);
if (configuredPort !== 0 && (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535)) {
  throw new Error('SOLIDCRAFT_CONTROL_PORT must be a valid TCP port from 1 to 65535.');
}

function defaultControlDir() {
  if (process.env.SOLIDCRAFT_CONTROL_DIR) return process.env.SOLIDCRAFT_CONTROL_DIR;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'DemonX Forge', 'control');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'DemonX Forge', 'control');
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'demonx-forge', 'control');
}

type Endpoint = { port: number; token: string };
let endpoint: Endpoint | undefined;
const configuredToken = process.env.SOLIDCRAFT_CONTROL_TOKEN?.trim();

let id = 0;
function controlCall(target: Endpoint, method: string, params: Record<string, unknown> = {}, allowPaths?: string[], timeoutMs?: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = connect(target.port, '127.0.0.1');
    let text = '';
    let requestSent = false;
    const timeout = setTimeout(() => {
      socket.destroy();
      const error = new Error(`${method} timed out; inspect the native app before retrying.`) as Error & { requestSent?: boolean };
      error.requestSent = requestSent;
      reject(error);
    }, timeoutMs ?? (method === 'engine.batch' ? 3_600_000 : 90_000));
    socket.setEncoding('utf8');
    const scoped = allowPaths ? { ...params, allow_paths: allowPaths } : params;
    socket.once('connect', () => {
      requestSent = true;
      socket.write(`${JSON.stringify({ id: ++id, method, params: scoped, token: target.token })}\n`);
    });
    socket.on('data', (chunk) => {
      text += chunk;
      const end = text.indexOf('\n');
      if (end < 0) return;
      clearTimeout(timeout);
      socket.end();
      try {
        const reply = JSON.parse(text.slice(0, end));
        if (!reply.ok) {
          const error = new Error(reply.error ?? `${method} was refused`) as Error & { requestSent?: boolean };
          error.requestSent = true;
          reject(error);
        }
        else resolve(reply.result);
      } catch (error) {
        if (error instanceof Error && !('requestSent' in error)) (error as Error & { requestSent?: boolean }).requestSent = true;
        reject(error);
      }
    });
    socket.once('error', (cause) => {
      clearTimeout(timeout);
      const error = new Error(cause.message, { cause }) as Error & { requestSent?: boolean };
      error.requestSent = requestSent;
      reject(error);
    });
  });
}

function candidates(): Endpoint[] {
  if (configuredPort) {
    let token = configuredToken;
    if (!token) {
      try { token = readFileSync(join(defaultControlDir(), `${configuredPort}.token`), 'utf8').trim(); }
      catch { throw new Error(`The private control token for port ${configuredPort} was not found. Start Forge with --control ${configuredPort}, or remove SOLIDCRAFT_CONTROL_PORT to use automatic discovery.`); }
    }
    if (token.length < 32) throw new Error(`The private control token for port ${configuredPort} is missing or too short.`);
    return [{ port: configuredPort, token }];
  }
  const dir = defaultControlDir();
  let files: string[];
  try { files = readdirSync(dir).filter((name) => /^\d+\.token$/.test(name)); }
  catch { return []; }
  return files.map((name) => {
    const port = Number(name.slice(0, -6));
    try {
      const path = join(dir, name);
      if (statSync(path).size > 4096) return undefined;
      const token = readFileSync(path, 'utf8').trim();
      return Number.isInteger(port) && port > 0 && port <= 65535 && token.length >= 32 ? { port, token, mtime: statSync(path).mtimeMs } : undefined;
    } catch { return undefined; }
  }).filter((item): item is Endpoint & { mtime: number } => item !== undefined).sort((a, b) => b.mtime - a.mtime);
}

async function discoverEndpoint(): Promise<Endpoint> {
  const available = candidates();
  if (configuredPort && available.length) return available[0];
  for (const candidate of available) {
    try {
      await controlCall(candidate, 'control.running', {}, undefined, 5000);
      return candidate;
    } catch { /* Stale token files and closed listeners are skipped; the app removes them on exit. */ }
  }
  const expected = configuredPort ? `port ${configuredPort}` : `a private token in ${defaultControlDir()}`;
  throw new Error(`No running DemonX Forge control endpoint found (${expected}). Start DemonX Forge and retry. MCP will not scan arbitrary ports or read a token supplied by an MCP request.`);
}

async function native(method: string, params: Record<string, unknown> = {}, allowPaths?: string[]): Promise<any> {
  endpoint ??= await discoverEndpoint();
  try { return await controlCall(endpoint, method, params, allowPaths); }
  catch (error) {
    // Never replay a possibly-sent model mutation. Forget only the cached endpoint so the next
    // distinct MCP request can discover a restarted app.
    endpoint = undefined;
    throw error;
  }
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const badRequest = (message: string) => json({ error: message }, 400);
const queryCommands = new Set(['timeline.inspect', 'timeline.dependents', 'component.list']);
const MAX_BODY = 1_000_000;

async function snapshot() {
  const info = await native('document.inspect', { measure: true });
  const bodies = await Promise.all((info.bodies ?? []).map(async (body: any) => {
    const bbox = body.bbox;
    const positions: number[] = [];
    if (bbox?.min?.length === 3 && bbox?.max?.length === 3) {
      for (const x of [bbox.min[0], bbox.max[0]]) for (const y of [bbox.min[1], bbox.max[1]]) for (const z of [bbox.min[2], bbox.max[2]]) positions.push(x, y, z);
    }
    const mesh = (body.face_types?.mesh ?? 0) > 0;
    let topology = { faces: [] as any[], edges: [] as any[] };
    if (!mesh) {
      const [faces, edges] = await Promise.all([
        native('engine.execute', { command: 'model.faces', params: { body: body.name } }),
        native('engine.execute', { command: 'model.edges', params: { body: body.name } }),
      ]);
      topology = {
        faces: (faces.faces ?? []).map((face: any) => ({
          index: face.index, name: face.name, area: face.area, point: face.point ?? face.centroid,
          centroid: face.centroid, ...(face.plane_normal ? { planeNormal: face.plane_normal } : {}),
          ...(face.cylinder ? { cylinder: { origin: face.cylinder.origin, axis: face.cylinder.axis, radius: face.cylinder.radius } } : {}),
        })),
        edges: edges.edges ?? [],
      };
    }
    return { name: body.name, positions, indices: [], faceIds: [], faces: topology.faces, edges: topology.edges, mesh };
  }));
  const sketches = await Promise.all((info.sketches ?? []).map(async (sketch: any) => {
    const detail = await native('engine.execute', { command: 'sketch.inspect', params: { sketch: sketch.id } });
    const plane = detail.plane ?? {};
    return {
      id: detail.id,
      name: detail.name,
      active: info.active_sketch === sketch.id,
      visible: !!detail.visible,
      plane: { origin: plane.origin ?? [0, 0, 0], xDir: plane.x_dir ?? plane.xDir ?? [1, 0, 0], yDir: plane.y_dir ?? plane.yDir ?? [0, 1, 0] },
      curves: (detail.curves ?? []).map((curve: any) => ({
        id: String(curve.id),
        type: ['line', 'circle', 'arc'].includes(curve.type) ? curve.type : 'other',
        construction: !!curve.construction,
        fullyConstrained: !!curve.fully_constrained,
        ...(curve.start_at ? { start: curve.start_at } : {}),
        ...(curve.end_at ? { end: curve.end_at } : {}),
        ...(curve.center_at ? { center: curve.center_at } : {}),
        ...(typeof curve.radius === 'number' ? { radius: curve.radius } : {}),
        ...(typeof curve.start === 'string' ? { startId: curve.start } : {}),
        ...(typeof curve.end === 'string' ? { endId: curve.end } : {}),
        ...(typeof curve.center === 'string' ? { centerId: curve.center } : {}),
      })),
      profiles: (detail.profiles ?? []).map((profile: any) => ({
        index: profile.index, area: profile.area_mm2, centroid: profile.centroid_sketch, curves: profile.curves, holes: profile.holes,
      })),
    };
  }));
  return {
    doc: { name: info.name ?? 'Untitled', dirty: !!info.dirty },
    bodies,
    parameters: (info.params ?? []).filter((parameter: any) => !parameter.model).map((parameter: any) => ({
      name: parameter.name, expression: String(parameter.expression ?? ''), value: Number(parameter.value), unit: String(parameter.unit ?? ''),
    })),
    timeline: (info.timeline ?? []).map((item: any) => ({ id: item.id, name: item.name, type: item.type, suppressed: !!item.suppressed, error: item.error ?? null })),
    marker: info.marker ?? (info.timeline ?? []).length,
    stamp: String(info.revision ?? 0),
    sketches,
    ms: 0,
    warnings: [],
  };
}

async function fetchNative(url: string | URL | Request, init: RequestInit = {}) {
  const path = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).pathname;
  if (init.body !== undefined && Buffer.byteLength(String(init.body), 'utf8') > MAX_BODY) return json({ error: 'Request too large' }, 413);
  const request = init.body ? JSON.parse(String(init.body)) : {};
  try {
    switch (path) {
      case '/api/state': return json(await snapshot());
      case '/api/stamp': return json({ stamp: String((await native('document.inspect')).revision ?? 0) });
      case '/api/commands': {
        const query = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).searchParams.get('filter') ?? '';
        if (query.length > 60) return badRequest('"filter" must be a short piece of text');
        const commands = await native('engine.commands');
        const filter = query.toLowerCase();
        return json({ commands: commands.filter((command: any) => isAllowedCommand(command.id)
          && (!filter || `${command.id} ${command.label}`.toLowerCase().includes(filter))) });
      }
      case '/api/batch': {
        if (!Array.isArray(request.steps) || request.steps.length < 1 || request.steps.length > 200) return badRequest('"steps" must be a list of 1 to 200 commands');
        let steps;
        try { steps = request.steps.map(checkStep); } catch (error) { return badRequest((error as Error).message); }
        const result = await native('engine.batch', { commands: steps, rollback: true });
        if (result.failed) {
          const message = `Step ${Number(result.failed.index) + 1} (${result.failed.command}): ${result.failed.error}${result.rolled_back ? '. Nothing was changed.' : ''}`;
          return json({ error: message }, 422);
        }
        return json(await snapshot());
      }
      case '/api/query': {
        if (typeof request.command !== 'string' || !queryCommands.has(request.command)) return badRequest(`Not a question Forge can ask: ${String(request.command).slice(0, 60)}`);
        if (request.params !== undefined && (!request.params || typeof request.params !== 'object' || Array.isArray(request.params))) return badRequest('"params" must be an object');
        const result = await native('engine.execute', { command: request.command, params: request.params ?? {} });
        return json({ result });
      }
      case '/api/measure': {
        if (request.body !== undefined && (typeof request.body !== 'string' || request.body.length > 100)) return badRequest('"body" must be a body name');
        return json({ measure: await native('engine.execute', { command: 'inspect.measure', params: request.body ? { bodies: [request.body] } : {} }) });
      }
      case '/api/screenshot': {
        const width = request.width;
        const height = request.height;
        for (const [value, name] of [[width, 'width'], [height, 'height']] as const) {
          if (value !== undefined && (!Number.isInteger(value) || value < 100 || value > 2000)) return badRequest(`"${name}" must be a whole number of pixels from 100 to 2000`);
        }
        if (request.view !== undefined && (typeof request.view !== 'string' || !/^[A-Za-z0-9 _-]{1,40}$/.test(request.view))) return badRequest('"view" must be a short view name');
        const dir = mkdtempSync(join(tmpdir(), 'demonx-forge-mcp-shot-'));
        const path = join(dir, 'view.png');
        try {
          if (typeof request.view === 'string') await native('ui.view', { view: request.view });
          await native('ui.render', { path, width: width ?? 1280, height: height ?? 800 }, [dir]);
          return new Response(readFileSync(path), { status: 200, headers: { 'content-type': 'image/png' } });
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      case '/api/param': {
        if (typeof request.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(request.name)) return badRequest('Bad parameter name');
        if (!(typeof request.value === 'number' && Number.isFinite(request.value)) && !(typeof request.value === 'string' && request.value.length <= 100)) return badRequest('Bad parameter value');
        await native('engine.execute', { command: 'parameters.change', params: { name: request.name, expression: request.value } });
        return json(await snapshot());
      }
      case '/api/undo':
        await native('engine.execute', { command: 'edit.undo' });
        return json(await snapshot());
      case '/api/redo':
        await native('engine.execute', { command: 'edit.redo' });
        return json(await snapshot());
      default: return json({ error: 'Unknown route' }, 404);
    }
  } catch (error) {
    return json({ error: (error as Error).message }, 422);
  }
}

serve(createBridge({ fetch: fetchNative }));
