// Forge server: runs the engine, answers this computer only, serves the built web app.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalRequest } from './access';
import { EngineError, type Engine, type ExportFormat } from './engine/Engine';
import { FileError, safeName } from './forgeFile';
import { BadRequest, checkStep } from './commands';
import { SolidCraftEngine } from './engine/solidcraft';
import { BadSetting, Updates } from './update';

// FORGE_ROOT is set by the Windows start file (the packaged app folder); from a checkout the root is two folders up
const root = process.env.FORGE_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.FORGE_PORT ?? 8120);
const exe = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
const ENGINE_PATH = process.env.FORGE_ENGINE ?? join(root, 'data', 'engine', exe);
// the Windows start file's launcher sets these (see scripts/windows/launcher.mjs): the Forge folder, and where settings live
const home = process.env.FORGE_HOME ?? root;
const dataDir = process.env.FORGE_DATA ?? join(root, 'data');

let engine: Engine | undefined;
let engineProblem = '';
async function startEngine() {
  if (!existsSync(ENGINE_PATH)) { engineProblem = `The modelling engine was not found at ${ENGINE_PATH}. See docs/PLAN.md ("Engine hand-over").`; return; }
  const e = new SolidCraftEngine(ENGINE_PATH, undefined, appVersion);
  try { await e.start(); engine = e; } catch (err) { engineProblem = String((err as Error).message); }
}

const MAX_BODY = 1_000_000;
const MAX_STEPS = 200;
const MAX_FILE = 512 * 1024 * 1024; // an uploaded .forge file
const MAX_IMPORT = 256 * 1024 * 1024; // an imported STEP or IGES file
const appVersion = (() => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string; } catch { return 'dev'; } })();
const updates = new Updates({
  home, dataDir, version: appVersion, launcher: process.env.FORGE_LAUNCHER === '1', releasesUrl: process.env.FORGE_UPDATE_URL || undefined, // (FORGE_UPDATE_URL is for the browser check)
  // the design lives in the running engine, so a restart must wait until it is saved
  busy: async () => { try { return engine && (await engine.snapshot()).doc.dirty ? 'the design has unsaved changes: save it first (File > Save)' : null; } catch { return null; } },
  exit: (code) => { const t = setTimeout(() => process.exit(code), 5000); t.unref(); void (engine?.stop() ?? Promise.resolve()).catch(() => {}).finally(() => process.exit(code)); },
});
const EXPORTS: Record<string, { format: ExportFormat; ext: string }> = { step: { format: 'step', ext: 'step' }, stl: { format: 'stl', ext: 'stl' }, stla: { format: 'stla', ext: 'stl' }, '3mf': { format: '3mf', ext: '3mf' }, obj: { format: 'obj', ext: 'obj' } };
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const send = (res: ServerResponse, code: number, v: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };
const readBody = (req: IncomingMessage) => new Promise<any>((ok, bad) => {
  let n = 0; const parts: Buffer[] = [];
  req.on('data', (d: Buffer) => { n += d.length; if (n > MAX_BODY) { bad(new BadRequest('Request too large')); req.destroy(); } else parts.push(d); });
  req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { bad(new BadRequest('Not JSON')); } });
  req.on('error', bad);
});

/** Read-only questions the browser may ask the engine. */
const QUERY_OK = new Set(['timeline.inspect', 'timeline.dependents', 'component.list']);

const readBytes = (req: IncomingMessage, max: number) => new Promise<Buffer>((ok, bad) => {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > max) { req.destroy(); return bad(new BadRequest('That file is too large')); }
  let n = 0; const parts: Buffer[] = [];
  req.on('data', (d: Buffer) => { n += d.length; if (n > max) { bad(new BadRequest('That file is too large')); req.destroy(); } else parts.push(d); });
  req.on('end', () => ok(Buffer.concat(parts)));
  req.on('error', bad);
});
const sendFile = (res: ServerResponse, bytes: Uint8Array, filename: string) => {
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length, 'x-forge-filename': encodeURIComponent(filename), 'cache-control': 'no-store', 'access-control-expose-headers': 'x-forge-filename' });
  res.end(Buffer.from(bytes));
};

