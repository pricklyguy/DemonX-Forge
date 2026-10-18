import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, type Snapshot, type SketchCurve, type Vec2, type Vec3 } from './api';
import { Browser } from './Browser';
import { Icon } from './icons';
import { Ribbon } from './Ribbon';
import { Timeline } from './Timeline';
import { ViewCube } from './ViewCube';
import { Viewport, type FacePick } from './Viewport';
import { normalOf } from './sketch/plane';
import { dimensionFor, onClick, onTyped } from './sketch/tools';
import type { Mode, PlanePick, ProfileRef, Tool, ViewApi } from './ui';

const EMPTY: Snapshot = { bodies: [], parameters: [], timeline: [], sketches: [], ms: 0, warnings: [] };
const HINT: Record<string, string> = {
  pickPlane: 'Select an origin plane or a flat face of a body to sketch on. Esc cancels.',
  extrude: 'Select the profiles to extrude, set the distance, then OK. Esc cancels.',
  dimension: 'Click a line, circle or arc to dimension it. Esc ends the tool.',
};
type ExtrudeForm = { distance: string; direction: 'one' | 'sym'; operation: 'new' | 'join' | 'cut' | 'intersect' };

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
  const [dimEdit, setDimEdit] = useState<{ curve: SketchCurve; value: string; param?: string } | null>(null);
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
    else if (!activeSketch && mode === 'sketch') { setMode('model'); setTool(null); setPending([]); setDimEdit(null); setTyped(''); }
  }, [activeSketch, mode]);
  useEffect(() => { setSel((p) => (p && snap.bodies.find((b) => b.name === p.body)?.faces.some((f) => f.index === p.face) ? p : null)); }, [snap]);

  // ---- sketching
  const chooseTool = (t: Tool | null) => { setTool(t); setPending([]); setTyped(''); setDimEdit(null); setError(''); };
  const applyResult = (r: ReturnType<typeof onClick>) => {
    setError(r.message ?? '');
    setPending(r.pending);
    setTyped('');
    if (r.steps.length) { void run(() => api.batch(r.steps)).then((s) => { if (!s) setPending([]); }); if (r.pending.length === 0) setTool(null); }
  };
  const sketchClick = (pt: Vec2) => { if (tool && tool !== 'dimension') applyResult(onClick(tool, pending, pt)); };
  const submitTyped = () => { if (tool && tool !== 'dimension' && pending.length) applyResult(onTyped(tool, pending, cursor ?? pending[pending.length - 1]!, typed)); };
  const endChain = () => { setPending([]); setTyped(''); setTool((t) => (t === 'line' ? null : t)); };
  const curvePick = (c: SketchCurve) => {
    const existing = activeSketch?.dimensions.find((d) => d.curve === c.id); // already dimensioned: edit that value instead of adding a second one
    setDimEdit({ curve: c, value: existing ? existing.expression : fmt(lengthOf(c)), ...(existing ? { param: existing.param } : {}) });
  };
  const submitDimension = () => {
    if (!dimEdit) return;
    if (dimEdit.param) { const { param, value } = dimEdit; setDimEdit(null); void run(() => api.param(param, value.trim())); return; }
    const step = dimensionFor(dimEdit.curve, dimEdit.value);
    if (!step) { setError('That curve cannot be dimensioned yet'); return; }
    setDimEdit(null);
    void run(() => api.batch([step]));
  };

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
    let distance: number | string = Number.isFinite(n) ? n : d, direction = ext.direction === 'sym' ? 'symmetric' : 'positive';
    // a cut goes into the material by default (toward the body), like Fusion; a sketch on a top face points outward, so that is "negative"
    if (ext.operation === 'cut' && direction === 'positive' && bodyCenter && dot3(sub3(bodyCenter, sk.plane.origin), normalOf(sk.plane)) < 0) direction = 'negative';
    if (typeof distance === 'number') { if (distance === 0) return null; if (distance < 0) { distance = -distance; if (direction !== 'symmetric') direction = direction === 'positive' ? 'negative' : 'positive'; } }
    return { command: 'solid.extrude', params: { sketch: sk.name, profiles: profiles.map((r) => r.index), distance, direction, operation: ext.operation } };
  };
  const applyPreview = useCallback((step: ReturnType<typeof extrudeStep>) => run(async () => {
    if (preview.current) { await api.undo(); preview.current = false; }
    if (!step) return api.state();
    try { const s = await api.batch([step]); preview.current = true; return s; }
    catch (e) { const s = await api.state(); setError((e as Error).message); return s; }
  }), [run]);
  const stepKey = JSON.stringify(mode === 'extrude' ? extrudeStep() : null);
  useEffect(() => {
    if (mode !== 'extrude') return;
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
  const cancelExtrude = async () => { await applyPreview(null); setProfiles([]); setMode('model'); setError(''); };
  const okExtrude = async () => {
    const step = extrudeStep(); if (!step) { setError('Select a profile and enter a distance'); return; }
    await applyPreview(step);
    if (!preview.current) return; // the engine refused: the reason is shown and the dialog stays open
    preview.current = false; setProfiles([]); setMode('model');
  };

  const drillHole = () => { if (sel) void run(() => api.command('solid.hole', { position: sel.point.map((v) => +v.toFixed(3)), diameter: 5 })); };
  const undo = () => { if (mode === 'extrude') return; setPending([]); void run(api.undo); };
  const redo = () => { if (mode === 'extrude') return; void run(api.redo); };

  // ---- keyboard (the same letters Fusion users know)
  const latest = useRef({ mode, tool, pending, dimEdit, sel, activeSketch });
  latest.current = { mode, tool, pending, dimEdit, sel, activeSketch };
  const actions = useRef({ undo, redo, startExtrude, cancelExtrude, okExtrude, drillHole, chooseTool, endChain, createSketch });
  actions.current = { undo, redo, startExtrude, cancelExtrude, okExtrude, drillHole, chooseTool, endChain, createSketch };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const L = latest.current, A = actions.current, k = e.key.toLowerCase();
      const inField = (e.target as HTMLElement)?.closest?.('input, select, textarea');
      if ((e.ctrlKey || e.metaKey) && !inField) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); A.undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); A.redo(); }
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (k === 'escape') {
        if (inField) (e.target as HTMLElement).blur();
        if (L.dimEdit) setDimEdit(null);
        else if (L.mode === 'extrude') void A.cancelExtrude();
        else if (L.mode === 'pickPlane') setMode('model');
        else if (L.pending.length) A.endChain();
        else if (L.tool) A.chooseTool(null);
        return;
      }
      if (inField) return;
      if (L.mode === 'sketch') {
        if (L.pending.length && /^[0-9.\-]$/.test(e.key)) { setTyped(e.key); setTimeout(() => entryRef.current?.focus(), 0); e.preventDefault(); return; }
        const map: Record<string, Tool> = { l: 'line', r: 'rect', c: 'circle', d: 'dimension' };
        if (map[k]) { A.chooseTool(map[k]!); return; }
        if (k === 'e') void A.startExtrude();
        return;
      }
      if (L.mode === 'model') { if (k === 'e') void A.startExtrude(); else if (k === 'h' && L.sel) A.drillHole(); }
      else if (L.mode === 'extrude' && k === 'enter') void A.okExtrude();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; };
  const face = useMemo(() => snap.bodies.find((b) => b.name === sel?.body)?.faces.find((f) => f.index === sel?.face), [snap, sel]);
  const hint = mode === 'sketch'
    ? (tool === 'dimension' ? HINT.dimension! : tool === 'line' ? (pending.length ? 'Click the next point, or type a length. Right-click or Esc ends the line.' : 'Click the start point.') : tool === 'rect' ? (pending.length ? 'Click the opposite corner, or type width,height.' : 'Click the first corner.') : tool === 'circle' ? (pending.length ? 'Click to set the size, or type a diameter.' : 'Click the centre.') : 'Pick a sketch tool: L line, R rectangle, C circle, D dimension.')
    : HINT[mode] ?? '';
  const triangles = snap.bodies.reduce((n, b) => n + b.faceIds.length, 0);
  const placeholder = tool === 'rect' ? 'width, height' : tool === 'circle' ? 'diameter' : 'length [, angle]';

  return (
    <div className="app">
      <header>
        <span className="brand"><b>DemonX</b> Forge</span>
        <span className="muted">(Unsaved)</span>
        <span className="spacer" />
        <button className="hbtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={busy && mode === 'extrude'} onClick={undo}><Icon.undo /></button>
        <button className="hbtn" aria-label="Redo" title="Redo (Ctrl+Y)" onClick={redo}><Icon.redo /></button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
      </header>

      <Ribbon mode={mode} tool={tool} canHole={!!sel && mode === 'model'} onCreateSketch={createSketch} onExtrude={startExtrude} onHole={drillHole} onTool={(t) => chooseTool(t)} onFinish={() => void finishSketch()} />

      <Browser bodies={snap.bodies} sketches={snap.sketches} parameters={snap.parameters} hiddenBodies={hiddenBodies} hiddenSketches={hiddenSketches} showOrigin={showOrigin} busy={busy}
        onToggleBody={(n) => setHiddenBodies((s) => toggle(s, n))} onToggleSketch={(i) => setHiddenSketches((s) => toggle(s, i))} onToggleOrigin={() => setShowOrigin((v) => !v)}
        onSetParam={async (name, value) => !!(await run(() => api.param(name, value)))} />

      <div className="stage">
        <Viewport bodies={snap.bodies} sketches={snap.sketches} activeSketch={activeSketch} theme={theme} mode={mode} tool={tool} pending={pending}
          hiddenBodies={hiddenBodies} hiddenSketches={hiddenSketches} showOrigin={showOrigin} showGrid={showGrid} showEdges={showEdges} showProfiles={showProfiles} snap={snapOn}
          selectedFace={sel ? { body: sel.body, face: sel.face } : null} selectedProfiles={profiles}
          onFacePick={setSel} onPlanePick={planePicked} onSketchClick={sketchClick} onSketchRightClick={endChain} onCurvePick={curvePick}
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
            <div className="dhead">EXTRUDE</div>
            <div className="drow"><span>Profiles</span><b data-testid="profile-count">{profiles.length ? `${profiles.length} selected` : 'Select profiles'}</b></div>
            <label className="drow"><span>Direction</span>
              <select aria-label="Direction" value={ext.direction} onChange={(e) => setExt({ ...ext, direction: e.target.value as ExtrudeForm['direction'] })}><option value="one">One Side</option><option value="sym">Symmetric</option></select></label>
            <label className="drow"><span>Distance</span>
              <input aria-label="Distance" type="text" value={ext.distance} onChange={(e) => setExt({ ...ext, distance: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label>
            <label className="drow"><span>Operation</span>
              <select aria-label="Operation" value={ext.operation} onChange={(e) => setExt({ ...ext, operation: e.target.value as ExtrudeForm['operation'] })}><option value="new">New Body</option><option value="join">Join</option><option value="cut">Cut</option><option value="intersect">Intersect</option></select></label>
            <div className="dnote">{ext.operation === 'cut' ? 'Cut goes into the body. A negative distance flips the direction.' : 'A negative distance flips the direction.'}</div>
            <div className="dbtns"><button onClick={() => void cancelExtrude()}>Cancel</button><button className="primary" data-testid="extrude-ok" onClick={() => void okExtrude()}>OK</button></div>
          </div>
        )}

        {mode === 'sketch' && tool && tool !== 'dimension' && pending.length > 0 && (
          <div className="entry" data-testid="entry">
            <input ref={entryRef} aria-label="Typed size" type="text" value={typed} placeholder={placeholder} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTyped(); }} />
          </div>
        )}
        {dimEdit && (
          <div className="entry dim" data-testid="dim-entry">
            <span>{dimEdit.param ? 'Change ' : ''}{dimEdit.curve.type === 'line' ? 'Length' : dimEdit.curve.type === 'circle' ? 'Diameter' : 'Radius'} of {dimEdit.curve.id}</span>
            <input autoFocus aria-label="Dimension value" type="text" value={dimEdit.value} onFocus={(e) => e.target.select()} onChange={(e) => setDimEdit({ ...dimEdit, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitDimension(); }} />
          </div>
        )}

        {mode === 'model' && face && (
          <div className="seltip" data-testid="selection">Face {face.index} · {face.planeNormal ? 'plane' : face.cylinder ? `cylinder R${face.cylinder.radius.toFixed(2)}` : 'other'} · area ≈ {face.area.toFixed(1)} mm²</div>
        )}
        {mode === 'model' && snap.bodies.length === 0 && snap.sketches.length === 0 && (
          <div className="empty"><div><p>Nothing modelled yet.</p><p className="muted">Press Create Sketch, pick a plane, draw a shape, Finish Sketch, then Extrude (E).</p>
            <button disabled={busy} data-testid="demo" onClick={() => void run(api.demo)}>Load the demo bracket</button></div></div>
        )}
      </div>

      <Timeline items={snap.timeline} />

      <div className="status" data-testid="status">
        <span data-testid="hint">{busy ? 'Working…' : hint || (snap.bodies.length ? `${snap.bodies.length} body, ${triangles} triangles; engine ${snap.ms} ms` : 'Ready')}</span>
        {mode === 'sketch' && cursor && <span className="coords" data-testid="coords">X {cursor[0].toFixed(2)}  Y {cursor[1].toFixed(2)} mm</span>}
        {error && <span className="err" data-testid="error">{error}</span>}
        {snap.warnings.map((w) => <span className="warn" key={w}>{w}</span>)}
      </div>
    </div>
  );
}
