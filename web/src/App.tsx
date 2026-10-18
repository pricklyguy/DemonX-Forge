import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { api, type Face, type Snapshot } from './api';
import { Viewport, type Pick } from './Viewport';

const EMPTY: Snapshot = { bodies: [], parameters: [], timeline: [], ms: 0, warnings: [] };
const fmt = (v: number[] | undefined) => (v ?? []).map((x) => x.toFixed(2)).join(', ');

function loadTheme(): string { try { return localStorage.getItem('forge-theme') ?? 'dark'; } catch { return 'dark'; } }

export function App() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [sel, setSel] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(loadTheme);

  useLayoutEffect(() => { // before the viewport reads the colour variables
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('forge-theme', theme); } catch { /* private window: the choice just is not remembered */ }
  }, [theme]);

  /** Runs an engine action and shows its result; true when it worked (a refusal is shown and the design is unchanged). */
  const run = useCallback(async (f: () => Promise<Snapshot>): Promise<boolean> => {
    setBusy(true); setError('');
    try { const s = await f(); setSnap(s); setSel((p) => (p && s.bodies.find((b) => b.name === p.body)?.faces.some((x) => x.index === p.face) ? p : null)); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void run(api.state); }, [run]);

  const face: Face | undefined = useMemo(() => snap.bodies.find((b) => b.name === sel?.body)?.faces.find((f) => f.index === sel?.face), [snap, sel]);
  const triangles = snap.bodies.reduce((n, b) => n + b.faceIds.length, 0);

  return (
    <div className="app">
      <header>
        <span className="brand"><b>DemonX</b> Forge</span>
        <span className="spacer" />
        <button disabled={busy} onClick={() => run(api.undo)}>Undo</button>
        <button disabled={busy} onClick={() => run(api.redo)}>Redo</button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
      </header>

      <aside className="left">
        <h3>Browser</h3>
        <div className="tree">
          {snap.bodies.length === 0 && <div style={{ color: 'var(--muted)' }}>No bodies</div>}
          {snap.bodies.map((b) => (
            <div key={b.name}>
              <div>▾ {b.name}</div>
              {b.faces.map((f) => (
                <div key={f.index} className={`child${sel?.body === b.name && sel.face === f.index ? ' sel' : ''}`} onClick={() => setSel({ body: b.name, face: f.index, point: f.point })}>
                  Face {f.index}{f.cylinder ? ' (cylinder)' : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
        <h3>Parameters</h3>
        {snap.parameters.length === 0 && <div style={{ color: 'var(--muted)' }}>None yet</div>}
        {snap.parameters.map((p) => <ParamRow key={`${p.name}:${p.expression}`} name={p.name} expression={p.expression} disabled={busy} onSet={(v) => run(() => api.param(p.name, v))} />)}
        <h3>Actions</h3>
        <button className="primary" disabled={busy || !face || !sel} data-testid="drill" onClick={() => sel && run(() => api.command('solid.hole', { position: sel.point.map((v) => +v.toFixed(3)), diameter: 5 }))}>
          Drill Ø5 hole at click
        </button>
      </aside>

      <div className="stage">
        <Viewport bodies={snap.bodies} selected={sel} theme={theme} onPick={setSel} />
        {snap.bodies.length === 0 && (
          <div className="empty"><div><p>Nothing modelled yet.</p><button className="primary" disabled={busy} data-testid="demo" onClick={() => run(api.demo)}>Load the demo bracket</button></div></div>
        )}
      </div>

      <aside className="right">
        <h3>Selection</h3>
        {face ? (
          <div data-testid="selection">
            <div className="row"><span>Face</span><span>{face.index}</span></div>
            <div className="row"><span>Area</span><span>{face.area.toFixed(2)} mm²</span></div>
            {face.planeNormal && <div className="row"><span>Normal</span><span>{fmt(face.planeNormal)}</span></div>}
            {face.cylinder ? <div className="row"><span>Cylinder radius</span><span>{face.cylinder.radius.toFixed(2)} mm</span></div> : <div className="row"><span>Type</span><span>{face.planeNormal ? 'plane' : 'other'}</span></div>}
          </div>
        ) : <div style={{ color: 'var(--muted)' }}>Click a face.</div>}
      </aside>

      <div className="timeline" data-testid="timeline">
        {snap.timeline.length === 0 && <span style={{ color: 'var(--muted)' }}>Timeline is empty</span>}
        {snap.timeline.map((t) => <span key={t.id} className={`item${t.error ? ' err' : ''}${t.suppressed ? ' off' : ''}`} title={t.error ?? t.type}>{t.name}</span>)}
      </div>

      <div className="status" data-testid="status">
        <span>{busy ? 'Working…' : snap.bodies.length ? `${snap.bodies.length} body, ${triangles} triangles; engine ${snap.ms} ms` : 'Ready'}</span>
        {error && <span className="err">{error}</span>}
        {snap.warnings.map((w) => <span className="warn" key={w}>{w}</span>)}
      </div>
    </div>
  );
}

function ParamRow({ name, expression, disabled, onSet }: { name: string; expression: string; disabled: boolean; onSet: (v: string) => Promise<boolean> }) {
  const [text, setText] = useState(expression);
  const commit = () => { if (text.trim() && text.trim() !== expression) void onSet(text.trim()).then((ok) => { if (!ok) setText(expression); }); else setText(expression); };
  return (
    <div className="param"><label htmlFor={`p-${name}`}>{name}</label>
      <input id={`p-${name}`} type="text" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}