async function api(path: string, req: IncomingMessage, res: ServerResponse) {
  if (path.startsWith('/api/update')) { // the update check and Update now do not need the engine
    if (path === '/api/update' && req.method !== 'POST') return send(res, 200, updates.view());
    if (req.method !== 'POST') throw new BadRequest('POST this');
    const a = await readBody(req);
    if (path === '/api/update/settings') return send(res, 200, updates.change(a));
    if (path === '/api/update/check') { await updates.checker.check(); return send(res, 200, updates.view()); }
    if (path === '/api/update/apply') {
      if (typeof a.version !== 'string') throw new BadRequest('Say which version to install');
      const refused = await updates.windows.apply(a.version);
      if (refused) return send(res, 409, { error: refused });
      return send(res, 200, updates.view());
    }
    return send(res, 404, { error: 'Unknown route' });
  }
  if (!engine) return send(res, 503, { error: engineProblem || 'The engine is not running' });
  const e = engine;
  if (path === '/api/open') { // the body is the bytes of a .forge file; ?name= is what to call the design
    if (req.method !== 'POST') throw new BadRequest('POST the file');
    const name = safeName(new URL(req.url ?? '/', 'http://localhost').searchParams.get('name'));
    await e.load(new Uint8Array(await readBytes(req, MAX_FILE)), name);
    return send(res, 200, await e.snapshot());
  }
  if (path === '/api/import') { // the body is the bytes of a STEP or IGES file; ?name= is the file's name (the new component is named after it)
    if (req.method !== 'POST') throw new BadRequest('POST the file');
    const q = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const ext = (q.get('ext') ?? '').toLowerCase();
    if (!['step', 'stp', 'iges', 'igs', 'stl', 'obj', '3mf'].includes(ext)) throw new BadRequest('Only STEP (.step, .stp), IGES (.iges, .igs), STL (.stl), OBJ (.obj) and 3MF (.3mf) files can be imported');
    if ((await e.snapshot()).sketches.some((k) => k.active)) throw new BadRequest('Finish the sketch first');
    const bytes = new Uint8Array(await readBytes(req, MAX_IMPORT));
    if (!bytes.length) throw new BadRequest('The file is empty');
    await e.importModel(bytes, ext as 'step' | 'stp' | 'iges' | 'igs' | 'stl' | 'obj' | '3mf', safeName(q.get('name'), 'Imported'));
    return send(res, 200, await e.snapshot());
  }
  const a = req.method === 'POST' ? await readBody(req) : {};
  if (path === '/api/save') { const name = safeName(a.name, (await e.snapshot()).doc.name); return sendFile(res, await e.save(name), `${name}.forge`); }
  if (path === '/api/export') {
    const snap = await e.snapshot(); const name = safeName(a.name, snap.doc.name);
    if (a.format === 'dxf' && a.section) { // a cut through a body for DemonX Design (the sketch made to do it is not kept)
      const s = a.section as { plane?: unknown; offset?: unknown; body?: unknown };
      if (s.plane !== 'XY' && s.plane !== 'XZ' && s.plane !== 'YZ') throw new BadRequest('Choose the plane to cut along: XY, XZ or YZ');
      if (typeof s.offset !== 'number' || !Number.isFinite(s.offset)) throw new BadRequest('Enter where to cut, as a number');
      if (typeof s.body !== 'string' || !snap.bodies.some((b) => b.name === s.body)) throw new BadRequest('Choose a body to cut');
      if (snap.sketches.some((k) => k.active)) throw new BadRequest('Finish the sketch first');
      return sendFile(res, await e.exportSectionDxf({ plane: s.plane, offset: s.offset, body: s.body }), `${name} section.dxf`);
    }
    if (a.format === 'dxf' && a.face) { // a flat face of a body: its outline for DemonX Design (the sketch made to do it is not kept)
      const f = a.face as { body?: unknown; index?: unknown; point?: unknown };
      const pt = Array.isArray(f.point) && f.point.length === 3 && f.point.every((v) => typeof v === 'number' && Number.isFinite(v)) ? (f.point as [number, number, number]) : null;
      if (typeof f.body !== 'string' || !Number.isInteger(f.index) || !pt) throw new BadRequest('Choose a flat face');
      if (!snap.bodies.some((b) => b.name === f.body)) throw new BadRequest('That body does not exist');
      if (snap.sketches.some((k) => k.active)) throw new BadRequest('Finish the sketch first');
      return sendFile(res, await e.exportFaceDxf({ body: f.body, index: f.index as number, point: pt }), `${name} face.dxf`);
    }
    if (a.format === 'dxf') {
      const sk = snap.sketches.find((k) => k.name === a.sketch);
      if (typeof a.sketch !== 'string' || !sk) throw new BadRequest('Choose a sketch to export');
      return sendFile(res, await e.exportSketchDxf(sk.name), `${name} ${sk.name}.dxf`);
    }
    const spec = typeof a.format === 'string' ? EXPORTS[a.format] : undefined;
    if (!spec) throw new BadRequest('Unknown export format');
    if (!snap.bodies.length) throw new BadRequest('There is nothing to export yet: make a body first');
    return sendFile(res, await e.exportBodies(spec.format), `${name}.${spec.ext}`);
  }
  if (path === '/api/mesh-convert') { // Mesh to Solid: a body name and a tolerance in millimetres
    if (typeof a.body !== 'string' || !a.body || a.body.length > 100) throw new BadRequest('Choose a mesh body');
    const tol = a.tolerance === undefined ? 0.05 : a.tolerance;
    if (typeof tol !== 'number' || !Number.isFinite(tol) || tol <= 0 || tol > 100) throw new BadRequest('The tolerance must be a number of millimetres above zero');
    if ((await e.snapshot()).sketches.some((k) => k.active)) throw new BadRequest('Finish the sketch first');
    const done = await e.convertMesh(a.body, tol);
    const snap = await e.snapshot();
    return send(res, 200, { ...snap, warnings: [...done.warnings, ...snap.warnings], method: done.method });
  }
  if (path === '/api/new') { await e.newDesign(); return send(res, 200, await e.snapshot()); }
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
      if (err instanceof BadRequest || err instanceof FileError || err instanceof BadSetting) return send(res, 400, { error: err.message });
      if (err instanceof EngineError) return send(res, 422, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Internal error' });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startEngine();
  updates.start();
  if (engineProblem) console.warn(engineProblem);
  makeServer().listen(PORT, '127.0.0.1', () => console.log(`DemonX Forge on http://127.0.0.1:${PORT}`));
  const bye = () => { engine?.stop().finally(() => process.exit(0)); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
