import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, type Snapshot, type SketchCurve, type TimelineItem, type Vec2, type Vec3 } from './api';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { Browser } from './Browser';
import { canPick, download, extOf, FORGE_TYPE, pickOpenFile, pickSaveHandle, stripExt, typeForExt, writeHandle, type Handle } from './files';
import { Icon } from './icons';
import { Ribbon } from './Ribbon';
import { Timeline } from './Timeline';
import { ViewCube } from './ViewCube';
import { Viewport, type FacePick } from './Viewport';
import { normalOf } from './sketch/plane';
import { PICK_MODE, constraintStep, dimensionFor, isDraw, onClick, onTyped, type Tool } from './sketch/tools';
import { pickEntity, type Picked } from './sketch/pick';
import type { Mode, PlanePick, ProfileRef, ViewApi } from './ui';

const EMPTY: Snapshot = { doc: { name: 'Untitled', dirty: false }, bodies: [], parameters: [], timeline: [], marker: 0, sketches: [], ms: 0, warnings: [] };
const HINT: Record<string, string> = {
  pickPlane: 'Select an origin plane or a flat face of a body to sketch on. Esc cancels.',
  extrude: 'Select the profiles to extrude, set the distance, then OK. Esc cancels.',
};
/** Status-bar help for a sketch tool, by how many points are already placed (or picked). */
const TOOL_HINT: Record<string, string[]> = {
  line: ['Click the start point.', 'Click the next point, or type a length. Right-click or Esc ends the line.'],
  rect: ['Click the first corner.', 'Click the opposite corner, or type width,height.'],
  rectCenter: ['Click the centre.', 'Click a corner, or type width,height.'],
  circle: ['Click the centre.', 'Click to set the size, or type a diameter.'],
  circle2: ['Click one end of the diameter.', 'Click the other end, or type a diameter.'],
  arc3: ['Click the start point.', 'Click the end point.', 'Click a point the arc passes through.'],
  slot: ['Click the centre of the first end.', 'Click the centre of the other end.', 'Click to set the width, or type it.'],
  dimension: ['Click a line, circle or arc to dimension it (click a dimensioned one to change it). Esc ends the tool.'],
  trim: ['Click the piece of a line, arc or circle to remove, between its nearest crossings.'],
  extend: ['Click near the end of a line or arc to extend it to the nearest curve.'],
  offset: ['Click a curve (its connected chain is offset), then type the distance.'],
  fillet: ['Click a corner where two curves meet, then type the radius.'],
  horizontal: ['Click a line (or two points) to make it horizontal or vertical.', 'Click the second point.'],
  coincident: ['Click a point.', 'Click a point or a curve to join it to.'],
  parallel: ['Click the first line.', 'Click the second line.'],
  perpendicular: ['Click the first line.', 'Click the second line.'],
  tangent: ['Click the first curve.', 'Click the second curve.'],
  equal: ['Click the first line or circle.', 'Click the second.'],
  midpoint: ['Click a point or a line.', 'Click the other.'],
  concentric: ['Click the first circle or arc.', 'Click the second.'],
  fix: ['Click a point or curve to fix it (or release it).'],
};
type ExtrudeForm = { distance: string; direction: 'one' | 'rev' | 'sym'; operation: 'new' | 'join' | 'cut' | 'intersect' };
/** The engine names the operation `new_body` in a feature's definition and `new` in the command. */
const opFromDef = (o?: string): ExtrudeForm['operation'] => (o === 'join' || o === 'cut' || o === 'intersect' ? o : 'new');
const opToDef = (o: ExtrudeForm['operation']) => (o === 'new' ? 'new_body' : o);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

