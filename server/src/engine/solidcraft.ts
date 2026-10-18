// The Engine implementation that drives SolidCraft's headless CLI (`solidcraft-cli mcp`, MIT OR Apache-2.0) over stdio.
// This is the only file that knows SolidCraft's tool and command names.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileError, packForge, unpackForge } from '../forgeFile';
import { EngineError, type Body, type CommandStep, type ExportFormat, type Engine, type Face, type Parameter, type Sketch, type Snapshot, type TimelineItem, type Vec2, type Vec3 } from './Engine';
import { parse3mf } from './mesh3mf';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class SolidCraftEngine implements Engine {
  private proc?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private buf = '';
  private pending = new Map<number, Pending>();
  private work = '';
  private specs = new Map<string, string | null>();
  private queue: Promise<unknown> = Promise.resolve();
  private docName = 'Untitled';
  private fileNo = 0;

  constructor(private readonly binary: string, private readonly timeoutMs = 120_000, private readonly appVersion = 'dev') {}

  async start(): Promise<void> {
    this.work = mkdtempSync(join(tmpdir(), 'forge-engine-'));
    this.proc = spawn(this.binary, ['mcp', '--allow-path', this.work], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stderr.on('data', () => {}); // its notices are not errors; failures come back as replies
    this.proc.on('error', (e) => this.failAll(new EngineError(`Could not start the engine (${this.binary}): ${e.message}`)));
    this.proc.on('exit', (code) => this.failAll(new EngineError(`The engine stopped (exit ${code})`)));
    this.proc.stdout.on('data', (d) => this.onData(String(d)));
    await this.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'demonx-forge', version: '0.1.0' } });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }

  async stop(): Promise<void> {
    this.proc?.removeAllListeners('exit');
    this.proc?.kill();
    this.proc = undefined;
    if (this.work) rmSync(this.work, { recursive: true, force: true });
  }

  /** One engine, one request at a time: callers are queued so replies never interleave with half-done edits. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let m: any;
      try { m = JSON.parse(line); } catch { continue; }
      const p = this.pending.get(m.id);
      if (!p) continue;
      this.pending.delete(m.id);
      m.error ? p.reject(new EngineError(String(m.error.message ?? JSON.stringify(m.error)))) : p.resolve(m.result);
    }
  }

  private failAll(e: Error) {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }

  private rpc(method: string, params: unknown): Promise<any> {
    const proc = this.proc;
    if (!proc) return Promise.reject(new EngineError('The engine is not running'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new EngineError(`The engine did not answer ${method} in time`)); }, this.timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  private async tool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const r = await this.rpc('tools/call', { name, arguments: args });
    const text: string = r?.content?.find((c: any) => c.type === 'text')?.text ?? '';
    if (r?.isError) throw new EngineError(errorText(text));
    try { return JSON.parse(text); } catch { return text; }
  }

  /** The engine ignores parameters it does not know. Look the command's parameter text up and say so ourselves. */
  private async unknownParams(step: CommandStep): Promise<string[]> {
    if (!this.specs.has(step.command)) {
      const list = await this.tool('list_commands', { filter: step.command });
      const hit = Array.isArray(list) ? list.find((c: any) => c.id === step.command) : undefined;
      this.specs.set(step.command, hit ? String(hit.params ?? '') : null);
    }
    const spec = this.specs.get(step.command);
    if (spec == null) throw new EngineError(`There is no command "${step.command}"`);
    return unknownParamNames(spec, Object.keys(step.params ?? {})).map((k) => `${step.command}: the engine has no parameter "${k}" and would ignore it`);
  }

  run(steps: CommandStep[]): Promise<string[]> {
    return this.serial(async () => {
      const warnings: string[] = [];
      for (const s of steps) warnings.push(...(await this.unknownParams(s)));
      await this.tool('batch', { commands: steps.map((s) => ({ command: s.command, params: s.params ?? {} })), rollback: true, verbose: false });
      return warnings;
    });
  }

  setParameter(name: string, value: string | number): Promise<void> {
    return this.serial(async () => { await this.tool('set_parameter', { name, value }); });
  }
  query(command: string, params: Record<string, unknown> = {}): Promise<unknown> { return this.serial(() => this.tool('execute', { command, params })); }
  private tmp(ext: string) { return join(this.work, `f${++this.fileNo}.${ext}`); }

  save(name: string): Promise<Uint8Array> {
    return this.serial(async () => {
      const path = this.tmp('solidcraft');
      try {
        await this.tool('save', { path });
        this.docName = name;
        return packForge(new Uint8Array(readFileSync(path)), this.appVersion);
      } finally { rmSync(path, { force: true }); }
    });
  }

  load(bytes: Uint8Array, name: string): Promise<void> {
    return this.serial(async () => {
      const { design } = unpackForge(bytes); // throws FileError before the design is touched
      const path = this.tmp('solidcraft');
      try {
        writeFileSync(path, design);
        try { await this.tool('open', { path }); } catch (e) { throw new FileError(`The design inside this file could not be opened: ${(e as Error).message}`); }
        this.docName = name;
      } finally { rmSync(path, { force: true }); }
    });
  }

  newDesign(): Promise<void> { return this.serial(async () => { await this.tool('new_design', {}); this.docName = 'Untitled'; }); }

  exportBodies(format: ExportFormat): Promise<Uint8Array> {
    return this.serial(async () => {
      const path = this.tmp(format === 'stla' ? 'stl' : format);
      try { await this.tool('export', { path, format }); return new Uint8Array(readFileSync(path)); } finally { rmSync(path, { force: true }); }
    });
  }

  exportSketchDxf(sketch: string): Promise<Uint8Array> {
    return this.serial(async () => {
      const path = this.tmp('dxf');
      try { await this.tool('execute', { command: 'sketch.export_dxf', params: { sketch, path } }); return new Uint8Array(readFileSync(path)); } finally { rmSync(path, { force: true }); }
    });
  }

  undo(): Promise<void> { return this.serial(async () => { await this.tool('undo'); }); }
  redo(): Promise<void> { return this.serial(async () => { await this.tool('redo'); }); }

  snapshot(): Promise<Snapshot> {
    return this.serial(async () => {
      const t0 = performance.now();
      const info = await this.tool('inspect_design');
      const names: string[] = (info?.bodies ?? []).map((b: any) => String(b.name));
      const parameters: Parameter[] = (info?.params ?? []).filter((p: any) => !p.model).map((p: any) => ({ name: String(p.name), expression: String(p.expression ?? ''), value: Number(p.value), unit: String(p.unit ?? '') }));
      const timeline: TimelineItem[] = (info?.timeline ?? []).map((t: any) => ({ id: Number(t.id), name: String(t.name), type: String(t.type), suppressed: !!t.suppressed, error: t.error ? String(t.error) : null }));
      const sketches: Sketch[] = (info?.sketches ?? []).map((k: any) => toSketch(k, info?.active_sketch));
      const marker = Number(info?.marker ?? timeline.length);
      const doc = { name: this.docName, dirty: !!info?.dirty };
      if (!names.length) return { doc, bodies: [], parameters, timeline, marker, sketches, ms: Math.round(performance.now() - t0), warnings: [] };
      const path = join(this.work, `mesh-${this.nextId}.3mf`);
      await this.tool('export', { path, format: '3mf-tagged' });
      const meshes = parse3mf(new Uint8Array(readFileSync(path)));
      const bodies: Body[] = [];
      for (const m of meshes) {
        const topo = await this.tool('body_topology', { body: m.name });
        bodies.push({ ...m, faces: (topo?.faces ?? []).map(toFace) });
      }
      return { doc, bodies, parameters, timeline, marker, sketches, ms: Math.round(performance.now() - t0), warnings: [] };
    });
  }
}

