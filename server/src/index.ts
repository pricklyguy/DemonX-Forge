// Forge server: runs the engine, answers this computer only, serves the built web app.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalRequest } from './access';
import { EngineError, type Engine } from './engine/Engine';
import { BadRequest, checkStep } from './commands';
import { SolidCraftEngine } from './engine/solidcraft';

// FORGE_ROOT is set by the Windows start file (the packaged app folder); from a checkout the root is two folders up
const root = process.env.FORGE_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.FORGE_PORT ?? 8120);
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const ENGINE_PATH = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);

let engine: Engine | undefined;
let engineProblem = '';
async function startEngine() {
  if (!existsSync(ENGINE_PATH)) { engineProblem = `The modelling engine was not found at ${ENGINE_PATH}. See docs/PLAN.md ("Engine hand-over").`; return; }
  const e = new SolidCraftEngine(ENGINE_PATH);
  try { await e.start(); engine = e; } catch (err) { engineProblem = String((err as Error).message); }
}

const MAX_BODY = 1_000_000;
const MAX_STEPS = 200;
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const send = (res: ServerResponse, code: number, v: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };
const readBody = (req: IncomingMessage) => new Promise<any>((ok, bad) => {
  let n = 0; const parts: Buffer[] = [];
  req.on('data', (d: Buffer) => { n += d.length; if (n > MAX_BODY) { bad(new BadRequest('Request too large')); req.destroy(); } else parts.push(d); });
  req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { bad(new BadRequest('Not JSON')); } });
  req.on('error', bad);
});

/** Read-only questions the browser may ask the engine. */
const QUERY_OK = new Set(['timeline.inspect', 'timeline.dependents']);

async function api(path: string, req: IncomingMessage, res: ServerResponse) {
  if (!engine) return send(res, 503, { error: engineProblem || 'The engine is not running' });
  const e = engine;
  const a = req.method === 'POST' ? await readBody(req) : {};
  if (path === '/api/query') {
    if (typeof a.command !== 'string' || !QUERY_OK.has(a.command)) throw new BadRequest(`Not a question Forge can ask: ${String(a.command).slice(0, 60)}`);
    if (a.params !== undefined && (typeof a.params !== 'object' || a.params === null || Array.isArray(a.params))) throw new BadRequest('"params" must be an object');
    return send(res, 200, { result: await e.query(a.command, a.params) });
  }
  let warnings: string[] = [];
  switch (path) {
    case '/api/state': break;
    case '/api/demo': {
      const fixture = JSON.parse(readFileSync(join(root, 'server', 'fixtures', 'bracket.json'), 'utf8'));
      warnings = await e.run(fixture.commands.map(checkStep));
      break;
    }
    case '/api/command': warnings = await e.run([checkStep(a)]); break;
    case '/api/batch': {
      if (!Array.isArray(a.steps) || a.steps.length < 1 || a.steps.length > MAX_STEPS) throw new BadRequest(`"steps" must be a list of 1 to ${MAX_STEPS} commands`);
      warnings = await e.run(a.steps.map(checkStep));
      break;
    }
    case '/api/param': {
      if (typeof a.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(a.name)) throw new BadRequest('Bad parameter name');
      if (!(typeof a.value === 'number' && Number.isFinite(a.value)) && !(typeof a.value === 'string' && a.value.length <= 100)) throw new BadRequest('Bad parameter value');
      await e.setParameter(a.name, a.value);
      break;
    }
    case '/api/undo': await e.undo(); break;
    case '/api/redo': await e.redo(); break;
    default: return send(res, 404, { error: 'Unknown route' });
  }
  const snap = await e.snapshot();
  send(res, 200, { ...snap, warnings: [...warnings, ...snap.warnings] });
}

function serveStatic(pathname: string, res: ServerResponse) {
  const dist = join(root, 'web', 'dist');
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
  const file = join(dist, rel);
  if (!file.startsWith(dist) || !existsSync(file)) {
    if (!existsSync(join(dist, 'index.html'))) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('The web app is not built: run npm run build'); }
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

export function makeServer() {
  return createServer((req, res) => {
    if (!isLocalRequest(req)) { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('Forge answers only this computer'); }
    const u = new URL(req.url ?? '/', 'http://localhost');
    if (!u.pathname.startsWith('/api/')) return serveStatic(u.pathname, res);
    api(u.pathname, req, res).catch((err) => {
      if (res.headersSent) return;
      if (err instanceof BadRequest) return send(res, 400, { error: err.message });
      if (err instanceof EngineError) return send(res, 422, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Internal error' });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startEngine();
  if (engineProblem) console.warn(engineProblem);
  makeServer().listen(PORT, '127.0.0.1', () => console.log(`DemonX Forge on http://127.0.0.1:${PORT}`));
  const bye = () => { engine?.stop().finally(() => process.exit(0)); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