function loadTheme(): string { try { return localStorage.getItem('forge-theme') ?? 'dark'; } catch { return 'dark'; } }
const lengthOf = (c: SketchCurve) => c.type === 'line' && c.start && c.end ? Math.hypot(c.end[0] - c.start[0], c.end[1] - c.start[1]) : c.type === 'circle' ? 2 * (c.radius ?? 0) : (c.radius ?? 0);
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export function App() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [mode, setMode] = useState<Mode>('model');
  const [tool, setTool] = useState<Tool | null>(null);
  const [pending, setPending] = useState<Vec2[]>([]);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [typed, setTyped] = useState('');
  const [edit, setEdit] = useState<{ title: string; value: string; submit(v: string): void } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selTl, setSelTl] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: TimelineItem } | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; label?: string; ok(): void } | null>(null);
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState('');
  const fileHandle = useRef<Handle | null>(null); // the file Save writes back to (Chrome and Edge)
  /** Set while an existing extrude is open in the dialog: `key` is the profiles it had, to tell whether they changed. */
  const [editing, setEditing] = useState<{ name: string; key: string } | null>(null);
  const [picks, setPicks] = useState<Picked[]>([]);
  const [sel, setSel] = useState<FacePick | null>(null);
  const [profiles, setProfiles] = useState<ProfileRef[]>([]);
  const [ext, setExt] = useState<ExtrudeForm>({ distance: '10', direction: 'one', operation: 'new' });
  const [hiddenBodies, setHiddenBodies] = useState<Set<string>>(new Set());
  const [hiddenSketches, setHiddenSketches] = useState<Set<number>>(new Set());
  const [showOrigin, setShowOrigin] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showProfiles, setShowProfiles] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(loadTheme);
  const viewApi = useRef<ViewApi | null>(null);
  const entryRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => { // before the viewport reads the colour variables
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('forge-theme', theme); } catch { /* private window: the choice just is not remembered */ }
  }, [theme]);

  // ---- talking to the engine: one request at a time, in the order they were made
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  /** Runs an engine action and shows its result. Resolves to the new model, or null when the engine refused (the design is unchanged and the reason is shown). */
  const run = useCallback((f: () => Promise<Snapshot>): Promise<Snapshot | null> => {
    inFlight.current++; setBusy(true);
    const job = queue.current.then(async () => {
      setError('');
      try { const s = await f(); setSnap(s); return s; } catch (e) { setError((e as Error).message); return null; }
      finally { if (--inFlight.current === 0) setBusy(false); }
    });
    queue.current = job.then(() => {}, () => {});
    return job;
  }, []);
  useEffect(() => { void run(api.state); }, [run]);

  const activeSketch = useMemo(() => snap.sketches.find((s) => s.active) ?? null, [snap]);
  // the engine is the truth about whether a sketch is open (undo and redo can open and close one)
  useEffect(() => {
    if (activeSketch && mode !== 'sketch') { setMode('sketch'); setTool(null); setPending([]); }
    else if (!activeSketch && mode === 'sketch') { setMode('model'); setTool(null); setPending([]); setEdit(null); setTyped(''); setSelected([]); setPicks([]); }
  }, [activeSketch, mode]);
  useEffect(() => { setSelTl((id) => (id !== null && snap.timeline.some((t) => t.id === id) ? id : null)); }, [snap]);
  useEffect(() => { setSel((p) => (p && snap.bodies.find((b) => b.name === p.body)?.faces.some((f) => f.index === p.face) ? p : null)); }, [snap]);

  // ---- sketching
  const chooseTool = (t: Tool | null) => { setTool(t); setPending([]); setTyped(''); setEdit(null); setPicks([]); if (t) setSelected([]); setError(''); };
  const applyResult = (r: ReturnType<typeof onClick>) => {
    setError(r.message ?? '');
    setPending(r.pending);
    setTyped('');
    if (r.steps.length) { void run(() => api.batch(r.steps)).then((s) => { if (!s) setPending([]); }); if (r.pending.length === 0) setTool(null); }
  };
  const numOrExpr = (v: string): number | string => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) ? n : v.trim(); };
  const send = (steps: { command: string; params: Record<string, unknown> }[]) => { void run(() => api.batch(steps)); };
  const sketchClick = (pt: Vec2, tol: number, additive: boolean) => {
    const sk = activeSketch; if (!sk) return;
    if (isDraw(tool)) { applyResult(onClick(tool, pending, pt)); return; }
    const hit = pickEntity(sk, pt, tol, tool ? PICK_MODE[tool] : 'curve');
    if (!tool) { // no tool: select curves (Shift adds), then Delete removes them or X makes them construction lines
      setSelected((cur) => (!hit ? (additive ? cur : []) : additive ? (cur.includes(hit.id) ? cur.filter((i) => i !== hit.id) : [...cur, hit.id]) : [hit.id]));
      return;
    }
    if (!hit) { setError(''); return; }
    setError('');
    switch (tool) {
      case 'dimension': { const c = sk.curves.find((x) => x.id === hit.id); if (c) curvePick(c); break; }
      case 'trim': send([{ command: 'sketch.trim', params: { curve: hit.id, at: pt } }]); break;
      case 'extend': send([{ command: 'sketch.extend', params: { curve: hit.id, at: pt } }]); break;
      case 'offset': setEdit({ title: 'Offset distance (negative goes the other way)', value: '5', submit: (v) => send([{ command: 'sketch.offset', params: { curves: [hit.id], distance: numOrExpr(v), chain: true } }]) }); break;
      case 'fillet': setEdit({ title: 'Fillet radius', value: '2', submit: (v) => send([{ command: 'sketch.fillet', params: { point: hit.id, radius: numOrExpr(v) } }]) }); break;
      default: { // constraint tools collect the picks they need, then send one constraint
        const next = [...picks, hit];
        const r = constraintStep(tool, next);
        if (!r.done) { setPicks(next); break; }
        setPicks([]);
        if (r.message) setError(r.message); else if (r.step) send([r.step]);
      }
    }
  };
  const submitTyped = () => { if (isDraw(tool) && pending.length) applyResult(onTyped(tool, pending, cursor ?? pending[pending.length - 1]!, typed)); };
  const endChain = () => { setPending([]); setTyped(''); setTool((t) => (t === 'line' ? null : t)); };
  const curvePick = (c: SketchCurve) => {
    const existing = activeSketch?.dimensions.find((d) => d.curve === c.id); // already dimensioned: edit that value instead of adding a second one
    const what = c.type === 'line' ? 'Length' : c.type === 'circle' ? 'Diameter' : 'Radius';
    setEdit({
      title: `${existing ? 'Change ' : ''}${what} of ${c.id}`, value: existing ? existing.expression : fmt(lengthOf(c)),
      submit: (v) => {
        if (existing) { void run(() => api.param(existing.param, v.trim())); return; }
        const step = dimensionFor(c, v);
        if (!step) setError('That curve cannot be dimensioned yet'); else send([step]);
      },
    });
  };
  const deleteSelected = () => { if (selected.length) { const ids = selected; setSelected([]); send([{ command: 'sketch.delete', params: { entities: ids } }]); } };
  const toggleConstruction = () => { if (selected.length) send([{ command: 'sketch.construction', params: { curves: selected } }]); };

  const createSketch = async () => {
    if (mode === 'extrude') await cancelExtrude();
    chooseTool(null); setMode('pickPlane'); setError('');
  };
  const planePicked = (p: PlanePick) => {
    const params = 'plane' in p ? { plane: p.plane } : { plane: { face: p.face.map((v) => +v.toFixed(3)), body: p.body, index: p.index } };
    setMode('model'); // the engine's reply (an open sketch) moves us into the sketch
    void run(() => api.batch([{ command: 'sketch.create', params }]));
  };
  const finishSketch = async (): Promise<Snapshot | null> => { chooseTool(null); return run(() => api.batch([{ command: 'sketch.finish', params: {} }])); };

  // ---- extrude, with a live preview: the extrude is applied to the real model and undone again when anything changes or Cancel is pressed
  const bodyCenter = useMemo<Vec3 | null>(() => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of snap.bodies) for (let i = 0; i < b.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k]!, b.positions[i]!); hi[k] = Math.max(hi[k]!, b.positions[i]!); }
    return Number.isFinite(lo[0]!) ? [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2] : null;
  }, [snap.bodies]);
  const preview = useRef(false);
  const extrudeStep = (): { command: string; params: Record<string, unknown> } | null => {
    const first = profiles[0]; const d = ext.distance.trim();
    const sk = first && snap.sketches.find((s) => s.id === first.sketch);
    if (!sk || !d) return null;
    const n = Number(d);
    let distance: number | string = Number.isFinite(n) ? n : d, direction = ext.direction === 'sym' ? 'symmetric' : ext.direction === 'rev' ? 'negative' : 'positive';
    // a new cut goes into the material by default (toward the body), like Fusion; a sketch on a top face points outward, so that is "negative". An existing feature keeps the direction it has.
    if (!editing && ext.operation === 'cut' && direction === 'positive' && bodyCenter && dot3(sub3(bodyCenter, sk.plane.origin), normalOf(sk.plane)) < 0) direction = 'negative';
    if (typeof distance === 'number') { if (distance === 0) return null; if (distance < 0) { distance = -distance; if (direction !== 'symmetric') direction = direction === 'positive' ? 'negative' : 'positive'; } }
    if (editing) { // change the existing feature in place; profiles are only sent when the selection changed
      const key = profiles.map((r) => r.index).sort().join(',');
      const set: Record<string, unknown> = { extent: { distance: String(distance), direction }, operation: opToDef(ext.operation) };
      if (key !== editing.key) set.profiles = { type: 'curves', loops: profiles.map((r) => sk.profiles.find((q) => q.index === r.index)?.curves ?? []) };
      return { command: 'timeline.edit', params: { feature: editing.name, set } };
    }
    return { command: 'solid.extrude', params: { sketch: sk.name, profiles: profiles.map((r) => r.index), distance, direction, operation: ext.operation } };
  };
  const applyPreview = useCallback((step: ReturnType<typeof extrudeStep>) => run(async () => {
    if (preview.current) { await api.undo(); preview.current = false; }
    if (!step) return api.state();
    try { const s = await api.batch([step]); preview.current = true; return s; }
    catch (e) { const s = await api.state(); setError((e as Error).message); return s; }
  }), [run]);
  const stepKey = JSON.stringify(mode === 'extrude' ? extrudeStep() : null);
  const skipFirst = useRef(false); // opening an existing extrude must not "change" it to itself
  const baseKey = useRef('');
  useEffect(() => {
    if (mode !== 'extrude') return;
    if (skipFirst.current) { skipFirst.current = false; baseKey.current = stepKey; return; }
    const t = setTimeout(() => { void applyPreview(JSON.parse(stepKey)); }, 250);
    return () => clearTimeout(t);
  }, [mode, stepKey, applyPreview]);

  const startExtrude = async () => {
    if (mode === 'extrude') return;
    let s: Snapshot | null = snap;
    if (activeSketch) s = await finishSketch();
    if (!s) return;
    const done = s.sketches.filter((k) => !k.active && k.profiles.length);
    if (!done.length) { setError('Create a sketch with a closed shape first (Create Sketch)'); return; }
    const last = done[done.length - 1]!;
    setProfiles(last.profiles.length === 1 ? [{ sketch: last.id, index: last.profiles[0]!.index, at: last.profiles[0]!.centroid }] : []);
    setExt((x) => ({ ...x, operation: s!.bodies.length ? 'join' : 'new' }));
    chooseTool(null); setMode('extrude'); setError('');
  };
  const profilePicked = (sketch: number, index: number, at: Vec2) => setProfiles((cur) => {
    if (cur.some((r) => r.sketch === sketch && r.index === index)) return cur.filter((r) => !(r.sketch === sketch && r.index === index));
    return [...cur.filter((r) => r.sketch === sketch), { sketch, index, at }]; // one sketch at a time
  });
  const cancelExtrude = async () => { await applyPreview(null); setProfiles([]); setEditing(null); setMode('model'); setError(''); };
  const okExtrude = async () => {
    const step = extrudeStep(); if (!step) { setError('Select a profile and enter a distance'); return; }
    if (editing && !preview.current && stepKey === baseKey.current) { setProfiles([]); setEditing(null); setMode('model'); return; } // nothing was changed
    await applyPreview(step);
    if (!preview.current) return; // the engine refused: the reason is shown and the dialog stays open
    preview.current = false; setProfiles([]); setEditing(null); setMode('model');
  };

  // ---- files: new, open, save, export
  const resetAfterLoad = () => {
    chooseTool(null); setSel(null); setSelected([]); setPicks([]); setProfiles([]); setEditing(null); setSelTl(null); setMenu(null);
    setHiddenBodies(new Set()); setHiddenSketches(new Set());
    setTimeout(() => viewApi.current?.setView('home'), 80);
  };
  const guardUnsaved = (go: () => void) => { if (snap.doc.dirty) setConfirm({ text: 'Discard the unsaved changes?', label: 'Discard', ok: () => { setConfirm(null); go(); } }); else go(); };
  const doNew = () => guardUnsaved(() => { void (async () => {
    await noPreviewPending();
    const s = await run(api.newDesign);
    if (s) { fileHandle.current = null; resetAfterLoad(); setNotice('New design'); }
  })(); });
  const doOpen = () => guardUnsaved(() => { void (async () => {
    try {
      await noPreviewPending();
      const picked = await pickOpenFile([FORGE_TYPE]);
      if (!picked) return;
      const data = await picked.file.arrayBuffer();
      const s = await run(() => api.open(data, stripExt(picked.file.name)));
      if (s) { fileHandle.current = picked.handle; resetAfterLoad(); setNotice(`Opened ${picked.file.name}`); }
    } catch (e) { setError((e as Error).message); }
  })(); });
  const saveTo = async (target: Handle | null, name: string) => {
    const { data, filename } = await api.save(name);
    const blob = new Blob([data], { type: 'application/octet-stream' });
    if (target) {
      try { await writeHandle(target, blob); }
      catch { // the browser would not let us write back (permission refused, read-only file): ask where to save instead
        const other = await pickSaveHandle(`${name}.forge`, [FORGE_TYPE]);
        if (!other) { setError('Not saved: the file could not be written and no other place was chosen.'); return; }
        await writeHandle(other, blob); target = other;
      }
      fileHandle.current = target;
    } else download(blob, filename);
    setNotice(`Saved ${target ? target.name : filename}`);
    await run(api.state); // the name and the unsaved marker
  };
  const doSave = async (saveAs: boolean) => {
    if (mode === 'extrude') { setError('Finish or cancel the extrude first, then save.'); return; }
    const name = snap.doc.name;
    try {
      let target = saveAs ? null : fileHandle.current;
      if (!target && canPick()) { target = await pickSaveHandle(`${name}.forge`, [FORGE_TYPE]); if (!target) return; }
      if (!target && saveAs) { setEdit({ title: 'Save as (the file goes to your Downloads folder)', value: name, submit: (v) => void saveTo(null, v.trim() || name).catch((e) => setError((e as Error).message)) }); return; }
      await saveTo(target, target ? stripExt(target.name) : name);
    } catch (e) { setError((e as Error).message); }
  };
  const doExport = async (format: string, sketch?: string) => {
    try {
      const base = snap.doc.name, ext = format === 'stla' ? 'stl' : format;
      const suggested = sketch ? `${base} ${sketch}.${ext}` : `${base}.${ext}`;
      const target = canPick() ? await pickSaveHandle(suggested, [typeForExt(ext)]) : null;
      if (canPick() && !target) return;
      const { data, filename } = await api.exportAs(format, sketch);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      if (target) { await writeHandle(target, blob); setNotice(`Exported ${target.name}`); } else { download(blob, filename); setNotice(`Exported ${filename} (see your Downloads folder)`); }
    } catch (e) { setError((e as Error).message); }
  };
  const fileItems = (): MenuItem[] => {
    const none = snap.bodies.length === 0;
    return [
      { label: 'New', onClick: doNew },
      { label: 'Open…   Ctrl+O', onClick: doOpen },
      { label: 'Save   Ctrl+S', onClick: () => void doSave(false) },
      { label: 'Save As…   Ctrl+Shift+S', onClick: () => void doSave(true) },
      { label: 'Export bodies', heading: true, onClick: () => {} },
      { label: 'STEP (.step)', disabled: none, onClick: () => void doExport('step') },
      { label: 'STL (.stl)', disabled: none, onClick: () => void doExport('stl') },
      { label: '3MF (.3mf)', disabled: none, onClick: () => void doExport('3mf') },
      { label: 'OBJ (.obj)', disabled: none, onClick: () => void doExport('obj') },
      { label: 'Export a sketch as DXF', heading: true, onClick: () => {} },
      ...(snap.sketches.length ? snap.sketches.map((k) => ({ label: k.name, onClick: () => void doExport('dxf', k.name) })) : [{ label: 'No sketches yet', disabled: true, onClick: () => {} }]),
    ];
  };
  useEffect(() => { document.title = `${snap.doc.name}${snap.doc.dirty ? ' ●' : ''} - DemonX Forge`; }, [snap.doc]);
  useEffect(() => {
    if (!snap.doc.dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [snap.doc.dirty]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);

  // ---- editing: timeline items and sketches
  const noPreviewPending = async () => { if (mode === 'extrude') await cancelExtrude(); };
  const editSketch = async (name: string) => {
    await noPreviewPending();
    chooseTool(null);
    const steps = activeSketch ? [{ command: 'sketch.finish', params: {} }, { command: 'sketch.edit', params: { sketch: name } }] : [{ command: 'sketch.edit', params: { sketch: name } }];
    if (activeSketch?.name === name) return;
    send(steps);
  };
  const editExtrude = async (item: TimelineItem) => {
    await noPreviewPending();
    if (activeSketch) { const s = await finishSketch(); if (!s) return; }
    try {
      const f = await api.inspectFeature(item.name);
      const sk = snap.sketches.find((k) => k.id === f.definition.sketch);
      if (!sk) { setError('Cannot find the sketch this extrude was made from'); return; }
      const loops = f.definition.profiles?.loops ?? [];
      const chosen = sk.profiles.filter((pr) => loops.some((l) => sameSet(l, pr.curves)));
      const dir = f.definition.extent?.direction;
      skipFirst.current = true;
      setProfiles(chosen.map((pr) => ({ sketch: sk.id, index: pr.index, at: pr.centroid })));
      setExt({ distance: f.definition.extent?.distance ?? '10', direction: dir === 'symmetric' ? 'sym' : dir === 'negative' ? 'rev' : 'one', operation: opFromDef(f.definition.operation) });
      setEditing({ name: item.name, key: chosen.map((pr) => pr.index).sort().join(',') });
      chooseTool(null); setMode('extrude'); setError('');
    } catch (e) { setError((e as Error).message); }
  };
  const editItem = (item: TimelineItem) => {
    if (/sketch/i.test(item.type)) void editSketch(item.name);
    else if (/extrude/i.test(item.type)) void editExtrude(item);
    else setError(`Editing a ${item.type.replace(/Feature$/, '').toLowerCase()} is not available yet: delete it and make it again, or use Undo.`);
  };
  const requestDelete = async (item: TimelineItem) => {
    try {
      const d = await api.dependents(item.name);
      const doIt = () => { setConfirm(null); send([{ command: 'timeline.delete', params: { features: [item.name] } }]); };
      if (d.deleted_with_it.length) setConfirm({ text: `Deleting ${item.name} also deletes: ${d.deleted_with_it.join(', ')}.`, ok: doIt }); else doIt();
    } catch (e) { setError((e as Error).message); }
  };
  const menuItems = (item: TimelineItem): MenuItem[] => [
    { label: 'Edit', onClick: () => editItem(item), disabled: !/sketch|extrude/i.test(item.type) },
    { label: 'Rename…', onClick: () => setEdit({ title: `Rename ${item.name}`, value: item.name, submit: (v) => { if (v.trim() && v.trim() !== item.name) send([{ command: 'timeline.rename', params: { feature: item.name, name: v.trim() } }]); } }) },
    { label: item.suppressed ? 'Unsuppress' : 'Suppress', onClick: () => send([{ command: 'timeline.suppress', params: { feature: item.name } }]) },
    { label: 'Roll history to here', onClick: () => send([{ command: 'timeline.roll_to', params: { feature: item.name } }]) },
    { label: 'Delete', danger: true, onClick: () => void requestDelete(item) },
  ];

  const drillHole = () => { if (sel) void run(() => api.command('solid.hole', { position: sel.point.map((v) => +v.toFixed(3)), diameter: 5 })); };
  const undo = () => { if (mode === 'extrude') return; setPending([]); void run(api.undo); };
  const redo = () => { if (mode === 'extrude') return; void run(api.redo); };

  // ---- keyboard (the same letters Fusion users know)
  const latest = useRef({ mode, tool, pending, edit, sel, activeSketch, selected, picks, selTl, menu, confirm, items: snap.timeline });
  latest.current = { mode, tool, pending, edit, sel, activeSketch, selected, picks, selTl, menu, confirm, items: snap.timeline };
  const actions = useRef({ undo, redo, startExtrude, cancelExtrude, okExtrude, drillHole, chooseTool, endChain, createSketch, deleteSelected, toggleConstruction, requestDelete, editItem, doSave, doOpen });
  actions.current = { undo, redo, startExtrude, cancelExtrude, okExtrude, drillHole, chooseTool, endChain, createSketch, deleteSelected, toggleConstruction, requestDelete, editItem, doSave, doOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const L = latest.current, A = actions.current, k = e.key.toLowerCase();
      // text boxes and lists own the keyboard; a ticked checkbox does not (clicking Snap must not turn the L, R, C keys off)
      const inField = (e.target as HTMLElement)?.closest?.('input:not([type=checkbox]):not([type=radio]), select, textarea');
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 's' || k === 'o')) { e.preventDefault(); if (k === 'o') A.doOpen(); else void A.doSave(e.shiftKey); return; }
      if ((e.ctrlKey || e.metaKey) && !inField) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); A.undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); A.redo(); }
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (k === 'escape') {
        if (inField) (e.target as HTMLElement).blur();
        if (L.confirm) setConfirm(null);
        else if (L.menu) setMenu(null);
        else if (L.edit) setEdit(null);
        else if (L.mode === 'extrude') void A.cancelExtrude();
        else if (L.mode === 'pickPlane') setMode('model');
        else if (L.pending.length) A.endChain();
        else if (L.picks.length) setPicks([]);
        else if (L.tool) A.chooseTool(null);
        else if (L.selected.length) setSelected([]);
        return;
      }
      if (inField) return;
      if (L.mode === 'sketch') {
        if (L.pending.length && /^[0-9.\-]$/.test(e.key)) { setTyped(e.key); setTimeout(() => entryRef.current?.focus(), 0); e.preventDefault(); return; }
        const map: Record<string, Tool> = { l: 'line', r: 'rect', c: 'circle', a: 'arc3', d: 'dimension', t: 'trim', o: 'offset' };
        if (map[k]) { A.chooseTool(map[k]!); return; }
        if (k === 'delete' || k === 'backspace') { A.deleteSelected(); return; }
        if (k === 'x') { A.toggleConstruction(); return; }
        if (k === 'e') void A.startExtrude();
        return;
      }
      if (L.mode === 'model') {
        if (k === 'e') void A.startExtrude();
        else if (k === 'h' && L.sel) A.drillHole();
        else if ((k === 'delete' || k === 'backspace') && L.selTl !== null) { const it = L.items.find((t) => t.id === L.selTl); if (it) void A.requestDelete(it); }
        else if (k === 'enter' && L.selTl !== null) { const it = L.items.find((t) => t.id === L.selTl); if (it) A.editItem(it); }
      }
      else if (L.mode === 'extrude' && k === 'enter') void A.okExtrude();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; };
  const face = useMemo(() => snap.bodies.find((b) => b.name === sel?.body)?.faces.find((f) => f.index === sel?.face), [snap, sel]);
  const hint = mode === 'sketch'
    ? (tool ? (TOOL_HINT[tool]?.[Math.min(isDraw(tool) ? pending.length : picks.length, (TOOL_HINT[tool]?.length ?? 1) - 1)] ?? '') : selected.length ? `${selected.length} selected. Delete removes it, X makes it a construction line, Esc clears.` : 'Pick a sketch tool, or click a line to select it. Keys: L R C A T O D.')
    : HINT[mode] ?? '';
  const triangles = snap.bodies.reduce((n, b) => n + b.faceIds.length, 0);
  const placeholder = tool === 'rect' || tool === 'rectCenter' ? 'width, height' : tool === 'circle' || tool === 'circle2' ? 'diameter' : tool === 'slot' ? 'width' : 'length [, angle]';
  const typable = isDraw(tool) && pending.length > 0 && tool !== 'arc3' && !(tool === 'slot' && pending.length < 2);

  return (
    <div className="app">
      <header>
        <span className="brand"><b>DemonX</b> Forge</span>
        <button data-testid="file-menu" aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setFileMenu({ x: r.left, y: r.bottom + 2 }); }}>File ▾</button>
        <span className="docname" data-testid="docname">{snap.doc.name}{snap.doc.dirty && <span className="dirty" data-testid="dirty" title="Unsaved changes">●</span>}</span>
        <span className="spacer" />
        <button className="hbtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={busy && mode === 'extrude'} onClick={undo}><Icon.undo /></button>
        <button className="hbtn" aria-label="Redo" title="Redo (Ctrl+Y)" onClick={redo}><Icon.redo /></button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
      </header>

      <Ribbon mode={mode} tool={tool} canHole={!!sel && mode === 'model'} onCreateSketch={createSketch} onExtrude={startExtrude} onHole={drillHole} onTool={(t) => chooseTool(t)} onFinish={() => void finishSketch()} />

      <Browser docName={snap.doc.name} bodies={snap.bodies} sketches={snap.sketches} parameters={snap.parameters} hiddenBodies={hiddenBodies} hiddenSketches={hiddenSketches} showOrigin={showOrigin} busy={busy}
        onToggleBody={(n) => setHiddenBodies((s) => toggle(s, n))} onToggleSketch={(i) => setHiddenSketches((s) => toggle(s, i))} onToggleOrigin={() => setShowOrigin((v) => !v)} onEditSketch={(n) => void editSketch(n)}
        onSetParam={async (name, value) => !!(await run(() => api.param(name, value)))} />

      <div className="stage">
        <Viewport bodies={snap.bodies} sketches={snap.sketches} activeSketch={activeSketch} theme={theme} mode={mode} tool={tool} pending={pending}
          hiddenBodies={hiddenBodies} hiddenSketches={hiddenSketches} showOrigin={showOrigin} showGrid={showGrid} showEdges={showEdges} showProfiles={showProfiles} snap={snapOn}
          selectedFace={sel ? { body: sel.body, face: sel.face } : null} selectedProfiles={profiles}
          onFacePick={setSel} onPlanePick={planePicked} onSketchClick={sketchClick} onSketchRightClick={endChain}
          pickMode={mode !== 'sketch' ? null : !tool ? 'curve' : isDraw(tool) ? null : PICK_MODE[tool]} highlight={[...selected, ...picks.map((q) => q.id)]} showPoints={mode === 'sketch' && !!tool && !isDraw(tool) && PICK_MODE[tool] !== 'curve'}
          onProfilePick={profilePicked} onCursor={setCursor} apiRef={viewApi} />

        <ViewCube api={viewApi} onHome={() => viewApi.current?.setView('home')} />

        <div className="navbar" data-testid="navbar">
          <button title="Fit to view" aria-label="Fit" onClick={() => viewApi.current?.fit()}><Icon.fit /></button>
          <button title="Home view" aria-label="Home" onClick={() => viewApi.current?.setView('home')}><Icon.home /></button>
          <button title="Grid" aria-label="Grid" aria-pressed={showGrid} className={showGrid ? 'on' : ''} onClick={() => setShowGrid((v) => !v)}><Icon.grid /></button>
          <button title="Edges" aria-label="Edges" aria-pressed={showEdges} className={showEdges ? 'on' : ''} onClick={() => setShowEdges((v) => !v)}><Icon.edges /></button>
        </div>

        {mode === 'sketch' && (
          <div className="palette" data-testid="palette">
            <div className="phead">SKETCH PALETTE</div>
            <label><span>Sketch Grid</span><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /></label>
            <label><span>Snap</span><input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /></label>
            <label><span>Profile</span><input type="checkbox" checked={showProfiles} onChange={(e) => setShowProfiles(e.target.checked)} /></label>
            <div className="pstat" data-testid="sketch-state">{activeSketch ? `${activeSketch.name}: ${activeSketch.dof === 0 ? 'fully constrained' : `${activeSketch.dof} degrees of freedom left`}` : ''}</div>
            <button className="primary" onClick={() => void finishSketch()}>Finish Sketch</button>
          </div>
        )}

        {mode === 'extrude' && (
          <div className="dialog" data-testid="extrude-dialog">
            <div className="dhead">{editing ? `EDIT ${editing.name.toUpperCase()}` : 'EXTRUDE'}</div>
            <div className="drow"><span>Profiles</span><b data-testid="profile-count">{profiles.length ? `${profiles.length} selected` : 'Select profiles'}</b></div>
            <label className="drow"><span>Direction</span>
              <select aria-label="Direction" value={ext.direction} onChange={(e) => setExt({ ...ext, direction: e.target.value as ExtrudeForm['direction'] })}><option value="one">One Side</option><option value="rev">One Side (reversed)</option><option value="sym">Symmetric</option></select></label>
            <label className="drow"><span>Distance</span>
              <input aria-label="Distance" type="text" value={ext.distance} onChange={(e) => setExt({ ...ext, distance: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label>
            <label className="drow"><span>Operation</span>
              <select aria-label="Operation" value={ext.operation} onChange={(e) => setExt({ ...ext, operation: e.target.value as ExtrudeForm['operation'] })}><option value="new">New Body</option><option value="join">Join</option><option value="cut">Cut</option><option value="intersect">Intersect</option></select></label>
            <div className="dnote">{ext.operation === 'cut' ? 'Cut goes into the body. A negative distance flips the direction.' : 'A negative distance flips the direction.'}</div>
            <div className="dbtns"><button onClick={() => void cancelExtrude()}>Cancel</button><button className="primary" data-testid="extrude-ok" onClick={() => void okExtrude()}>OK</button></div>
          </div>
        )}

        {mode === 'sketch' && typable && (
          <div className="entry" data-testid="entry">
            <input ref={entryRef} aria-label="Typed size" type="text" value={typed} placeholder={placeholder} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTyped(); }} />
          </div>
        )}
        {edit && (
          <div className="entry dim" data-testid="value-entry">
            <span>{edit.title}</span>
            <input autoFocus aria-label="Value" type="text" value={edit.value} onFocus={(e) => e.target.select()} onChange={(e) => setEdit({ ...edit, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { const { submit, value } = edit; setEdit(null); submit(value); } }} />
          </div>
        )}

        {confirm && (
          <div className="confirm" data-testid="confirm"><span>{confirm.text}</span><button onClick={() => setConfirm(null)}>Cancel</button><button className="primary" data-testid="confirm-ok" onClick={confirm.ok}>{confirm.label ?? 'Delete'}</button></div>
        )}
        {mode === 'model' && face && (
          <div className="seltip" data-testid="selection">Face {face.index} · {face.planeNormal ? 'plane' : face.cylinder ? `cylinder R${face.cylinder.radius.toFixed(2)}` : 'other'} · area ≈ {face.area.toFixed(1)} mm²</div>
        )}
        {mode === 'model' && snap.bodies.length === 0 && snap.sketches.length === 0 && (
          <div className="empty"><div><p>Nothing modelled yet.</p><p className="muted">Press Create Sketch, pick a plane, draw a shape, Finish Sketch, then Extrude (E).</p>
            <button disabled={busy} data-testid="demo" onClick={() => void run(api.demo)}>Load the demo bracket</button></div></div>
        )}
      </div>

      <Timeline items={snap.timeline} marker={snap.marker} selected={selTl} onSelect={setSelTl} onEdit={editItem} onMenu={(item, x, y) => setMenu({ x, y, item })}
        onRollEnd={() => send([{ command: 'timeline.roll_to', params: {} }])} />
      {fileMenu && <ContextMenu x={fileMenu.x} y={fileMenu.y} items={fileItems()} onClose={() => setFileMenu(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.item)} onClose={() => setMenu(null)} />}

      <div className="status" data-testid="status">
        <span data-testid="hint">{busy ? 'Working…' : hint || (snap.bodies.length ? `${snap.bodies.length} body, ${triangles} triangles; engine ${snap.ms} ms` : 'Ready')}</span>
        {mode === 'sketch' && cursor && <span className="coords" data-testid="coords">X {cursor[0].toFixed(2)}  Y {cursor[1].toFixed(2)} mm</span>}
        {notice && <span className="ok" data-testid="notice">{notice}</span>}
        {error && <span className="err" data-testid="error">{error}</span>}
        {snap.warnings.map((w) => <span className="warn" key={w}>{w}</span>)}
      </div>
    </div>
  );
}