/** Names in `keys` that never occur as a word in the command's parameter text. Exported for tests. */
export function unknownParamNames(spec: string, keys: string[]): string[] {
  const words = new Set(spec.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  return keys.filter((k) => !words.has(k));
}

function toFace(f: any): Face {
  return {
    index: Number(f.index), name: String(f.name ?? ''), area: Number(f.area ?? 0),
    point: v3(f.point), centroid: v3(f.centroid),
    ...(f.plane_normal ? { planeNormal: v3(f.plane_normal) } : {}),
    ...(f.cylinder ? { cylinder: { origin: v3(f.cylinder.origin), axis: v3(f.cylinder.axis), radius: Number(f.cylinder.radius) } } : {}),
  };
}

/** A failed batch comes back as JSON ({failed: {index, command, error}}); turn it into a sentence. */
export function errorText(text: string): string {
  try {
    const j = JSON.parse(text);
    if (j?.failed) return `Step ${Number(j.failed.index) + 1} (${j.failed.command}): ${j.failed.error}${j.rolled_back ? '. Nothing was changed.' : ''}`;
    if (typeof j?.error === 'string') return j.error;
  } catch { /* plain text */ }
  return text.replace(/^error:\s*/i, '') || 'The engine refused the command';
}

const v2 = (v: any): Vec2 => [Number(v?.[0] ?? 0), Number(v?.[1] ?? 0)];
const v3 = (v: any): Vec3 => [Number(v?.[0] ?? 0), Number(v?.[1] ?? 0), Number(v?.[2] ?? 0)];

/** One sketch from the engine's description. Exported for tests. */
export function toSketch(k: any, activeId: unknown): Sketch {
  const curves = (k.curves ?? []).map((c: any) => {
    const type = c.type === 'line' || c.type === 'circle' || c.type === 'arc' ? c.type : 'other';
    return {
      id: String(c.id), type, construction: !!c.construction, fullyConstrained: !!c.fully_constrained,
      ...(c.start_at ? { start: v2(c.start_at) } : {}), ...(c.end_at ? { end: v2(c.end_at) } : {}),
      ...(c.center_at ? { center: v2(c.center_at) } : {}), ...(typeof c.radius === 'number' ? { radius: c.radius } : {}),
      ...(typeof c.start === 'string' ? { startId: c.start } : {}), ...(typeof c.end === 'string' ? { endId: c.end } : {}), ...(typeof c.center === 'string' ? { centerId: c.center } : {}),
    };
  });
  const points = (k.points ?? []).filter((q: any) => q.id !== 'origin').map((q: any) => ({ id: String(q.id), at: v2(q.at), fixed: !!q.fixed }));
  const dimensions = (k.constraints ?? []).filter((c: any) => typeof c.param === 'string').map((c: any) => ({
    id: String(c.id), kind: String(c.type), param: String(c.param), expression: String(c.expression ?? c.value), value: Number(c.value),
    ...(typeof c.l === 'number' && curves[c.l] ? { curve: curves[c.l].id } : {}),
  }));
  const profiles = (k.profiles ?? []).map((p: any) => ({
    index: Number(p.index), area: Number(p.area_mm2 ?? 0), centroid: v2(p.centroid_sketch), curves: (p.curves ?? []).map(String), holes: (p.holes ?? []).map((h: any) => (h ?? []).map(String)),
  }));
  return {
    id: Number(k.id), name: String(k.name), visible: k.visible !== false, active: activeId != null && Number(activeId) === Number(k.id),
    plane: { origin: v3(k.plane?.origin), xDir: v3(k.plane?.x_dir), yDir: v3(k.plane?.y_dir) },
    curves, points, dimensions, profiles, dof: Number(k.dof ?? 0),
  };
}
