import { useState, type ReactNode } from 'react';
import type { Body, Parameter, Sketch } from './api';
import { Icon } from './icons';

interface Props {
  bodies: Body[]; sketches: Sketch[]; parameters: Parameter[];
  hiddenBodies: Set<string>; hiddenSketches: Set<number>; showOrigin: boolean; busy: boolean;
  onToggleBody(name: string): void; onToggleSketch(id: number): void; onToggleOrigin(): void;
  onSetParam(name: string, value: string): Promise<boolean>;
}

function Node({ label, children, eye, onEye, open: init = true, id, active }: { label: ReactNode; children?: ReactNode; eye?: boolean; onEye?: () => void; open?: boolean; id: string; active?: boolean }) {
  const [open, setOpen] = useState(init);
  return (
    <div>
      <div className={`bnode${active ? ' active' : ''}`} data-testid={`node-${id}`}>
        <span className={`bcaret${children ? (open ? ' open' : '') : ' none'}`} onClick={() => children && setOpen(!open)}><Icon.caret /></span>
        {onEye && <button className="beye" aria-label={`${eye ? 'Hide' : 'Show'} ${id}`} onClick={onEye}>{eye ? <Icon.eye /> : <Icon.eyeOff />}</button>}
        <span className="blabel">{label}</span>
      </div>
      {children && open && <div className="bchildren">{children}</div>}
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

/** The browser tree: document, origin, bodies, sketches (and the named parameters). */
export function Browser(p: Props) {
  return (
    <aside className="browser" data-testid="browser">
      <div className="bhead">BROWSER</div>
      <Node id="root" label="(Unsaved)">
        <Node id="settings" label="Document Settings"><div className="bleaf">Units: mm</div></Node>
        <Node id="origin" label="Origin" eye={p.showOrigin} onEye={p.onToggleOrigin} open={false}>
          <div className="bleaf">XY plane</div><div className="bleaf">XZ plane</div><div className="bleaf">YZ plane</div>
        </Node>
        <Node id="bodies" label={`Bodies (${p.bodies.length})`}>
          {p.bodies.map((b) => <Node key={b.name} id={`body-${b.name}`} label={b.name} eye={!p.hiddenBodies.has(b.name)} onEye={() => p.onToggleBody(b.name)} />)}
        </Node>
        <Node id="sketches" label={`Sketches (${p.sketches.length})`}>
          {p.sketches.map((s) => <Node key={s.id} id={`sketch-${s.name}`} active={s.active} label={s.name} eye={!p.hiddenSketches.has(s.id)} onEye={() => p.onToggleSketch(s.id)} />)}
        </Node>
        <Node id="params" label={`Parameters (${p.parameters.length})`}>
          {p.parameters.map((q) => <ParamRow key={`${q.name}:${q.expression}`} name={q.name} expression={q.expression} disabled={p.busy} onSet={(v) => p.onSetParam(q.name, v)} />)}
        </Node>
      </Node>
    </aside>
  );
}
