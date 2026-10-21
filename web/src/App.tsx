import { chainOrder } from './chain';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildEdgeGeometry } from '../../server/src/engine/meshEdges';
import { api, type Snapshot, type Sketch, type SketchCurve, type TimelineItem, type Vec2, type Vec3 } from './api';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { Browser } from './Browser';
import { canPick, download, extOf, FORGE_TYPE, MODEL_TYPE, pickOpenFile, pickSaveHandle, stripExt, typeForExt, writeHandle, type Handle } from './files';
import { Icon } from './icons';
import { Ribbon } from './Ribbon';
import { Timeline } from './Timeline';
import { ViewCube } from './ViewCube';
import { Viewport, type FacePick } from './Viewport';
import { normalOf, toWorld } from './sketch/plane';
import { findRegions, pointInPolygon } from './sketch/regions';
import { segmentsTouchBox } from './sketch/box';
import { lineChain, offsetChain, sideDistance } from './sketch/offsetChain';
import { UpdateBadge, UpdatesDialog, useUpdates } from './Updates';
import { curvePoints } from './sketch/loops';
import { OPEN_ON_DRAG, PICK_MODE, applyTyped, constraintStep, dimensionFor, isDraw, onClick, sizeFields, type Tool } from './sketch/tools';
import { pickEntity, type Picked } from './sketch/pick';
import { inwardBisector } from './edgeDir';
import { describe as describeItem, measureOne, measureTwo, type MeasureItem } from './measure';
import type { EdgeRef, Mode, PlanePick, ProfileRef, ViewApi } from './ui';

const EMPTY: Snapshot = { doc: { name: 'Untitled', dirty: false }, bodies: [], parameters: [], timeline: [], marker: 0, stamp: '', sketches: [], ms: 0, warnings: [] };
const MOD_DEFAULT: Record<ModTool, string> = { fillet: '2', chamfer: '1', presspull: '0', shell: '2', offsetface: '0', draft: '5', hole: '5', thread: '', mirror: '', rpattern: '', cpattern: '', combine: '', move: '', split: '', scale: '', coil: '', meshconv: '' };
/** The dialog's axis choice as the engine's `axis` parameter: a sketch axis (x, y), a sketch line's id, or a world axis (X, Y, Z). */
const axisParam = (v: string) => v.slice(v.indexOf(':') + 1);
const EXT_TITLE: Record<ExtKind, string> = { extrude: 'EXTRUDE', revolve: 'REVOLVE', sweep: 'SWEEP', loft: 'LOFT', rib: 'RIB', pipe: 'PIPE', emboss: 'EMBOSS' };
/** The bodies already chosen when a body tool opens: the only body, the body of a selected face, or for Combine the second of two bodies (the first is the target). */
const initialBodies = (t: ModTool, names: string[], picked: string | undefined): string[] => {
  if (!BODY_TOOLS.includes(t)) return [];
  if (t === 'meshconv') return names.length === 1 ? [names[0]!] : picked && names.includes(picked) ? [picked] : []; // `names` are the mesh bodies only
  if (t === 'combine') return names.length === 2 ? [names[1]!] : picked && picked !== names[0] ? [picked] : [];
  return names.length === 1 ? [names[0]!] : picked ? [picked] : [];
};
const holePos = (p: readonly number[]) => ({ x: String(+p[0]!.toFixed(2)), y: String(+p[1]!.toFixed(2)), z: String(+p[2]!.toFixed(2)) });
const MOD_TITLE: Record<ModTool, string> = { fillet: 'FILLET', chamfer: 'CHAMFER', shell: 'SHELL', presspull: 'PRESS PULL', offsetface: 'OFFSET FACE', draft: 'DRAFT', hole: 'HOLE', thread: 'THREAD', mirror: 'MIRROR', rpattern: 'RECTANGULAR PATTERN', cpattern: 'CIRCULAR PATTERN', combine: 'COMBINE', move: 'MOVE / COPY', split: 'SPLIT BODY', scale: 'SCALE', coil: 'COIL', meshconv: 'MESH TO SOLID' };
const HINT: Record<string, string> = {
  pickPlane: 'Select an origin plane or a flat face of a body to sketch on. Esc cancels.',
  extrude: 'Select the profiles to extrude, set the distance, then OK. Esc cancels.',
  modify: 'Click the edges to round or bevel (click again to deselect), set the size, then OK. Esc cancels.',
  mirror: 'Click the body to mirror (click again to deselect), choose the plane, then OK. Esc cancels.',
  rpattern: 'Click the body to repeat, choose the direction, count and spacing, then OK. Esc cancels.',
  cpattern: 'Click the body to repeat, choose the axis, count and angle, then OK. Esc cancels.',
  shell: 'Click the face(s) to leave open (click again to deselect), set the wall thickness, then OK. Esc cancels.',
  offsetface: 'Click the face(s) to move (click again to deselect), type the distance (positive moves them out), then OK. Esc cancels.',
  draft: 'Click the wall face(s) to tilt, choose the neutral plane (the level that stays put), type the angle, then OK. Esc cancels.',
  hole: 'Click the face to drill in (the position can be typed), set the diameter and depth, then OK. Esc cancels.',
  thread: 'Click the round wall of a hole or boss, choose the thread size, then OK. Esc cancels.',
  scale: 'Click the body to scale, type the factor, choose what it scales about, then OK. Esc cancels.',
  coil: 'Set the size of the coil and where it starts, then OK. Esc cancels.',
  move: 'Click the body to move or copy, type how far and how much to turn it, then OK. Esc cancels.',
  meshconv: 'Click the mesh to convert (an imported STL, OBJ or 3MF), check the tolerance, then OK. Esc cancels.',
  split: 'Click the body to split, choose the plane to cut along, then OK. Esc cancels.',
  combine: 'Pick the target below, click the body or bodies to combine with it, choose the operation, then OK. Esc cancels.',
  presspull: 'Click a face, then type how far to push (negative) or pull (positive), then OK. Esc cancels.',
};
/** Status-bar help for a sketch tool, by how many points are already placed (or picked). */
const TOOL_HINT: Record<string, string[]> = {
  dimension: ['Click a line, circle, arc or point to dimension it (click a dimensioned one to change it). Esc ends the tool.', 'Click another line for an angle, a point or line for a distance, or type the value. Esc cancels.'],
  line: ['Click the start point.', 'Click the next point, or type a length. Right-click or Esc ends the line.'],
  rect: ['Click the first corner.', 'Click the opposite corner, or type width,height.'],
  rectCenter: ['Click the centre.', 'Click a corner, or type width,height.'],
  circle: ['Click the centre.', 'Click to set the size, or type a diameter.'],
  circle2: ['Click one end of the diameter.', 'Click the other end, or type a diameter.'],
  arc3: ['Click the start point.', 'Click the end point.', 'Click a point the arc passes through.'],
  slot: ['Click the centre of the first end.', 'Click the centre of the other end.', 'Click to set the width, or type it.'],
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
type ExtKind = 'extrude' | 'revolve' | 'sweep' | 'loft' | 'rib' | 'pipe' | 'emboss';
type ModTool = 'fillet' | 'chamfer' | 'presspull' | 'shell' | 'offsetface' | 'draft' | 'hole' | 'thread' | 'mirror' | 'rpattern' | 'cpattern' | 'combine' | 'move' | 'split' | 'scale' | 'coil' | 'meshconv';
const AXIS_COLOR = { mx: '#e5484d', my: '#3fb950', mz: '#4c8dff' } as const; // X red, Y green, Z blue, as in most CAD programs
const BODY_TOOLS: ModTool[] = ['mirror', 'rpattern', 'cpattern', 'combine', 'move', 'split', 'scale', 'meshconv']; // pick whole bodies
const FACE_TOOLS: ModTool[] = ['presspull', 'shell', 'offsetface', 'draft', 'hole', 'thread']; // pick faces
const ONE_FACE: ModTool[] = ['presspull', 'hole', 'thread']; // these work on a single face: a new click replaces the pick
const VALUE_LABEL: Record<ModTool, string> = { fillet: 'Radius', chamfer: 'Distance', presspull: 'Distance', shell: 'Thickness', offsetface: 'Distance', draft: 'Angle', hole: 'Diameter', thread: '', mirror: '', rpattern: '', cpattern: '', combine: '', move: '', split: '', scale: '', coil: '', meshconv: '' };
const AXIS_VEC: Record<string, [number, number, number]> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
/** Mirror, Rectangular Pattern and Circular Pattern work on whole bodies; their settings live here. */
type BodyForm = { plane: 'XY' | 'XZ' | 'YZ'; combine: boolean; dir1: string; count1: string; spacing1: string; dir2: string; count2: string; spacing2: string; axis: string; count: string; angle: string; neutral: 'XY' | 'XZ' | 'YZ' | 'bottom' | 'top'; target: string; keep: boolean; cop: 'join' | 'cut' | 'intersect'; mx: string; my: string; mz: string; rotAxis: 'none' | 'X' | 'Y' | 'Z'; rotAngle: string; copy: boolean; step: string; splitAxis: 'X' | 'Y' | 'Z'; splitPos: string; scaleFactor: string; scaleUneven: boolean; sx: string; sy: string; sz: string; scaleAbout: 'origin' | 'center'; tol: string };
/** The Coil dialog. */
type CoilForm = { diameter: string; turns: string; height: string; pitch: string; size: string; section: 'circular' | 'square'; axis: 'X' | 'Y' | 'Z'; bx: string; by: string; bz: string; op: 'new' | 'join' | 'cut' };
const COIL_FORM: CoilForm = { diameter: '20', turns: '4', height: '30', pitch: '', size: '3', section: 'circular', axis: 'Z', bx: '0', by: '0', bz: '0', op: 'new' };
/** The Hole dialog (create and edit) and the Thread dialog. */
type HoleForm = { x: string; y: string; z: string; depth: string; type: 'simple' | 'counterbore' | 'countersink'; cbd: string; cbh: string; csd: string; csa: string };
const HOLE_FORM: HoleForm = { x: '', y: '', z: '', depth: '', type: 'simple', cbd: '10', cbh: '3', csd: '10', csa: '90' };
type ThreadForm = { designation: string; length: string; modeled: boolean };
const BODY_FORM: BodyForm = { plane: 'YZ', combine: false, dir1: 'X', count1: '3', spacing1: '20', dir2: 'none', count2: '2', spacing2: '20', axis: 'Z', count: '4', angle: '360', neutral: 'bottom', target: '', keep: false, cop: 'join', mx: '0', my: '0', mz: '0', rotAxis: 'none', rotAngle: '90', copy: false, step: '10', splitAxis: 'X', splitPos: '0', scaleFactor: '2', scaleUneven: false, sx: '1', sy: '1', sz: '1', scaleAbout: 'center', tol: '0.05' };
type ExtrudeForm = { distance: string; direction: 'one' | 'rev' | 'sym'; operation: 'new' | 'join' | 'cut' | 'intersect'; axis: string; angle: string; path: string; thickness: string; depth: string; flip: boolean; ribSketch: string; pipeSketch: string; pipeDia: string; pipeWall: string; embossMode: 'emboss' | 'deboss' };
/** The engine names the operation `new_body` in a feature's definition and `new` in the command. */
const opFromDef = (o?: string): ExtrudeForm['operation'] => (o === 'join' || o === 'cut' || o === 'intersect' ? o : 'new');
const opToDef = (o: ExtrudeForm['operation']) => (o === 'new' ? 'new_body' : o);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

function loadTheme(): string { try { return localStorage.getItem('forge-theme') ?? 'dark'; } catch { return 'dark'; } }
const lengthOf = (c: SketchCurve) => c.type === 'line' && c.start && c.end ? Math.hypot(c.end[0] - c.start[0], c.end[1] - c.start[1]) : c.type === 'circle' ? 2 * (c.radius ?? 0) : (c.radius ?? 0);
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export const polyArea = (p: Vec2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const SHORTCUTS: [string, [string, string][]][] = [
  ['Anywhere', [['Ctrl+Z', 'Undo'], ['Ctrl+Y  or  Ctrl+Shift+Z', 'Redo'], ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save As'], ['Ctrl+O', 'Open'], ['Esc', 'Cancel the dialog, tool or selection'], ['Enter', 'OK in a dialog'], ['?', 'This list']]],
  ['Solid', [['E', 'Extrude (click a shape first, or pick it in the dialog)'], ['F', 'Fillet'], ['Q', 'Press Pull'], ['H', 'Hole'], ['M', 'Move / Copy'], ['Delete', 'Delete the selected timeline step']]],
  ['Sketch', [['L', 'Line'], ['R', 'Rectangle'], ['C', 'Circle'], ['A', 'Arc'], ['T', 'Trim'], ['O', 'Offset'], ['D', 'Sketch Dimension'], ['X', 'Toggle construction line'], ['Delete', 'Delete the selected curves'], ['Type a number', 'Set the size of the shape being drawn'], ['Tab', 'Next size box'], ['Enter', 'Place the shape']]],
  ['Mouse', [['Wheel', 'Zoom toward the pointer'], ['Middle drag', 'Pan'], ['Shift + middle drag', 'Orbit'], ['Right click', 'Actions menu for what is under the pointer'], ['Drag (drawing tool)', 'Draw corner to corner'], ['Double-click a timeline step', 'Edit it'], ['Drag the arrow', 'Set the distance (Press Pull, Extrude)']]],
];
function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <div className="modalback" onPointerDown={onClose}>
      <div className="dialog shortcuts" data-testid="shortcuts-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="dhead">KEYBOARD SHORTCUTS AND MOUSE</div>
        <div className="keycols">
          {SHORTCUTS.map(([title, rows]) => (
            <div key={title}><h4>{title}</h4>{rows.map(([k, d]) => <div className="keyrow" key={k + d}><kbd>{k}</kbd><span>{d}</span></div>)}</div>
          ))}
        </div>
        <div className="dbtns"><button className="primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

/** The rows of the Coil dialog (no picking: it is made from numbers). */
function CoilFields({ cf, setCf, hasBodies, onEnter }: { cf: CoilForm; setCf: (f: CoilForm) => void; hasBodies: boolean; onEnter(): void }) {
  const text = (label: string, key: keyof CoilForm, placeholder?: string) => (
    <label className="drow"><span>{label}</span><input aria-label={`Coil ${label.toLowerCase()}`} type="text" placeholder={placeholder} value={cf[key]} onChange={(e) => setCf({ ...cf, [key]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }} /></label>);
  return <>
    {text('Diameter', 'diameter')}{text('Turns', 'turns', 'blank to use pitch')}{text('Height', 'height', 'blank to use pitch')}{text('Pitch', 'pitch', 'blank to use turns and height')}{text('Section size', 'size')}
    <label className="drow"><span>Section</span><select aria-label="Coil section" value={cf.section} onChange={(e) => setCf({ ...cf, section: e.target.value as CoilForm['section'] })}><option value="circular">Circular</option><option value="square">Square</option></select></label>
    <label className="drow"><span>Axis</span><select aria-label="Coil axis" value={cf.axis} onChange={(e) => setCf({ ...cf, axis: e.target.value as CoilForm['axis'] })}><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
    {text('Start X', 'bx')}{text('Start Y', 'by')}{text('Start Z', 'bz')}
    <label className="drow"><span>Operation</span><select aria-label="Coil operation" value={hasBodies ? cf.op : 'new'} disabled={!hasBodies} onChange={(e) => setCf({ ...cf, op: e.target.value as CoilForm['op'] })}><option value="new">New Body</option><option value="join">Join</option><option value="cut">Cut</option></select></label>
    <div className="dnote">Give exactly two of Turns, Height and Pitch (leave the third empty). The coil winds about the axis from the start point; Section size is the wire's diameter (or side).</div>
  </>;
}

/** The rows of the Mirror and Pattern dialogs. */
function BodyFields({ tool, bf, setBf, bodies, allBodies, target, onEnter }: { tool: ModTool; bf: BodyForm; setBf: (f: BodyForm) => void; bodies: string[]; allBodies: string[]; target: string; onEnter(): void }) {
  const text = (label: string, key: keyof BodyForm) => (
    <label className="drow"><span>{label}</span><input aria-label={label} type="text" value={bf[key] as string} onChange={(e) => setBf({ ...bf, [key]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }} /></label>);
  const pick = (label: string, key: keyof BodyForm, opts: [string, string][]) => (
    <label className="drow"><span>{label}</span><select aria-label={label} value={bf[key] as string} onChange={(e) => setBf({ ...bf, [key]: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>);
  const dirs: [string, string][] = [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']];
  return <>
    {tool === 'combine' && pick('Target', 'target', allBodies.map((n) => [n, n] as [string, string]))}
    <div className="drow"><span>{tool === 'combine' ? 'Tools' : 'Bodies'}</span><b data-testid="edge-count">{(tool === 'combine' ? bodies.filter((n) => n !== target) : bodies).join(', ') || 'Select a body'}</b></div>
    {tool === 'combine' && <>
      {pick('Operation', 'cop', [['join', 'Join'], ['cut', 'Cut'], ['intersect', 'Intersect']])}
      <label className="drow"><span>Keep tools</span><input aria-label="Keep tools" type="checkbox" checked={bf.keep} onChange={(e) => setBf({ ...bf, keep: e.target.checked })} /></label>
      <div className="dnote">Join merges the tool bodies into the target, Cut removes them from it, Intersect keeps only where they overlap. Keep tools leaves the tool bodies in place afterwards.</div></>}
    {tool === 'mirror' && <>
      {pick('Plane', 'plane', [['YZ', 'YZ (left / right)'], ['XZ', 'XZ (front / back)'], ['XY', 'XY (top / bottom)']])}
      <label className="drow"><span>Join</span><input aria-label="Join with original" type="checkbox" checked={bf.combine} onChange={(e) => setBf({ ...bf, combine: e.target.checked })} /></label>
      <div className="dnote">Makes a mirrored copy of the body on the other side of the plane (through the origin). Join merges the copy with the original when they touch.</div></>}
    {tool === 'scale' && <>
      {!bf.scaleUneven && text('Factor', 'scaleFactor')}
      <label className="drow"><span>Uneven</span><input aria-label="Different in X, Y and Z" type="checkbox" checked={bf.scaleUneven} onChange={(e) => setBf({ ...bf, scaleUneven: e.target.checked })} /></label>
      {bf.scaleUneven && <>{text('Factor X', 'sx')}{text('Factor Y', 'sy')}{text('Factor Z', 'sz')}</>}
      {pick('About', 'scaleAbout', [['center', 'The middle of the body'], ['origin', 'The origin']])}
      <div className="dnote">2 doubles the size, 0.5 halves it. Uneven scales X, Y and Z by different factors (a feature such as a round hole turns oval). Everything is in the model's millimetres.</div></>}
    {tool === 'move' && <>
      <label className="drow"><span>Step</span><select aria-label="Move step" value={bf.step} onChange={(e) => setBf({ ...bf, step: e.target.value })}>{['0.1', '1', '5', '10', '25', '100'].map((s) => <option key={s} value={s}>{s} mm</option>)}</select></label>
      {(['mx', 'my', 'mz'] as const).map((k) => { const n = (v: number) => String(+((Number(bf[k]) || 0) + v).toFixed(4)); const st = Number(bf.step) || 1; return (
        <div className="drow axis" key={k}><span style={{ color: AXIS_COLOR[k] }}>{k[1]!.toUpperCase()}</span>
          <div className="stepper"><button type="button" aria-label={`${k[1]!.toUpperCase()} minus`} onClick={() => setBf({ ...bf, [k]: n(-st) })}>−</button>
            <input aria-label={`Move ${k[1]!.toUpperCase()}`} type="text" value={bf[k]} onChange={(e) => setBf({ ...bf, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }} />
            <button type="button" aria-label={`${k[1]!.toUpperCase()} plus`} onClick={() => setBf({ ...bf, [k]: n(st) })}>+</button></div></div>); })}
      {pick('Turn about', 'rotAxis', [['none', 'No turn'], ...dirs])}
      {bf.rotAxis !== 'none' && <div className="drow axis"><span>Angle</span>
        <div className="stepper"><button type="button" aria-label="Angle minus" onClick={() => setBf({ ...bf, rotAngle: String(+((Number(bf.rotAngle) || 0) - 15).toFixed(4)) })}>−</button>
          <input aria-label="Turn angle" type="text" value={bf.rotAngle} onChange={(e) => setBf({ ...bf, rotAngle: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }} />
          <button type="button" aria-label="Angle plus" onClick={() => setBf({ ...bf, rotAngle: String(+((Number(bf.rotAngle) || 0) + 15).toFixed(4)) })}>+</button></div></div>}
      <label className="drow"><span>Copy</span><input aria-label="Copy" type="checkbox" checked={bf.copy} onChange={(e) => setBf({ ...bf, copy: e.target.checked })} /></label>
      <div className="dnote">Drag the arrows on the body, or type or step the distances (mm). Turns are in 15° steps about a world axis.</div></>}
    {tool === 'meshconv' && <>
      {text('Tolerance (mm)', 'tol')}
      <div className="dnote">Rebuilds a closed mesh of a mechanical part as sketches and extrudes (real faces you can fillet, press pull and drill). It works on parts made of flat steps and straight or evenly leaning walls along one main direction (plates, lips, ribs, drafted walls, round and slotted holes, rounded corners), with holes, countersinks and bosses across it. Sculpted shapes, spheres and walls that lean unevenly are refused, and nothing is changed. Ctrl+Z takes it all back at once. A smaller tolerance follows the mesh more closely.</div></>}
    {tool === 'split' && <>
      {pick('Cut across', 'splitAxis', [['X', 'X (a plane at x = position)'], ['Y', 'Y (a plane at y = position)'], ['Z', 'Z (a plane at z = position)']])}
      {text('Position', 'splitPos')}
      <div className="dnote">Cuts the body into two bodies along the plane. The plane has to pass through the body.</div></>}
    {tool === 'rpattern' && <>
      {pick('Direction', 'dir1', dirs)}{text('Count', 'count1')}{text('Spacing', 'spacing1')}
      {pick('Direction 2', 'dir2', [['none', 'None'], ...dirs])}
      {bf.dir2 !== 'none' && <>{text('Count 2', 'count2')}{text('Spacing 2', 'spacing2')}</>}
      <div className="dnote">The count includes the original; spacing is from one copy to the next (negative goes the other way).</div></>}
    {tool === 'cpattern' && <>
      {pick('Axis', 'axis', dirs)}{text('Count', 'count')}{text('Angle', 'angle')}
      <div className="dnote">Copies are spread round a world axis through the origin; the count includes the original. 360 spreads them evenly round the full circle.</div></>}
  </>;
}

export function App() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [mode, setMode] = useState<Mode>('model');
  const [tool, setTool] = useState<Tool | null>(null);
  const [pending, setPending] = useState<Vec2[]>([]);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [typed, setTyped] = useState('');
  const [offsetPick, setOffsetPick] = useState<string | null>(null); // Offset: the curve being offset; the pointer sets the distance until a click
  const offsetRef = useRef<HTMLInputElement>(null);
  const [typed2, setTyped2] = useState(''); // the second box (height, angle) of the typed sizes
  const [sizes, setSizes] = useState<string[]>(['', '']); // what is typed into the boxes on the shape being drawn
  const [offsetTouched, setOffsetTouched] = useState(false); // the Offset box shows what was typed (even nothing) once it has been edited, else the live distance
  const clearTyped = () => { setTyped(''); setTyped2(''); setSizes(['', '']); setOffsetTouched(false); };
  const [edit, setEdit] = useState<{ title: string; value: string; submit(v: string, option?: string): void; options?: string[]; option?: string; valueFor?(option: string): string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selTl, setSelTl] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: TimelineItem } | null>(null);
  /** A mesh just imported: the file decides where it sits, so the owner is asked whether to bring it to the origin. */
  const [placeImport, setPlaceImport] = useState<{ names: string[]; centre: Vec3; low: number } | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; label?: string; ok(): void } | null>(null);
  const [modTool, setModTool] = useState<ModTool>('fillet');
  const [edgesSel, setEdgesSel] = useState<EdgeRef[]>([]);
  const [facesSel, setFacesSel] = useState<FacePick[]>([]); // Press Pull: one face; Shell: the faces to open
  const [modValue, setModValue] = useState('2');
  const [bodiesSel, setBodiesSel] = useState<string[]>([]); // Mirror and the patterns: the bodies to copy
  const [bf, setBf] = useState<BodyForm>(BODY_FORM);
  const [hf, setHf] = useState<HoleForm>(HOLE_FORM);
  const [cf, setCf] = useState<CoilForm>(COIL_FORM);
  const [tf, setTf] = useState<ThreadForm>({ designation: '', length: '', modeled: false });
  const [valueEdit, setValueEdit] = useState<{ name: string; key: string } | null>(null); // Fillet, Chamfer, Shell, Offset Face, Draft: only the number of an existing step is edited
  const [holeEdit, setHoleEdit] = useState<string | null>(null); // the name of the Hole feature being edited
  const [modBase, setModBase] = useState<Snapshot | null>(null); // the model when Fillet or Chamfer was opened: edges are picked on this, not on the preview
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number } | null>(null);
  const [viewMenu, setViewMenu] = useState<{ x: number; y: number } | null>(null); // the right-click actions menu in the view
  const [showKeys, setShowKeys] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const upd = useUpdates();
  const [notice, setNotice] = useState('');
  const fileHandle = useRef<Handle | null>(null); // the file Save writes back to (Chrome and Edge)
  /** Set while an existing extrude is open in the dialog: `key` is the profiles it had, to tell whether they changed. */
  const [editing, setEditing] = useState<{ name: string; key: string } | null>(null);
  const [picks, setPicks] = useState<Picked[]>([]);
  const [sel, setSel] = useState<FacePick | null>(null);
  const [profiles, setProfiles] = useState<ProfileRef[]>([]);
  const [ext, setExt] = useState<ExtrudeForm>({ distance: '0', direction: 'one', operation: 'new', axis: 'axis:y', angle: '360', path: '', thickness: '3', depth: '8', flip: false, ribSketch: '', pipeSketch: '', pipeDia: '6', pipeWall: '', embossMode: 'emboss' });
  const [extKind, setExtKind] = useState<ExtKind>('extrude'); // Revolve, Sweep and Loft share the Extrude dialog: profiles first, then what each needs
  const [hiddenBodies, setHiddenBodies] = useState<Set<string>>(new Set());
  const [hiddenSketches, setHiddenSketches] = useState<Set<number>>(new Set());
  const [showOrigin, setShowOrigin] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showDims, setShowDims] = useState(true); // the sizes shown on a sketch (Sketch Palette > Dimensions)
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
    else if (!activeSketch && mode === 'sketch') { setMode('model'); setTool(null); setPending([]); setEdit(null); clearTyped(); setSelected([]); setPicks([]); }
  }, [activeSketch, mode]);
  useEffect(() => { setSelTl((id) => (id !== null && snap.timeline.some((t) => t.id === id) ? id : null)); }, [snap]);
  useEffect(() => { setSel((p) => (p && snap.bodies.find((b) => b.name === p.body)?.faces.some((f) => f.index === p.face) ? p : null)); }, [snap]);

  // ---- sketching
  const chooseTool = (t: Tool | null) => { setOffsetPick(null); setTool(t); setPending([]); clearTyped(); setEdit(null); setPicks([]); if (t) setSelected([]); setError(''); };
  const applyResult = (r: ReturnType<typeof onClick>) => {
    setError(r.message ?? '');
    setPending(r.pending);
    clearTyped();
    if (r.steps.length) { void run(() => api.batch(r.steps)).then((s) => { if (!s) setPending([]); }); if (r.pending.length === 0) setTool(null); }
  };
  const numOrExpr = (v: string): number | string => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) ? n : v.trim(); };
  const send = (steps: { command: string; params: Record<string, unknown> }[]) => { void run(() => api.batch(steps)); };
  /** Rubber band in a sketch: dragged left to right selects the curves that lie wholly inside, right to left every curve the box touches. */
  const sketchBox = (a: Vec2, b: Vec2, crossing: boolean, additive: boolean) => {
    const sk = activeSketch; if (!sk) return;
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const inside = (p: Vec2) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const hits = sk.curves.filter((c) => { const pts = curvePoints(c); return pts.length > 0 && (crossing ? pts.some(inside) || segmentsTouchBox(pts, x0, y0, x1, y1) : pts.every(inside)); }).map((c) => c.id);
    setProfiles([]);
    setSelected((cur) => (additive ? [...cur, ...hits.filter((i) => !cur.includes(i))] : hits));
  };
  const sketchClick = (pt: Vec2, tol: number, additive: boolean) => {
    const sk = activeSketch; if (!sk) return;
    if (isDraw(tool)) { applyResult(onClick(tool, pending, pending.length ? applyTyped(tool, pending, pt, sizes) : pt)); return; } // typed sizes hold when the shape is placed by a click
    if (tool === 'offset' && offsetPick) { commitOffset(); return; }
    const hit = pickEntity(sk, pt, tol, tool ? PICK_MODE[tool] : 'curve');
    if (!tool && !hit) { // not on a curve: a closed shape under the pointer is selected instead (Shift adds), then E extrudes it
      const rg = findRegions(sk.curves, sk.profiles).filter((r) => pointInPolygon(pt, r.outer) && !r.holes.some((h) => pointInPolygon(pt, h))).sort((x, y) => Math.abs(polyArea(x.outer)) - Math.abs(polyArea(y.outer)))[0];
      if (rg) { const pr = sk.profiles.find((q) => q.index === rg.index); if (pr) { profilePicked(sk.id, pr.index, pr.centroid, additive); return; } }
      if (!additive) { setSelected([]); setProfiles([]); }
      return;
    }
    if (!tool) { // no tool: select curves (Shift adds), then Delete removes them or X makes them construction lines
      setProfiles([]);
      setSelected((cur) => (!hit ? (additive ? cur : []) : additive ? (cur.includes(hit.id) ? cur.filter((i) => i !== hit.id) : [...cur, hit.id]) : [hit.id]));
      return;
    }
    if (!hit) { setError(''); return; }
    setError('');
    switch (tool) {
      case 'dimension': dimClick(sk, hit); break;
      case 'trim': send([{ command: 'sketch.trim', params: { curve: hit.id, at: pt } }]); break;
      case 'extend': send([{ command: 'sketch.extend', params: { curve: hit.id, at: pt } }]); break;
      case 'offset': setOffsetPick(hit.id); clearTyped(); break; // the pointer now sets the distance; a click places it
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
  const showSize = (x: number | undefined) => (x === undefined ? '' : String(Math.round(x * 100) / 100));
  /** Dragging a point or curve in an open sketch (no tool): each step is sent to the engine as a live move, and the release closes the drag. Dragging a circle's edge changes its size; drag its centre to move it. */
  const dragRef = useRef<{ ent: Picked; start: Vec2; pending: Vec2 | null; running: boolean; applied: boolean } | null>(null);
  const pumpDrag = () => {
    const d = dragRef.current; if (!d || d.running || !d.pending) return;
    const to = d.pending; d.pending = null; d.running = true;
    // one history step at all times: the previous frame is taken back and the move is made again from where the drag began, so one Ctrl+Z undoes the whole drag
    void run(async () => { if (d.applied) { await api.undo(); d.applied = false; } const sn = await api.command('sketch.drag', { entity: d.ent.id, from: d.start, to }); d.applied = true; return sn; }).then(() => { d.running = false; pumpDrag(); });
  };
  const entityDrag = (phase: 'start' | 'move' | 'end', ent: Picked, from: Vec2, to: Vec2) => {
    if (phase === 'start') { dragRef.current = { ent, start: from, pending: null, running: false, applied: false }; setSelected([ent.id]); setProfiles([]); return; }
    const d = dragRef.current; if (!d) return;
    if (phase === 'move') { d.pending = to; pumpDrag(); return; }
    void (async () => { for (let i = 0; i < 200 && (d.running || d.pending); i++) await new Promise((r) => setTimeout(r, 25)); dragRef.current = null; })();
  };
  /** Press, drag, release with a drawing tool: the same as clicking the two corners. */
  /** Offset: the signed distance the pointer sets from the picked curve. Positive is to the left of a line's direction and inside a circle or arc, as the engine does it. */
  const offsetCurve = activeSketch?.curves.find((c) => c.id === offsetPick);
  const offsetLines = useMemo(() => (offsetPick && activeSketch ? lineChain(activeSketch.curves, offsetPick) : null), [offsetPick, activeSketch]); // the lines joined to the picked one move together
  const liveOffset = (): number | null => {
    const c = offsetCurve, q = cursor; if (!c || !q) return null;
    if (offsetLines) return sideDistance(offsetLines, q);
    if (c.type === 'line' && c.start && c.end) { const dx = c.end[0] - c.start[0], dy = c.end[1] - c.start[1], l = Math.hypot(dx, dy); return l < 1e-9 ? null : (dx * (q[1] - c.start[1]) - dy * (q[0] - c.start[0])) / l; }
    if ((c.type === 'circle' || c.type === 'arc') && c.center && c.radius !== undefined) return c.radius - Math.hypot(q[0] - c.center[0], q[1] - c.center[1]);
    return null;
  };
  const offsetValue = (): number | string | null => { const t = typed.trim(); if (t !== '') return numOrExpr(t); const d = liveOffset(); return d === null ? null : Math.round(d * 10) / 10; };
  const commitOffset = () => {
    const d = offsetValue();
    if (offsetPick === null || d === null || d === 0) { setError('Move the pointer to one side of the curve, or type a distance'); return; }
    // the pointer says which side (`side`), the number only how far: a negative number typed goes the other way. Offsetting the whole outline needs no sign guessing this way.
    const away = typeof d === 'number' ? d < 0 && typed.trim() !== '' : /^\s*-/.test(String(d));
    const dist = typeof d === 'number' ? Math.abs(d) : String(d).replace(/^\s*-\s*/, '');
    send([{ command: 'sketch.offset', params: { curves: [offsetPick], distance: dist, chain: true, ...(cursor ? { side: cursor } : {}), ...(away ? { flip: true } : {}) } }]);
    setOffsetPick(null); clearTyped();
  };
  const offsetOutline = useMemo((): Vec2[][] => {
    const c = offsetCurve, d = typed.trim() !== '' && Number.isFinite(Number(typed)) ? Number(typed) * (offsetLines && cursor ? Math.sign(sideDistance(offsetLines, cursor)) || 1 : 1) : liveOffset(); // eslint-disable-line react-hooks/exhaustive-deps
    if (!c || d === null || d === 0) return [];
    if (offsetLines) return [offsetChain(offsetLines, d)];
    if (c.type === 'line' && c.start && c.end) { const dx = c.end[0] - c.start[0], dy = c.end[1] - c.start[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * d, ny = (dx / l) * d; return [[[c.start[0] + nx, c.start[1] + ny], [c.end[0] + nx, c.end[1] + ny]]]; }
    if (c.type === 'circle' && c.center && c.radius !== undefined) { const r = c.radius - d; return r > 0 ? [Array.from({ length: 65 }, (_, i) => [c.center![0] + r * Math.cos((i / 64) * Math.PI * 2), c.center![1] + r * Math.sin((i / 64) * Math.PI * 2)] as Vec2)] : []; }
    return [];
  }, [offsetCurve, offsetLines, cursor, typed]); // eslint-disable-line react-hooks/exhaustive-deps
  const sketchDrag = (a: Vec2, b: Vec2) => {
    if (!isDraw(tool) || pending.length) return;
    const first = onClick(tool, [], a);
    if (OPEN_ON_DRAG.includes(tool as string)) { applyResult(first); return; } // the shape stays open under the pointer: adjust it, then click or type the size
    applyResult(onClick(tool, first.pending, b));
  };
  /** Sketches no feature has used yet: their closed shapes show in the model view and can be clicked, then E extrudes them. */
  const fillSketches = useMemo(() => {
    const ids = new Set<number>(); const items = snap.timeline;
    items.forEach((t, i) => { if (!/^sketch$/i.test(t.type)) return; const k = snap.sketches.find((q) => q.name === t.name); if (k && !k.active && !items.slice(i + 1).some((u) => !/^sketch$/i.test(u.type))) ids.add(k.id); });
    return ids;
  }, [snap.timeline, snap.sketches]);
  const submitTyped = () => {
    if (!isDraw(tool) || !pending.length) return;
    const cur = cursor ?? pending[pending.length - 1]!;
    applyResult(onClick(tool, pending, applyTyped(tool, pending, cur, sizes)));
  };
  const endChain = () => { setPending([]); clearTyped(); setTool((t) => (t === 'line' ? null : t)); };
  /** The Dimension tool: a circle or arc is sized at once; a line is sized at once, or a second pick makes an angle or a distance; two points make a distance. */
  const dimClick = (sk: Sketch, hit: Picked) => {
    const done = () => setPicks([]);
    const pointAt = (id: string) => sk.points.find((q) => q.id === id)?.at;
    const lineEnds = (id: string): [Vec2, Vec2] | null => { const c = sk.curves.find((x) => x.id === id); return c?.type === 'line' && c.start && c.end ? [c.start, c.end] : null; };
    const first = picks[0];
    if (!first) {
      if (hit.kind === 'point') { setPicks([hit]); return; }
      const c = sk.curves.find((x) => x.id === hit.id);
      if (!c) return;
      if (c.type === 'line') setPicks([hit]);
      curvePick(c, done);
      return;
    }
    if (first.id === hit.id) return;
    if (first.kind === 'curve' && hit.kind === 'curve') {
      const a = lineEnds(first.id), b = lineEnds(hit.id);
      if (!a || !b) { done(); setError('An angle needs two straight lines'); return; }
      const ang = (l: [Vec2, Vec2]) => Math.atan2(l[1][1] - l[0][1], l[1][0] - l[0][0]);
      let d = Math.abs(ang(a) - ang(b)) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
      setEdit({ title: `Angle between ${first.id} and ${hit.id} (degrees)`, value: fmt((d * 180) / Math.PI), submit: (v) => { done(); send([{ command: 'sketch.dimension', params: { entities: [first.id, hit.id], type: 'angle', value: numOrExpr(v) } }]); } });
      return;
    }
    const pt = first.kind === 'point' ? first : hit.kind === 'point' ? hit : null;
    const other = pt === first ? hit : first;
    const p = pt ? pointAt(pt.id) : undefined;
    if (!pt || !p) { done(); return; }
    if (other.kind === 'curve') {
      const l = lineEnds(other.id);
      if (!l) { done(); setError('Pick a straight line for a point-to-line distance'); return; }
      const dx = l[1][0] - l[0][0], dy = l[1][1] - l[0][1], len = Math.hypot(dx, dy) || 1;
      const dist = Math.abs((p[0] - l[0][0]) * dy - (p[1] - l[0][1]) * dx) / len;
      setEdit({ title: `Distance from ${pt.id} to ${other.id}`, value: fmt(dist), submit: (v) => { done(); send([{ command: 'sketch.dimension', params: { entities: [pt.id, other.id], type: 'distance', value: numOrExpr(v) } }]); } });
      return;
    }
    const q = pointAt(other.id);
    if (!q) { done(); return; }
    const valueFor = (o: string) => fmt(o === 'Horizontal' ? Math.abs(q[0] - p[0]) : o === 'Vertical' ? Math.abs(q[1] - p[1]) : Math.hypot(q[0] - p[0], q[1] - p[1]));
    const ids = [pt.id, other.id];
    setEdit({ title: `Distance between ${ids[0]} and ${ids[1]}`, value: valueFor('Aligned'), options: ['Aligned', 'Horizontal', 'Vertical'], option: 'Aligned', valueFor,
      submit: (v, o) => { done(); send([{ command: 'sketch.dimension', params: { entities: ids, type: o === 'Horizontal' ? 'horizontal' : o === 'Vertical' ? 'vertical' : 'distance', value: numOrExpr(v) } }]); } });
  };
  const curvePick = (c: SketchCurve, onDone?: () => void) => {
    const existing = activeSketch?.dimensions.find((d) => d.curve === c.id); // already dimensioned: edit that value instead of adding a second one
    const what = c.type === 'line' ? 'Length' : c.type === 'circle' ? 'Diameter' : 'Radius';
    setEdit({
      title: `${existing ? 'Change ' : ''}${what} of ${c.id}`, value: existing ? existing.expression : fmt(lengthOf(c)),
      submit: (v) => {
        onDone?.();
        if (existing) { void run(() => api.param(existing.param, v.trim())); return; }
        const step = dimensionFor(c, v);
        if (!step) setError('That curve cannot be dimensioned yet'); else send([step]);
      },
    });
  };
  /** A size label on the sketch was double-clicked and a value typed: change the driving dimension, or make one from the measured size. */
  const dimEdited = (curveId: string, text: string, param?: string) => {
    if (param) { void run(() => api.param(param, text.trim())); return; }
    const c = activeSketch?.curves.find((x) => x.id === curveId); if (!c) return;
    const existing = activeSketch?.dimensions.find((d) => d.curve === c.id);
    if (existing) { void run(() => api.param(existing.param, text.trim())); return; }
    const step = dimensionFor(c, text);
    if (!step) setError('That curve cannot be dimensioned yet'); else send([step]);
  };
  const deleteSelected = () => { if (selected.length) { const ids = selected; setSelected([]); send([{ command: 'sketch.delete', params: { entities: ids } }]); } };
  const toggleConstruction = () => { if (selected.length) send([{ command: 'sketch.construction', params: { curves: selected } }]); };

  const createSketch = async () => {
    if (mode === 'extrude') await cancelExtrude();
    else if (mode === 'modify') await cancelModify();
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
  const pickedSketch = snap.sketches.find((s) => s.id === profiles[0]?.sketch);
  const axisOptions = useMemo(() => [
    { value: 'axis:x', label: 'Sketch X axis' }, { value: 'axis:y', label: 'Sketch Y axis' },
    ...(pickedSketch?.curves ?? []).filter((c) => c.type === 'line').map((c) => ({ value: `line:${c.id}`, label: `${c.construction ? 'Construction line' : 'Line'} ${c.id}` })),
    { value: 'world:X', label: 'World X axis' }, { value: 'world:Y', label: 'World Y axis' }, { value: 'world:Z', label: 'World Z axis' },
  ], [pickedSketch]);
  /** Sweep: any other sketch with lines or arcs can be the path; the choice falls back to the first one. */
  const pathOptions = useMemo(() => snap.sketches.filter((s) => s.id !== profiles[0]?.sketch && s.curves.some((c) => !c.construction)).map((s) => ({ value: String(s.id), label: s.name })), [snap.sketches, profiles]);
  const pathChoice = pathOptions.some((o) => o.value === ext.path) ? ext.path : pathOptions[0]?.value ?? '';
  /** Rib: any sketch with a line in it can be the rib's centre line. */
  const ribOptions = useMemo(() => snap.sketches.filter((s) => s.curves.some((c) => !c.construction && c.type === 'line')).map((s) => ({ value: String(s.id), label: s.name })), [snap.sketches]);
  const ribChoice = ribOptions.some((o) => o.value === ext.ribSketch) ? ext.ribSketch : ribOptions[0]?.value ?? '';
  /** Pipe: a sketch with lines or arcs is the path. */
  const pipeOptions = useMemo(() => snap.sketches.filter((s) => s.curves.some((c) => !c.construction && (c.type === 'line' || c.type === 'arc'))).map((s) => ({ value: String(s.id), label: s.name })), [snap.sketches]);
  const pipeChoice = pipeOptions.some((o) => o.value === ext.pipeSketch) ? ext.pipeSketch : pipeOptions[0]?.value ?? '';
  const isEdgeTool = (t: ModTool) => !FACE_TOOLS.includes(t) && !BODY_TOOLS.includes(t) && t !== 'coil';
  const edgeSets = useMemo(() => (mode === 'modify' && isEdgeTool(modTool) && modBase ? modBase.bodies.map((b) => ({ body: b.name, edges: buildEdgeGeometry(b) })) : mode === 'model' ? snap.bodies.filter((b) => !b.mesh).map((b) => ({ body: b.name, edges: buildEdgeGeometry(b) })) : []), [mode, modTool, modBase, snap.bodies]);
  /** The arrow to drag in the view: Press Pull's face, or the extrude's profile. Its value is the dialog's distance. */
  const dragHandle = useMemo(() => {
    if (mode === 'modify' && (modTool === 'presspull' || modTool === 'offsetface') && facesSel[0] && !valueEdit) {
      const f = modBase?.bodies.find((b) => b.name === facesSel[0]!.body)?.faces.find((q) => q.index === facesSel[0]!.face);
      const n = Number(modValue); if (!f?.planeNormal || !Number.isFinite(n)) return null;
      return { origin: facesSel[0]!.point as Vec3, dir: f.planeNormal as Vec3, value: n, onChange: (x: number) => setModValue(String(+x.toFixed(2))), onSubmit: () => void okModify() };
    }
    if (mode === 'modify' && (modTool === 'fillet' || modTool === 'chamfer') && edgesSel[0] && !valueEdit) { // the radius (or distance) arrow sits on the first picked edge and points into the material
      const ref = edgesSel[0]!, g = edgeSets.find((x) => x.body === ref.body)?.edges.find((x) => x.index === ref.index), body = modBase?.bodies.find((b) => b.name === ref.body);
      const n = Number(modValue); if (!g?.faces || !body || !Number.isFinite(n)) return null;
      const dir = inwardBisector(body, g.faces, g.mid); if (!dir) return null;
      return { origin: g.mid as Vec3, dir, value: n, onChange: (x: number) => setModValue(String(Math.max(0.1, +x.toFixed(2)))), onSubmit: () => void okModify() };
    }
    if (mode === 'extrude' && extKind === 'extrude' && profiles[0]) {
      const sk = snap.sketches.find((q) => q.id === profiles[0]!.sketch); const n = Number(ext.distance);
      if (!sk || !Number.isFinite(n)) return null;
      const nrm = normalOf(sk.plane);
      let sgn = ext.direction === 'rev' ? -1 : 1;
      if (!editing && ext.operation === 'cut' && sgn === 1 && bodyCenter && dot3(sub3(bodyCenter, sk.plane.origin), nrm) < 0) sgn = -1; // a new cut goes into the body, as the step does
      return { origin: toWorld(sk.plane, profiles[0]!.at), dir: [nrm[0] * sgn, nrm[1] * sgn, nrm[2] * sgn] as Vec3, value: n, onChange: (x: number) => setExt((cur) => ({ ...cur, distance: String(+x.toFixed(2)) })), onSubmit: () => void okExtrude() };
    }
    return null;
  }, [mode, modTool, facesSel, edgesSel, edgeSets, valueEdit, modBase, modValue, extKind, profiles, snap.sketches, ext.distance, ext.direction, ext.operation, editing, bodyCenter]);
  /** Move: one arrow per axis on the chosen bodies, starting at the body's surface (dragging changes the move distance). */
  const moveHandles = useMemo(() => {
    if (mode !== 'modify' || modTool !== 'move' || valueEdit || !bodiesSel.length) return undefined;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of modBase?.bodies ?? []) if (bodiesSel.includes(b.name)) for (let i = 0; i < b.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k]!, b.positions[i]!); hi[k] = Math.max(hi[k]!, b.positions[i]!); }
    if (!Number.isFinite(lo[0]!)) return undefined;
    const c = lo.map((l, k) => (l + hi[k]!) / 2) as Vec3;
    const reach = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) * 0.35 + 10; // the arrows keep this length and travel with the body
    const shift = [Number(bf.mx) || 0, Number(bf.my) || 0, Number(bf.mz) || 0];
    return (['mx', 'my', 'mz'] as const).map((key, k) => {
      const dir: Vec3 = [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
      return { origin: [c[0] + shift[0]!, c[1] + shift[1]!, c[2] + shift[2]!] as Vec3, dir, base: (hi[k]! - lo[k]!) / 2 + 6, fixed: reach, value: Number(bf[key]) || 0, color: AXIS_COLOR[key], label: `Move ${key[1]!.toUpperCase()} arrow`, onChange: (x: number) => setBf((f) => ({ ...f, [key]: String(+x.toFixed(2)) })), onSubmit: () => void okModify() };
    });
  }, [mode, modTool, valueEdit, bodiesSel, modBase, bf.mx, bf.my, bf.mz]);
  const preview = useRef(false);
  const extrudeStep = (): { command: string; params: Record<string, unknown> } | null => {
    const first = profiles[0]; const d = ext.distance.trim();
    const sk = first && snap.sketches.find((s) => s.id === first.sketch);
    if (extKind === 'pipe') {
      const ps = snap.sketches.find((q) => String(q.id) === pipeChoice);
      const ids = ps ? chainOrder(ps.curves.filter((c) => !c.construction && (c.type === 'line' || c.type === 'arc'))) : [];
      const dia = Number(ext.pipeDia), wall = ext.pipeWall.trim();
      if (!ps || !ids.length || !(dia > 0) || (wall && !(Number(wall) > 0))) return null;
      return { command: 'solid.pipe', params: { path_sketch: ps.name, path: ids, diameter: dia, ...(wall ? { wall: Number(wall) } : {}), operation: ext.operation } };
    }
    if (extKind === 'emboss') {
      const dp = Number(ext.distance);
      if (!sk || !profiles.length || !(dp > 0)) return null;
      return { command: 'solid.emboss', params: { sketch: sk.name, profiles: profiles.map((r) => r.index), depth: dp, mode: ext.embossMode } };
    }
    if (extKind === 'rib') {
      const rs = snap.sketches.find((q) => String(q.id) === ribChoice);
      const ids = rs ? chainOrder(rs.curves.filter((c) => !c.construction && c.type === 'line')) : [];
      const th = Number(ext.thickness), dp = ext.depth.trim();
      if (!rs || !ids.length || !(th > 0) || (dp && !(Number(dp) > 0))) return null;
      return { command: 'solid.rib', params: { sketch: rs.name, curves: ids, thickness: th, ...(dp ? { depth: Number(dp) } : {}), flip: ext.flip } };
    }
    if (extKind === 'loft') {
      const secs = profiles.map((r) => ({ r, s: snap.sketches.find((q) => q.id === r.sketch) })).filter((x) => x.s);
      if (secs.length < 2) return null;
      return { command: 'solid.loft', params: { sections: secs.map(({ r, s }) => ({ sketch: s!.name, profiles: [r.index] })), operation: ext.operation } };
    }
    if (sk && extKind === 'sweep') {
      const ps = snap.sketches.find((q) => String(q.id) === pathChoice);
      const ids = ps ? chainOrder(ps.curves.filter((c) => !c.construction)) : [];
      if (!ps || !ids.length) return null;
      return { command: 'solid.sweep', params: { sketch: sk.name, profiles: profiles.map((r) => r.index), path_sketch: ps.name, path: ids, operation: ext.operation } };
    }
    if (sk && extKind === 'revolve') {
      const an = ext.angle.trim(), na = Number(an);
      if (!an || (Number.isFinite(na) && (na <= 0 || na > 360))) return null;
      return { command: 'solid.revolve', params: { sketch: sk.name, profiles: profiles.map((r) => r.index), axis: axisParam(ext.axis), angle: Number.isFinite(na) ? na : an, operation: ext.operation } };
    }
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
  const combineTarget = modBase?.bodies.some((b) => b.name === bf.target) ? bf.target : modBase?.bodies[0]?.name ?? '';
  const modifyStep = (): { command: string; params: Record<string, unknown> } | null => {
    const v = modValue.trim();
    if (modTool === 'meshconv') return null; // no live preview: it can take a while, so it runs when OK is pressed
    if (BODY_TOOLS.includes(modTool)) {
      if (!bodiesSel.length && modTool !== 'combine') return null;
      const num = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null);
      if (modTool === 'combine') {
        const tools = bodiesSel.filter((n) => n !== combineTarget);
        return tools.length ? { command: 'solid.combine', params: { target: combineTarget, tools, operation: bf.cop, keep_tools: bf.keep } } : null;
      }
      if (modTool === 'scale') {
        const f = bf.scaleUneven ? [bf.sx, bf.sy, bf.sz].map(num) : [num(bf.scaleFactor)];
        if (f.some((q) => q === null || q <= 0)) return null;
        let origin: number[] = [0, 0, 0];
        if (bf.scaleAbout === 'center') { // the middle of the chosen bodies' bounding box
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
          for (const b of modBase?.bodies ?? []) if (bodiesSel.includes(b.name)) for (let i = 0; i < b.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k]!, b.positions[i]!); hi[k] = Math.max(hi[k]!, b.positions[i]!); }
          if (!Number.isFinite(lo[0]!)) return null;
          origin = lo.map((l, k) => +((l + hi[k]!) / 2).toFixed(4));
        }
        return { command: 'solid.scale', params: { bodies: bodiesSel, origin, ...(bf.scaleUneven ? { factors: f } : { factor: f[0] }) } };
      }
      if (modTool === 'move') {
        const t = [bf.mx, bf.my, bf.mz].map(num), an = num(bf.rotAngle);
        if (t.some((q) => q === null) || (bf.rotAxis !== 'none' && an === null)) return null;
        const moves = t.some((q) => q !== 0), turns = bf.rotAxis !== 'none' && an !== 0;
        if (!moves && !turns) return null;
        return { command: 'solid.move', params: { bodies: bodiesSel, copy: bf.copy, ...(moves ? { translate: t } : {}), ...(turns ? { axis: AXIS_VEC[bf.rotAxis], angle: an } : {}) } };
      }
      if (modTool === 'split') {
        const at = num(bf.splitPos); if (at === null) return null;
        const n = AXIS_VEC[bf.splitAxis]!;
        return { command: 'solid.split_body', params: { body: bodiesSel[0], plane: { origin: n.map((c) => c * at), normal: n } } };
      }
      if (modTool === 'mirror') return { command: 'solid.mirror', params: { bodies: bodiesSel, plane: bf.plane, combine: bf.combine } };
      if (modTool === 'cpattern') {
        const n = num(bf.count), an = num(bf.angle);
        if (n === null || !Number.isInteger(n) || n < 2 || an === null || an === 0 || Math.abs(an) > 360) return null;
        return { command: 'solid.pattern.circular', params: { bodies: bodiesSel, axis: bf.axis, count: n, angle: an } };
      }
      const n1 = num(bf.count1), s1 = num(bf.spacing1);
      if (n1 === null || !Number.isInteger(n1) || n1 < 2 || s1 === null || s1 === 0) return null;
      const params: Record<string, unknown> = { bodies: bodiesSel, dir1: AXIS_VEC[bf.dir1], count1: n1, spacing1: Math.abs(s1), reversed: s1 < 0 };
      if (bf.dir2 !== 'none') {
        const n2 = num(bf.count2), s2 = num(bf.spacing2);
        if (n2 === null || !Number.isInteger(n2) || n2 < 2 || s2 === null || s2 === 0 || bf.dir2 === bf.dir1) return null;
        Object.assign(params, { dir2: AXIS_VEC[bf.dir2], count2: n2, spacing2: Math.abs(s2), reversed2: s2 < 0 });
      }
      return { command: 'solid.pattern.rectangular', params };
    }
    const n = Number(v), size: number | string = Number.isFinite(n) ? n : v;
    if (valueEdit) { // an existing step: its number only (the edges or faces it was made on stay)
      if (!v || (modTool === 'draft' ? !(Math.abs(size as number) < 89) || size === 0 : typeof size === 'number' && !(size > 0))) return null;
      return { command: 'timeline.edit', params: { feature: valueEdit.name, set: { [valueEdit.key]: modTool === 'draft' && typeof size === 'number' ? `${size} deg` : String(size) } } };
    }
    const pts = facesSel.map((f) => f.point.map((x) => +x.toFixed(3)));
    if (modTool === 'coil') {
      const n = (q: string) => (q.trim() !== '' && Number.isFinite(Number(q)) ? Number(q) : null);
      const given = [cf.turns, cf.height, cf.pitch].filter((q) => q.trim() !== '');
      const d = n(cf.diameter), sz = n(cf.size), base = [n(cf.bx), n(cf.by), n(cf.bz)];
      if (given.length !== 2 || given.some((q) => !(Number(q) > 0)) || !d || d <= 0 || !sz || sz <= 0 || base.some((q) => q === null)) return null;
      const bodies = modBase?.bodies.length ?? 0;
      return { command: 'solid.coil', params: { diameter: d, section_size: sz, section: cf.section, axis: cf.axis, base, ...(cf.turns.trim() ? { turns: Number(cf.turns) } : {}), ...(cf.height.trim() ? { height: Number(cf.height) } : {}), ...(cf.pitch.trim() ? { pitch: Number(cf.pitch) } : {}), operation: bodies || cf.op === 'new' ? cf.op : 'new' } };
    }
    if (modTool === 'hole') {
      if (!v || (typeof size === 'number' && !(size > 0))) return null;
      const pos = [hf.x, hf.y, hf.z].map((s) => (s.trim() === '' ? NaN : Number(s)));
      if (pos.some((q) => !Number.isFinite(q)) || (!holeEdit && !facesSel.length)) return null;
      const dep = hf.depth.trim();
      if (dep && !(Number(dep) > 0) && Number.isFinite(Number(dep))) return null;
      const kind = hf.type === 'counterbore' ? { type: 'counterbore', cb_diameter: hf.cbd, cb_depth: hf.cbh } : hf.type === 'countersink' ? { type: 'countersink', cs_diameter: hf.csd, cs_angle: hf.csa } : { type: 'simple' };
      if (holeEdit) return { command: 'timeline.edit', params: { feature: holeEdit, set: { diameter: String(size), depth: dep || null, position: pos, hole: kind } } };
      return { command: 'solid.hole', params: { position: pos, diameter: size, ...(dep ? { depth: Number.isFinite(Number(dep)) ? Number(dep) : dep } : {}), ...kind } };
    }
    if (modTool === 'thread') {
      if (!pts.length) return null;
      return { command: 'solid.thread', params: { face: pts[0], modeled: tf.modeled, ...(tf.designation.trim() ? { designation: tf.designation.trim() } : {}), ...(tf.length.trim() ? { length: Number.isFinite(Number(tf.length)) ? Number(tf.length) : tf.length.trim() } : {}) } };
    }
    if (modTool === 'offsetface') {
      if (!pts.length || !v || size === 0) return null;
      return { command: 'solid.offset_face', params: { faces: pts, distance: size } }; // positive moves the faces outward
    }
    if (modTool === 'draft') {
      const an = Number(v); if (!pts.length || !v || !Number.isFinite(an) || an === 0 || Math.abs(an) >= 89) return null;
      const b = modBase?.bodies.find((q) => q.name === facesSel[0]!.body); if (!b) return null;
      let neutral: unknown = bf.neutral;
      if (bf.neutral === 'bottom' || bf.neutral === 'top') { // the lowest or highest level of the body, as a plane across Z
        let lo = Infinity, hi = -Infinity; for (let i = 2; i < b.positions.length; i += 3) { lo = Math.min(lo, b.positions[i]!); hi = Math.max(hi, b.positions[i]!); }
        neutral = { origin: [0, 0, +(bf.neutral === 'bottom' ? lo : hi).toFixed(4)], normal: [0, 0, 1] };
      }
      return { command: 'solid.draft', params: { faces: pts, angle: an, neutral } };
    }
    if (modTool === 'presspull') {
      if (!pts.length || !v || size === 0) return null;
      return { command: 'solid.press_pull', params: { face: pts[0], distance: size } }; // positive adds material, negative cuts
    }
    if (modTool === 'shell') {
      if (!pts.length || !v || typeof size === 'number' && !(size > 0)) return null;
      return { command: 'solid.shell', params: { faces: pts, thickness: size, direction: 'inside' } };
    }
    if (!edgesSel.length || !v) return null;
    if (typeof size === 'number' && !(size > 0)) return null;
    return { command: modTool === 'fillet' ? 'solid.fillet' : 'solid.chamfer', params: { edges: edgesSel.map((e) => ({ body: e.body, index: e.index })), [modTool === 'fillet' ? 'radius' : 'distance']: size } };
  };
  const stepKey = JSON.stringify(mode === 'extrude' ? extrudeStep() : mode === 'modify' ? modifyStep() : null);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(); // OK must not be followed by a late preview of the same step (it would be a second undo step)
  const skipFirst = useRef(false); // opening an existing extrude must not "change" it to itself
  const baseKey = useRef('');
  useEffect(() => {
    if (mode !== 'extrude' && mode !== 'modify') return;
    if (skipFirst.current) { skipFirst.current = false; baseKey.current = stepKey; return; }
    const t = setTimeout(() => { void applyPreview(JSON.parse(stepKey)); }, 250);
    previewTimer.current = t;
    return () => clearTimeout(t);
  }, [mode, stepKey, applyPreview]);

  const startExtrude = async (kind: ExtKind = 'extrude') => {
    if (mode === 'extrude') {
      if (!editing && kind !== extKind) { await applyPreview(null); setExtKind(kind); if (kind !== 'loft') setProfiles((cur) => cur.filter((r) => r.sketch === cur[0]?.sketch)); } // only a loft takes profiles from several sketches
      return;
    }
    setExtKind(kind);
    if (mode === 'modify') await cancelModify();
    let s: Snapshot | null = snap;
    if (activeSketch) s = await finishSketch();
    if (!s) return;
    if (kind === 'extrude' && sel && !profiles.length) { await startModify('presspull'); return; } // a body face is selected: extruding it pushes or pulls that face, as in Fusion
    if (kind === 'pipe') {
      if (!s.sketches.some((k) => !k.active && k.curves.some((c) => !c.construction && (c.type === 'line' || c.type === 'arc')))) { setError('Draw the path first: lines or arcs in a sketch (Create Sketch); the pipe follows them'); return; }
      setProfiles([]); setExt((x) => ({ ...x, operation: s.bodies.length ? 'join' : 'new' })); chooseTool(null); setMode('extrude'); setError(''); return;
    }
    if (kind === 'rib') {
      if (!s.bodies.length) { setError('Make a body first: a rib grows from a line drawn across it'); return; }
      if (!s.sketches.some((k) => !k.active && k.curves.some((c) => !c.construction && c.type === 'line'))) { setError('Draw a line in a sketch across the body first (Create Sketch on a plane through it); the rib grows from the line'); return; }
      setProfiles([]); setExt((x) => ({ ...x, operation: 'join' })); chooseTool(null); setMode('extrude'); setError(''); return;
    }
    const done = s.sketches.filter((k) => !k.active && k.profiles.length);
    if (!done.length) { setError('Create a sketch with a closed shape first (Create Sketch)'); return; }
    const last = done[done.length - 1]!;
    const chosen = mode === 'model' || mode === 'sketch' ? profiles.filter((r) => s!.sketches.some((k) => k.id === r.sketch && !k.active && k.profiles.some((q) => q.index === r.index))) : []; // shapes clicked in the view before pressing E
    setProfiles(chosen.length ? chosen : kind === 'loft' ? [] : last.profiles.length === 1 ? [{ sketch: last.id, index: last.profiles[0]!.index, at: last.profiles[0]!.centroid }] : []);
    setExt((x) => ({ ...x, operation: s!.bodies.length ? 'join' : 'new', ...(kind === 'emboss' && extKind !== 'emboss' ? { distance: '2' } : kind !== 'emboss' && extKind === 'emboss' ? { distance: '0' } : kind !== 'emboss' && extKind !== 'emboss' && kind === 'extrude' ? { distance: '0' } : {}) })); // every distance starts at 0 (drag the arrow or type it); emboss at a shallow 2 mm
    chooseTool(null); setMode('extrude'); setError('');
  };
  /** A closed shape was clicked. In the Extrude family of dialogs each click adds or removes one; elsewhere (the model view, an open sketch) a click selects just that shape and Shift or Ctrl adds. */
  const profilePicked = (sketch: number, index: number, at: Vec2, additive = true) => {
    if (mode !== 'extrude') { setSel(null); setSelected([]); }
    setProfiles((cur) => {
      const same = cur.some((r) => r.sketch === sketch && r.index === index);
      if (mode === 'extrude' || additive) {
        if (same) return cur.filter((r) => !(r.sketch === sketch && r.index === index));
        if (extKind === 'loft' && mode === 'extrude') return [...cur.filter((r) => r.sketch !== sketch), { sketch, index, at }]; // one profile per sketch, in the order clicked
        return [...cur.filter((r) => r.sketch === sketch), { sketch, index, at }]; // one sketch at a time
      }
      return [{ sketch, index, at }]; // a plain click selects just this shape
    });
  };
  // leave the mode first: that cancels a debounced preview that has not fired yet, so it cannot re-apply after the undo
  const cancelExtrude = async () => { setProfiles([]); setEditing(null); setMode('model'); setError(''); await applyPreview(null); };
  const okExtrude = async () => {
    clearTimeout(previewTimer.current);
    const step = extrudeStep(); if (!step) { setError(extKind === 'pipe' ? 'Choose a sketch with a path, a diameter above zero, and (if given) a wall above zero' : extKind === 'emboss' ? 'Select a profile and enter a depth above zero' : extKind === 'rib' ? 'Choose a sketch with a line, a thickness above zero, and (if given) a depth above zero' : extKind === 'loft' ? 'Click one profile in each of two or more sketches, in order' : extKind === 'sweep' ? 'Select a profile and a path sketch (a different sketch, with lines or arcs)' : extKind === 'revolve' ? 'Select a profile and enter an angle between 0 and 360' : 'Select a profile and enter a distance'); return; }
    if (editing && !preview.current && stepKey === baseKey.current) { setProfiles([]); setEditing(null); setMode('model'); return; } // nothing was changed
    await applyPreview(step);
    if (!preview.current) return; // the engine refused: the reason is shown and the dialog stays open
    preview.current = false; setProfiles([]); setEditing(null); setMode('model');
  };

  // ---- Fillet and Chamfer: pick edges, set a size, live preview (the same mechanism as the extrude dialog)
  // ---- Measure (INSPECT tab): pick up to two points, edges or faces; the answer is shown in a panel
  const [measure, setMeasure] = useState<MeasureItem[] | null>(null);
  const startMeasure = async () => {
    if (mode === 'extrude') await cancelExtrude();
    if (mode === 'modify') await cancelModify();
    if (activeSketch) await finishSketch();
    chooseTool(null); setSel(null); setEdgesSel([]); setProfiles([]); setMeasure([]); setError('');
  };
  useEffect(() => { if (mode !== 'model') setMeasure(null); }, [mode]);
  useEffect(() => {
    if (!measure) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMeasure(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measure]);
  const measureRows = useMemo(() => (measure?.length === 2 ? measureTwo(measure[0]!, measure[1]!) : []), [measure]);
  const startModify = async (t: ModTool) => {
    if (mode === 'modify') { if (t !== modTool && !holeEdit && !valueEdit) { await applyPreview(null); setModTool(t); setModValue(MOD_DEFAULT[t]); setFacesSel([]); setBodiesSel(initialBodies(t, (modBase?.bodies ?? []).filter((b) => t !== 'meshconv' || b.mesh).map((b) => b.name), undefined)); } return; }
    if (mode === 'extrude') await cancelExtrude();
    let s: Snapshot | null = snap;
    if (activeSketch) s = await finishSketch();
    if (!s) return;
    if (t === 'meshconv' && !s.bodies.some((b) => b.mesh)) { setError('There is no mesh to convert: File > Import STEP / IGES / STL… brings one in.'); return; }
    if (!s.bodies.length && t !== 'coil') { setError('Make a body first (sketch and extrude), then change it.'); return; } // a coil can be the first body
    const start = FACE_TOOLS.includes(t) ? sel : null; // a face that is already selected is the one to work on
    setBodiesSel(initialBodies(t, s.bodies.filter((b) => t !== 'meshconv' || b.mesh).map((b) => b.name), sel?.body)); // a face that is already selected is the one to push or pull
    chooseTool(null); setSel(null); if (!isEdgeTool(t) || activeSketch) setEdgesSel([]); setFacesSel(start ? [start] : []); setHoleEdit(null); setCf({ ...COIL_FORM, op: s.bodies.length ? 'join' : 'new' }); setHf({ ...HOLE_FORM, ...(t === 'hole' && start ? holePos(start.point) : {}) }); setTf({ designation: '', length: '', modeled: false }); setModTool(t); setModBase(s); setModValue(MOD_DEFAULT[t]); setMode('modify'); setError('');
  };
  useEffect(() => { if (mode === 'model') setEdgesSel((cur) => (cur.length ? [] : cur)); }, [snap.bodies]); // picked edges belong to the body as it was
  const edgePicked = (ref: EdgeRef | null, additive = false) => {
    if (!ref) return;
    if (mode === 'model') { // edges first, then Fillet or Chamfer (as in Fusion): a click picks one edge, Shift or Ctrl adds more
      setSel(null); setProfiles([]);
      setEdgesSel((cur) => (cur.some((e) => e.body === ref.body && e.index === ref.index) ? cur.filter((e) => !(e.body === ref.body && e.index === ref.index)) : additive ? [...cur.filter((e) => e.body === ref.body), ref] : [ref]));
      return;
    }
    setEdgesSel((cur) => {
      if (cur.some((e) => e.body === ref.body && e.index === ref.index)) return cur.filter((e) => !(e.body === ref.body && e.index === ref.index));
      return [...cur.filter((e) => e.body === ref.body), ref]; // one body at a time
    });
  };
  const facePicked = (f: FacePick | null) => {
    if (!f) return;
    if (holeEdit || valueEdit) return; // an existing step keeps its faces and edges; only its numbers change
    if (BODY_TOOLS.includes(modTool)) { // a click on a body picks the whole body; the preview's copies are not pickable
      if (!modBase?.bodies.some((b) => b.name === f.body)) return;
      if (modTool === 'meshconv' && !modBase.bodies.find((b) => b.name === f.body)?.mesh) { setError('That body is not a mesh. Click an imported STL, OBJ or 3MF body.'); return; }
      if (modTool === 'split' || modTool === 'meshconv') { setBodiesSel([f.body]); setError(''); return; }
      setBodiesSel((cur) => (cur.includes(f.body) ? cur.filter((n) => n !== f.body) : [...cur, f.body]));
      return;
    }
    if (modTool === 'thread' && !modBase?.bodies.find((b) => b.name === f.body)?.faces.find((q) => q.index === f.face)?.cylinder) { setError('That face is not round: click the wall of a hole or a round boss'); return; }
    if (modTool === 'hole') setHf((h) => ({ ...h, ...holePos(f.point) }));
    if (ONE_FACE.includes(modTool)) { setFacesSel([f]); setError(''); return; }
    setFacesSel((cur) => (cur.some((c) => c.body === f.body && c.face === f.face) ? cur.filter((c) => !(c.body === f.body && c.face === f.face)) : [...cur.filter((c) => c.body === f.body), f])); // Shell: one body at a time
  };
  const closeModify = () => { setValueEdit(null); setHoleEdit(null); setBodiesSel([]); setEdgesSel([]); setFacesSel([]); setModBase(null); setMode('model'); setError(''); };
  const cancelModify = async () => { closeModify(); await applyPreview(null); };
  const okModify = async () => {
    clearTimeout(previewTimer.current);
    if (modTool === 'meshconv') { // Mesh to Solid: one real call, no preview
      const tol = Number(bf.tol);
      if (!bodiesSel[0]) { setError('Click the mesh to convert'); return; }
      if (!(tol > 0) || bf.tol.trim() === '') { setError('The tolerance must be a number of millimetres above zero'); return; }
      const s = await run(() => api.meshConvert(bodiesSel[0]!, tol));
      if (s) { closeModify(); setNotice((s as { method?: string }).method === 'slabs' ? 'Rebuilt the mesh as sketches and extrudes (one Ctrl+Z takes it all back)' : 'Converted the mesh to a solid'); }
      return;
    }
    if ((holeEdit || valueEdit) && !preview.current && stepKey === baseKey.current) { closeModify(); return; } // nothing was changed
    const step = modifyStep(); if (!step) { setError(modTool === 'coil' ? 'Fill in exactly two of turns, height and pitch (blank the third), all above zero, and the diameter and section size' : modTool === 'scale' ? 'Click a body and enter a factor above zero' : modTool === 'hole' ? 'Click a face, then check the position and enter a diameter (and a depth, or leave it empty to go right through)' : modTool === 'thread' ? 'Click the round wall of a hole or boss' : modTool === 'move' ? 'Type a move or a turn (not both zero)' : modTool === 'split' ? 'Click a body and type where to cut it' : modTool === 'combine' ? 'Click at least one other body to combine with the target' : BODY_TOOLS.includes(modTool) ? (bodiesSel.length ? 'Check the numbers: counts are whole numbers of 2 or more, spacing is not zero, the two directions differ' : 'Click the body to copy') : modTool === 'offsetface' ? 'Select the face(s) to move and enter a distance (not zero)' : modTool === 'draft' ? 'Select the wall face(s) and enter an angle (not zero, under 89)' : modTool === 'presspull' ? 'Select a face and enter a distance (not zero)' : modTool === 'shell' ? 'Select the face(s) to open and enter a wall thickness' : 'Select at least one edge and enter a size'); return; }
    await applyPreview(step);
    if (!preview.current) return; // the engine refused (for example a radius too big): the reason is shown and the dialog stays open
    preview.current = false; closeModify();
  };

  // ---- files: new, open, save, export
  const resetAfterLoad = () => {
    chooseTool(null); setSel(null); setSelected([]); setPicks([]); setProfiles([]); setEditing(null); setSelTl(null); setMenu(null); setEdgesSel([]); setModBase(null);
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
  /** File > Import: a STEP, IGES, STL, OBJ or 3MF file becomes a new component in the design (it does not replace it). */
  const doImport = () => { void (async () => {
    try {
      await noPreviewPending();
      if (activeSketch) { const k = await finishSketch(); if (!k) return; }
      const picked = await pickOpenFile([MODEL_TYPE]);
      if (!picked) return;
      const ext = extOf(picked.file.name);
      if (!['step', 'stp', 'iges', 'igs', 'stl', 'obj', '3mf'].includes(ext)) { setError('Choose a STEP, IGES, STL, OBJ or 3MF file (.step .stp .iges .igs .stl .obj .3mf)'); return; }
      const data = await picked.file.arrayBuffer();
      const before = new Set(snap.bodies.map((b) => b.name));
      const s = await run(() => api.importModel(data, stripExt(picked.file.name), ext));
      if (s) {
        setNotice(`Imported ${picked.file.name}`); setTimeout(() => viewApi.current?.setView('home'), 80);
        const fresh = s.bodies.filter((b) => !before.has(b.name) && b.mesh); // a mesh file carries its own coordinates: ask where to put it
        if (fresh.length) {
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
          for (const b of fresh) for (let i = 0; i < b.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k]!, b.positions[i]!); hi[k] = Math.max(hi[k]!, b.positions[i]!); }
          setPlaceImport({ names: fresh.map((b) => b.name), centre: [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2], low: lo[2]! });
        }
      }
    } catch (e) { setError((e as Error).message); }
  })(); };
  const [section, setSection] = useState<{ plane: 'XY' | 'XZ' | 'YZ'; offset: string; body: string } | null>(null);
  const doSectionExport = async () => {
    if (!section) return;
    const off = Number(section.offset);
    if (section.offset.trim() === '' || !Number.isFinite(off)) { setError('Enter where to cut as a number (millimetres)'); return; }
    try {
      const suggested = `${snap.doc.name} section.dxf`;
      const target = canPick() ? await pickSaveHandle(suggested, [typeForExt('dxf')]) : null;
      if (canPick() && !target) return;
      const { data, filename } = await api.exportSection({ plane: section.plane, offset: off, body: section.body });
      const blob = new Blob([data], { type: 'application/octet-stream' });
      if (target) { await writeHandle(target, blob); setNotice(`Exported ${target.name}`); } else { download(blob, filename); setNotice(`Exported ${filename} (see your Downloads folder)`); }
      setSection(null);
    } catch (e) { setError((e as Error).message); }
  };
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
    if (mode === 'extrude' || mode === 'modify') { setError('Finish or cancel the open dialog first, then save.'); return; }
    const name = snap.doc.name;
    try {
      let target = saveAs ? null : fileHandle.current;
      if (!target && canPick()) { target = await pickSaveHandle(`${name}.forge`, [FORGE_TYPE]); if (!target) return; }
      if (!target && saveAs) { setEdit({ title: 'Save as (the file goes to your Downloads folder)', value: name, submit: (v) => void saveTo(null, v.trim() || name).catch((e) => setError((e as Error).message)) }); return; }
      await saveTo(target, target ? stripExt(target.name) : name);
    } catch (e) { setError((e as Error).message); }
  };
  const doExport = async (format: string, sketch?: string, faceOf?: FacePick) => {
    try {
      const base = snap.doc.name, ext = format === 'stla' ? 'stl' : format;
      const suggested = faceOf ? `${base} face.${ext}` : sketch ? `${base} ${sketch}.${ext}` : `${base}.${ext}`;
      const target = canPick() ? await pickSaveHandle(suggested, [typeForExt(ext)]) : null;
      if (canPick() && !target) return;
      const { data, filename } = faceOf ? await api.exportFaceDxf({ body: faceOf.body, index: faceOf.face, point: faceOf.point }) : await api.exportAs(format, sketch);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      if (target) { await writeHandle(target, blob); setNotice(`Exported ${target.name}`); } else { download(blob, filename); setNotice(`Exported ${filename} (see your Downloads folder)`); }
    } catch (e) { setError((e as Error).message); }
  };
  /** The right-click menu: what can be done with what is selected, then the general actions. */
  const viewItems = (): MenuItem[] => {
    const none = snap.bodies.length === 0, items: MenuItem[] = [];
    const face = sel ? snap.bodies.find((b) => b.name === sel.body)?.faces.find((f) => f.index === sel.face) : undefined;
    if (mode === 'sketch') {
      items.push({ label: 'Sketch', heading: true, onClick: () => {} }, { label: 'Finish Sketch', onClick: () => void finishSketch() });
      for (const [label, t] of [['Line   L', 'line'], ['2-Point Rectangle   R', 'rect'], ['Center Rectangle', 'rectCenter'], ['Center Circle   C', 'circle'], ['2-Point Circle', 'circle2'], ['3-Point Arc   A', 'arc3'], ['Slot', 'slot'], ['Trim   T', 'trim'], ['Offset   O', 'offset'], ['Fillet', 'fillet'], ['Sketch Dimension   D', 'dimension']] as [string, Tool][]) items.push({ label, onClick: () => chooseTool(t) });
    } else if (mode === 'model') {
      if (profiles.length) items.push({ label: 'Selected shape', heading: true, onClick: () => {} }, { label: 'Extrude   E', onClick: () => void startExtrude('extrude') }, { label: 'Revolve', onClick: () => void startExtrude('revolve') }, { label: 'Sweep', onClick: () => void startExtrude('sweep') }, { label: 'Loft', onClick: () => void startExtrude('loft') }, { label: 'Emboss', onClick: () => void startExtrude('emboss') });
      if (sel) items.push({ label: 'Selected face', heading: true, onClick: () => {} }, { label: 'Press Pull   Q', onClick: () => void startModify('presspull') }, { label: 'Hole   H', onClick: () => void startModify('hole') }, { label: 'Move / Copy   M', onClick: () => void startModify('move') }, { label: 'Offset Face', onClick: () => void startModify('offsetface') }, { label: 'Draft', onClick: () => void startModify('draft') }, { label: 'Shell', onClick: () => void startModify('shell') }, { label: 'Thread', disabled: !face?.cylinder, onClick: () => void startModify('thread') }, { label: 'Create Sketch on this face', disabled: !face?.planeNormal, onClick: () => planePicked({ face: sel.point, body: sel.body, index: sel.face }) }, { label: 'Export this face as DXF', disabled: !face?.planeNormal, onClick: () => void doExport('dxf', undefined, sel) });
      items.push({ label: 'Create', heading: true, onClick: () => {} }, { label: 'Create Sketch', onClick: () => void createSketch() }, { label: 'Extrude   E', onClick: () => void startExtrude('extrude') }, { label: 'Fillet   F', disabled: none, onClick: () => void startModify('fillet') }, { label: 'Chamfer', disabled: none, onClick: () => void startModify('chamfer') },
        { label: 'Modify', heading: true, onClick: () => {} },
        ...([['Move / Copy   M', 'move'], ['Split Body', 'split'], ['Combine', 'combine'], ['Scale', 'scale'], ['Mirror', 'mirror'], ['Rectangular Pattern', 'rpattern'], ['Circular Pattern', 'cpattern'], ['Shell', 'shell'], ['Press Pull   Q', 'presspull'], ['Hole   H', 'hole'], ['Coil', 'coil'], ['Mesh to Solid', 'meshconv']] as [string, ModTool][]).map(([label, k]) => ({ label, disabled: none && k !== 'coil', onClick: () => void startModify(k) })),
        { label: 'More create', heading: true, onClick: () => {} },
        ...([['Revolve', 'revolve'], ['Sweep', 'sweep'], ['Loft', 'loft'], ['Rib', 'rib'], ['Pipe', 'pipe'], ['Emboss', 'emboss']] as [string, ExtKind][]).map(([label, k]) => ({ label, onClick: () => void startExtrude(k) })));
    }
    items.push({ label: 'General', heading: true, onClick: () => {} }, { label: 'Undo   Ctrl+Z', onClick: undo }, { label: 'Redo   Ctrl+Y', onClick: redo }, { label: 'Keyboard shortcuts   ?', onClick: () => setShowKeys(true) });
    return items;
  };
  const fileItems = (): MenuItem[] => {
    const none = snap.bodies.length === 0;
    const flatSel = !!snap.bodies.find((b) => b.name === sel?.body)?.faces.find((f) => f.index === sel?.face)?.planeNormal;
    return [
      { label: 'New', onClick: doNew },
      { label: 'Open…   Ctrl+O', onClick: doOpen },
      { label: 'Save   Ctrl+S', onClick: () => void doSave(false) },
      { label: 'Save As…   Ctrl+Shift+S', onClick: () => void doSave(true) },
      { label: 'Import STEP / IGES / STL…', onClick: doImport },
      { label: upd.info?.newer && !upd.info.skipped ? `Updates… (${upd.info.latest?.version} is available)` : 'Updates…', onClick: () => { setShowUpdates(true); void upd.refresh(); } },
      { label: 'Export bodies', heading: true, onClick: () => {} },
      { label: 'STEP (.step)', disabled: none, onClick: () => void doExport('step') },
      { label: 'STL (.stl)', disabled: none, onClick: () => void doExport('stl') },
      { label: '3MF (.3mf)', disabled: none, onClick: () => void doExport('3mf') },
      { label: 'OBJ (.obj)', disabled: none, onClick: () => void doExport('obj') },
      { label: 'Export a face as DXF', heading: true, onClick: () => {} },
      sel && flatSel ? { label: `Selected face (${sel.body})`, onClick: () => void doExport('dxf', undefined, sel) } : { label: 'Select a flat face first', disabled: true, onClick: () => {} },
      { label: 'Section through a body…', disabled: none, onClick: () => setSection({ plane: 'XZ', offset: '0', body: snap.bodies[0]?.name ?? '' }) },
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
  const noPreviewPending = async () => { if (mode === 'extrude') await cancelExtrude(); else if (mode === 'modify') await cancelModify(); };
  const editSketch = async (name: string) => {
    await noPreviewPending();
    chooseTool(null);
    const steps = activeSketch ? [{ command: 'sketch.finish', params: {} }, { command: 'sketch.edit', params: { sketch: name } }] : [{ command: 'sketch.edit', params: { sketch: name } }];
    if (activeSketch?.name === name) return;
    send(steps);
  };
  /** Double-click a Fillet, Chamfer, Shell, Offset Face or Draft in the timeline: change its number in place. */
  const VALUE_FEATURES: [RegExp, ModTool, string][] = [[/^fillet/i, 'fillet', 'radius'], [/^chamfer/i, 'chamfer', 'distance'], [/^shell/i, 'shell', 'thickness'], [/^offsetface/i, 'offsetface', 'distance'], [/^draft/i, 'draft', 'angle']];
  const valueKind = (type: string) => VALUE_FEATURES.find(([re]) => re.test(type));
  const editValue = async (item: TimelineItem) => {
    const hit = valueKind(item.type); if (!hit) return;
    await noPreviewPending();
    if (activeSketch) { const k = await finishSketch(); if (!k) return; }
    try {
      const f = await api.inspectFeature(item.name);
      const raw = String((f.definition as Record<string, unknown>)[hit[2]] ?? '');
      skipFirst.current = true;
      setValueEdit({ name: item.name, key: hit[2] }); setModValue(raw.replace(/\s*deg$/, ''));
      setFacesSel([]); setEdgesSel([]); setBodiesSel([]); setHoleEdit(null);
      setModTool(hit[1]); setModBase(snap); chooseTool(null); setSel(null); setMode('modify'); setError('');
    } catch (e) { setError((e as Error).message); }
  };
  const editHole = async (item: TimelineItem) => {
    await noPreviewPending();
    if (activeSketch) { const s = await finishSketch(); if (!s) return; }
    try {
      const f = await api.inspectFeature(item.name);
      const d = f.definition as { position?: number[]; diameter?: string; depth?: string; hole?: Record<string, string> };
      const pos = d.position ?? [0, 0, 0], h = d.hole ?? {};
      skipFirst.current = true;
      setHf({ ...HOLE_FORM, ...holePos(pos), depth: d.depth ?? '', type: h.type === 'counterbore' || h.type === 'countersink' ? h.type : 'simple', cbd: h.cb_diameter ?? '10', cbh: h.cb_depth ?? '3', csd: h.cs_diameter ?? '10', csa: h.cs_angle ?? '90' });
      setModValue(d.diameter ?? '5'); setFacesSel([]); setEdgesSel([]); setBodiesSel([]); setHoleEdit(item.name);
      setModTool('hole'); setModBase(snap); chooseTool(null); setSel(null); setMode('modify'); setError('');
    } catch (e) { setError((e as Error).message); }
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
      setExtKind('extrude'); setExt((x) => ({ ...x, distance: f.definition.extent?.distance ?? '10', direction: dir === 'symmetric' ? 'sym' : dir === 'negative' ? 'rev' : 'one', operation: opFromDef(f.definition.operation) }));
      setEditing({ name: item.name, key: chosen.map((pr) => pr.index).sort().join(',') });
      chooseTool(null); setMode('extrude'); setError('');
    } catch (e) { setError((e as Error).message); }
  };
  const editItem = (item: TimelineItem) => {
    if (/sketch/i.test(item.type)) void editSketch(item.name);
    else if (/extrude/i.test(item.type)) void editExtrude(item);
    else if (/hole/i.test(item.type)) void editHole(item);
    else if (valueKind(item.type)) void editValue(item);
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
    { label: 'Edit', onClick: () => editItem(item), disabled: !(/sketch|extrude|hole/i.test(item.type) || valueKind(item.type)) },
    { label: 'Rename…', onClick: () => setEdit({ title: `Rename ${item.name}`, value: item.name, submit: (v) => { if (v.trim() && v.trim() !== item.name) send([{ command: 'timeline.rename', params: { feature: item.name, name: v.trim() } }]); } }) },
    { label: item.suppressed ? 'Unsuppress' : 'Suppress', onClick: () => send([{ command: 'timeline.suppress', params: { feature: item.name } }]) },
    { label: 'Roll history to here', onClick: () => send([{ command: 'timeline.roll_to', params: { feature: item.name } }]) },
    { label: 'Delete', danger: true, onClick: () => void requestDelete(item) },
  ];

  const undo = () => { if (mode === 'extrude' || mode === 'modify') return; setPending([]); void run(api.undo); };
  const redo = () => { if (mode === 'extrude' || mode === 'modify') return; void run(api.redo); };

  // ---- keyboard (the same letters Fusion users know)
  const showKeysRef = useRef(false); showKeysRef.current = showKeys;
  const latest = useRef({ offsetPick, mode, tool, pending, edit, sel, activeSketch, selected, picks, selTl, menu, confirm, items: snap.timeline });
  latest.current = { offsetPick, mode, tool, pending, edit, sel, activeSketch, selected, picks, selTl, menu, confirm, items: snap.timeline };
  // Another program (an AI client connected through MCP) can change the design while the page is open: notice it, when nothing here is half done
  const watch = useRef({ mode, busy, stamp: snap.stamp, dialogs: false });
  watch.current = { mode, busy, stamp: snap.stamp, dialogs: !!(placeImport || confirm || showUpdates || showKeys || section || edit) };
  useEffect(() => {
    const t = setInterval(async () => {
      const w = watch.current;
      if (document.hidden || w.mode !== 'model' || w.busy || w.dialogs || !w.stamp) return;
      try {
        const r = await fetch('/api/stamp'); if (!r.ok) return;
        const { stamp } = await r.json() as { stamp: string };
        if (stamp === watch.current.stamp || watch.current.busy || watch.current.mode !== 'model') return;
        const s = await run(api.state);
        if (s) { setSel(null); setProfiles([]); setEdgesSel([]); setNotice('The design was changed by another program (an AI client)'); }
      } catch { /* the server is not answering: the next tick tries again */ }
    }, 2000);
    return () => clearInterval(t);
  }, [run]);
  const actions = useRef({ undo, redo, startExtrude, cancelExtrude, okExtrude, chooseTool, endChain, createSketch, deleteSelected, toggleConstruction, requestDelete, editItem, doSave, doOpen, startModify, startMeasure, cancelModify, okModify });
  actions.current = { undo, redo, startExtrude, cancelExtrude, okExtrude, chooseTool, endChain, createSketch, deleteSelected, toggleConstruction, requestDelete, editItem, doSave, doOpen, startModify, startMeasure, cancelModify, okModify };
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
      if (k === '?' && !inField) { e.preventDefault(); setShowKeys((x) => !x); return; }
      if (k === 'escape' && showKeysRef.current) { setShowKeys(false); return; }
      if (k === 'escape') {
        if (inField) (e.target as HTMLElement).blur();
        if (L.confirm) setConfirm(null);
        else if (L.menu) setMenu(null);
        else if (L.edit) setEdit(null);
        else if (L.mode === 'extrude') void A.cancelExtrude();
        else if (L.mode === 'modify') void A.cancelModify();
        else if (L.mode === 'pickPlane') setMode('model');
        else if (L.offsetPick) setOffsetPick(null);
        else if (L.pending.length) A.endChain();
        else if (L.picks.length) setPicks([]);
        else if (L.tool) A.chooseTool(null);
        else if (L.selected.length) setSelected([]);
        return;
      }
      if (inField) return;
      if ((L.mode === 'extrude' || L.mode === 'modify') && /^[0-9.\-]$/.test(e.key)) { // start typing the number: it goes into the dialog's main box, as in Fusion
        const dlg = document.querySelector('[data-testid=extrude-dialog],[data-testid=modify-dialog]');
        const box = dlg?.querySelector<HTMLInputElement>('input[data-main]') ?? dlg?.querySelector<HTMLInputElement>('input[type=text]');
        if (box) { box.focus(); box.select(); } // the key itself then replaces the selected text
        return;
      }
      if (L.mode === 'sketch') {
        if (L.tool === 'offset' && L.offsetPick && (k === 'tab' || /^[0-9.\-]$/.test(e.key))) { e.preventDefault(); if (k !== 'tab') { setTyped(e.key); setOffsetTouched(true); } setTimeout(() => offsetRef.current?.focus(), 0); return; }
        if (L.pending.length && k === 'tab' && sizeFields(L.tool, L.pending.length).length) { e.preventDefault(); viewApi.current?.focusSize(0); return; } // Tab goes to the size boxes on the shape, then between them
        if (L.pending.length && sizeFields(L.tool, L.pending.length).length && /^[0-9.\-]$/.test(e.key)) { if (viewApi.current?.focusSize(0, e.key)) e.preventDefault(); return; }
        const map: Record<string, Tool> = { l: 'line', r: 'rect', c: 'circle', a: 'arc3', d: 'dimension', t: 'trim', o: 'offset' };
        if (map[k]) { A.chooseTool(map[k]!); return; }
        if (k === 'delete' || k === 'backspace') { A.deleteSelected(); return; }
        if (k === 'x') { A.toggleConstruction(); return; }
        if (k === 'e') void A.startExtrude();
        return;
      }
      if (L.mode === 'model') {
        if (k === 'e') void A.startExtrude();
        else if (k === 'h') void A.startModify('hole');
        else if (k === 'f') void A.startModify('fillet');
        else if (k === 'i') void A.startMeasure();
        else if (k === 'q') void A.startModify('presspull');
        else if (k === 'm') void A.startModify('move');
        else if ((k === 'delete' || k === 'backspace') && L.selTl !== null) { const it = L.items.find((t) => t.id === L.selTl); if (it) void A.requestDelete(it); }
        else if (k === 'enter' && L.selTl !== null) { const it = L.items.find((t) => t.id === L.selTl); if (it) A.editItem(it); }
      }
      else if (L.mode === 'extrude' && k === 'enter') void A.okExtrude();
      else if (L.mode === 'modify' && k === 'enter') void A.okModify();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; };
  const face = useMemo(() => snap.bodies.find((b) => b.name === sel?.body)?.faces.find((f) => f.index === sel?.face), [snap, sel]);
  const hint = mode === 'sketch'
    ? (tool ? (TOOL_HINT[tool]?.[Math.min(isDraw(tool) ? pending.length : picks.length, (TOOL_HINT[tool]?.length ?? 1) - 1)] ?? '') : selected.length ? `${selected.length} selected. Delete removes it, X makes it a construction line, Esc clears.` : 'Pick a sketch tool, or click a line to select it. Keys: L R C A T O D.')
    : HINT[mode === 'modify' && modTool !== 'fillet' && modTool !== 'chamfer' ? modTool : mode] ?? '';
  const triangles = snap.bodies.reduce((n, b) => n + b.faceIds.length, 0);
  const placeholder = tool === 'rect' || tool === 'rectCenter' ? 'width, height' : tool === 'circle' || tool === 'circle2' ? 'diameter' : tool === 'slot' ? 'width' : 'length [, angle]';
  const fieldNames = tool === 'rect' || tool === 'rectCenter' ? ['Width', 'Height'] : tool === 'circle' || tool === 'circle2' ? ['Diameter'] : tool === 'slot' ? ['Width'] : ['Length', 'Angle'];
  const typable = isDraw(tool) && pending.length > 0 && tool !== 'arc3' && !(tool === 'slot' && pending.length < 2);

  return (
    <div className="app">
      <header>
        <span className="brand" data-testid="brand" aria-label="DemonX Forge"><img className="brand-mark" src="/forge-mark.png" alt="" width="60" height="38" /><img className="brand-name" src="/forge-wordmark.png" alt="DemonX Forge" width="185" height="34" /></span>
        <button data-testid="file-menu" aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setFileMenu({ x: r.left, y: r.bottom + 2 }); }}>File ▾</button>
        <span className="docname" data-testid="docname">{snap.doc.name}{snap.doc.dirty && <span className="dirty" data-testid="dirty" title="Unsaved changes">●</span>}</span>
        <span className="spacer" />
        <UpdateBadge info={upd.info} onClick={() => { setShowUpdates(true); void upd.refresh(); }} />
        {upd.info?.current && <button className="appver" data-testid="app-version" title="The version of DemonX Forge you are running. Click for updates." onClick={() => { setShowUpdates(true); void upd.refresh(); }}>v{upd.info.current}</button>}
        <button className="hbtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={busy && mode === 'extrude'} onClick={undo}><Icon.undo /></button>
        <button className="hbtn" aria-label="Redo" title="Redo (Ctrl+Y)" onClick={redo}><Icon.redo /></button>
        <button className="hbtn" data-testid="help-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShowKeys(true)}>?</button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
      </header>

      <Ribbon mode={mode} tool={tool} canHole={snap.bodies.length > 0 && mode !== 'pickPlane'} canModify={snap.bodies.length > 0 && mode !== 'pickPlane'} modTool={mode === 'modify' ? modTool : null} extKind={mode === 'extrude' ? extKind : null} onFillet={() => void startModify('fillet')} onChamfer={() => void startModify('chamfer')} onPressPull={() => void startModify('presspull')} onShell={() => void startModify('shell')} onOffsetFace={() => void startModify('offsetface')} onDraft={() => void startModify('draft')} onCombine={() => void startModify('combine')} onMirror={() => void startModify('mirror')} onRPattern={() => void startModify('rpattern')} onCPattern={() => void startModify('cpattern')} onCreateSketch={createSketch} onExtrude={() => void startExtrude('extrude')} onRevolve={() => void startExtrude('revolve')} onSweep={() => void startExtrude('sweep')} onLoft={() => void startExtrude('loft')} onHole={() => void startModify('hole')} onThread={() => void startModify('thread')} onMove={() => void startModify('move')} onSplit={() => void startModify('split')} onRib={() => void startExtrude('rib')} onPipe={() => void startExtrude('pipe')} onEmboss={() => void startExtrude('emboss')} onCoil={() => void startModify('coil')} onScale={() => void startModify('scale')} onMeshConvert={() => void startModify('meshconv')} onTool={(t) => chooseTool(t)} onFinish={() => void finishSketch()} measuring={measure !== null} onMeasure={() => void startMeasure()} onSection={() => setSection({ plane: 'XZ', offset: '0', body: snap.bodies[0]?.name ?? '' })} onImport={doImport} />

      <Browser docName={snap.doc.name} bodies={snap.bodies} sketches={snap.sketches} parameters={snap.parameters} hiddenBodies={hiddenBodies} hiddenSketches={hiddenSketches} showOrigin={showOrigin} busy={busy}
        onToggleBody={(n) => setHiddenBodies((s) => toggle(s, n))} onToggleSketch={(i) => setHiddenSketches((s) => toggle(s, i))} onToggleOrigin={() => setShowOrigin((v) => !v)} onEditSketch={(n) => void editSketch(n)}
        onSetParam={async (name, value) => !!(await run(() => api.param(name, value)))} />

      <div className="stage">
        <Viewport bodies={snap.bodies} sketches={snap.sketches} activeSketch={activeSketch} theme={theme} mode={mode} tool={tool} pending={pending}
          hiddenBodies={hiddenBodies} hiddenSketches={hiddenSketches} showOrigin={showOrigin} showGrid={showGrid} showDims={showDims} onDimEdit={dimEdited} showEdges={showEdges} showProfiles={showProfiles} snap={snapOn}
          selectedFaces={mode === 'modify' ? facesSel : measure ? measure.flatMap((m) => (m.kind === 'face' ? [{ body: m.body, face: m.face }] : [])) : sel ? [sel] : []} pickFaces={mode === 'modify' && (FACE_TOOLS.includes(modTool) || BODY_TOOLS.includes(modTool))} selectedBodies={mode === 'modify' ? bodiesSel : []} selectedProfiles={profiles}
          handle={dragHandle} handles={moveHandles} edgeSets={edgeSets} edgeHighlight={measure ? measure.flatMap((m) => (m.kind === 'edge' ? [{ body: m.body, index: m.index }] : [])) : edgesSel} measuring={measure !== null} onMeasurePick={(it) => setMeasure((cur) => (!cur || cur.length >= 2 ? [it] : [...cur, it]))} markers={measure?.flatMap((m) => (m.kind === 'point' ? [m.at] : []))} onEdgePick={edgePicked} onFacePick={mode === 'modify' ? facePicked : (f) => { setSel(f); setProfiles([]); setEdgesSel([]); }} onEntityDrag={entityDrag} onContextAt={(x, y) => setViewMenu({ x, y })} onSketchDrag={sketchDrag} onSketchBox={sketchBox} sizes={sizes} onSizeTyped={(i, text) => setSizes((cur) => { const n = [...cur]; n[i] = text; return n; })} onSizeSubmit={submitTyped} extraPreview={offsetPick ? offsetOutline : undefined} fillSketches={fillSketches} onPlanePick={planePicked} onSketchClick={sketchClick} onSketchRightClick={endChain}
          pickMode={mode !== 'sketch' ? null : !tool ? 'curve' : isDraw(tool) ? null : PICK_MODE[tool]} highlight={[...selected, ...picks.map((q) => q.id), ...(offsetPick ? [offsetPick] : [])]} showPoints={mode === 'sketch' && !!tool && !isDraw(tool) && PICK_MODE[tool] !== 'curve'}
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
            <label><span>Dimensions</span><input type="checkbox" aria-label="Dimensions" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /></label>
            <label><span>Sketch Grid</span><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /></label>
            <label><span>Snap</span><input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /></label>
            <label><span>Profile</span><input type="checkbox" checked={showProfiles} onChange={(e) => setShowProfiles(e.target.checked)} /></label>
            <div className="pstat" data-testid="sketch-state">{activeSketch ? `${activeSketch.name}: ${activeSketch.dof === 0 ? 'fully constrained' : `${activeSketch.dof} degrees of freedom left`}` : ''}</div>
            <button className="primary" onClick={() => void finishSketch()}>Finish Sketch</button>
          </div>
        )}

        {mode === 'extrude' && (
          <div className="dialog" data-testid="extrude-dialog">
            <div className="dhead">{editing ? `EDIT ${editing.name.toUpperCase()}` : EXT_TITLE[extKind]}</div>
            {extKind === 'rib' && <>
              <label className="drow"><span>Sketch</span><select aria-label="Rib sketch" value={ribChoice} onChange={(e) => setExt({ ...ext, ribSketch: e.target.value })}>{ribOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="drow"><span>Thickness</span><input aria-label="Rib thickness" type="text" value={ext.thickness} onChange={(e) => setExt({ ...ext, thickness: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label>
              <label className="drow"><span>Depth</span><input aria-label="Rib depth" type="text" placeholder="to the next face" value={ext.depth} onChange={(e) => setExt({ ...ext, depth: e.target.value })} /></label>
              <label className="drow"><span>Flip</span><input aria-label="Flip rib" type="checkbox" checked={ext.flip} onChange={(e) => setExt({ ...ext, flip: e.target.checked })} /></label></>}
            {extKind === 'pipe' && <>
              <label className="drow"><span>Path</span><select aria-label="Pipe path" value={pipeChoice} onChange={(e) => setExt({ ...ext, pipeSketch: e.target.value })}>{pipeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="drow"><span>Diameter</span><input aria-label="Pipe diameter" type="text" value={ext.pipeDia} onChange={(e) => setExt({ ...ext, pipeDia: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label>
              <label className="drow"><span>Wall</span><input aria-label="Pipe wall" type="text" placeholder="solid" value={ext.pipeWall} onChange={(e) => setExt({ ...ext, pipeWall: e.target.value })} /></label></>}
            {extKind === 'emboss' && <>
              <label className="drow"><span>Mode</span><select aria-label="Emboss mode" value={ext.embossMode} onChange={(e) => setExt({ ...ext, embossMode: e.target.value as 'emboss' | 'deboss' })}><option value="emboss">Emboss (raise)</option><option value="deboss">Deboss (cut in)</option></select></label>
              <label className="drow"><span>Depth</span><input aria-label="Emboss depth" type="text" value={ext.distance} onChange={(e) => setExt({ ...ext, distance: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label></>}
            {extKind !== 'rib' && extKind !== 'pipe' && <div className="drow"><span>Profiles</span><b data-testid="profile-count">{profiles.length ? `${profiles.length} selected` : 'Select profiles'}</b></div>}
            {extKind === 'sweep' && <label className="drow"><span>Path</span>
              <select aria-label="Path" value={pathChoice} onChange={(e) => setExt({ ...ext, path: e.target.value })}>{pathOptions.length ? pathOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : <option value="">(draw a path in another sketch)</option>}</select></label>}
            {extKind === 'sweep' || extKind === 'loft' || extKind === 'rib' || extKind === 'pipe' || extKind === 'emboss' ? null : extKind === 'revolve' ? <>
              <label className="drow"><span>Axis</span>
                <select aria-label="Axis" value={ext.axis} onChange={(e) => setExt({ ...ext, axis: e.target.value })}>{axisOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="drow"><span>Angle</span>
                <input aria-label="Angle" type="text" value={ext.angle} onChange={(e) => setExt({ ...ext, angle: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label>
            </> : <>
            <label className="drow"><span>Direction</span>
              <select aria-label="Direction" value={ext.direction} onChange={(e) => setExt({ ...ext, direction: e.target.value as ExtrudeForm['direction'] })}><option value="one">One Side</option><option value="rev">One Side (reversed)</option><option value="sym">Symmetric</option></select></label>
            <label className="drow"><span>Distance</span>
              <input aria-label="Distance" data-main type="text" value={ext.distance} onChange={(e) => setExt({ ...ext, distance: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okExtrude(); }} /></label>
            </>}
            {extKind !== 'rib' && extKind !== 'emboss' && <label className="drow"><span>Operation</span>
              <select aria-label="Operation" value={ext.operation} onChange={(e) => setExt({ ...ext, operation: e.target.value as ExtrudeForm['operation'] })}><option value="new">New Body</option><option value="join">Join</option><option value="cut">Cut</option><option value="intersect">Intersect</option></select></label>}
            <div className="dnote">{extKind === 'pipe' ? 'A round pipe along the path (lines and arcs joined end to end). Leave Wall empty for a solid rod, or give a wall thickness for a hollow pipe.' : extKind === 'emboss' ? 'Raises the profile off the face it was sketched on (Emboss) or cuts it in (Deboss). Sketch the shape on the face first (Create Sketch on a flat face).' : extKind === 'rib' ? 'The rib is a wall grown from the line, joined to the body. Thickness is across the wall; Depth empty fills up to the next face. Flip grows it to the other side.' : extKind === 'loft' ? 'Click one profile in each sketch, in the order the solid should pass through them (click again to remove one). At least two.' : extKind === 'sweep' ? 'The profile is carried along the path sketch (lines and arcs, joined end to end). The profile should be square to the start of the path.' : extKind === 'revolve' ? 'The profile turns about the axis; it must not cross it. Angle is in degrees (360 is a full turn).' : ext.operation === 'cut' ? 'Cut goes into the body. A negative distance flips the direction.' : 'A negative distance flips the direction.'}</div>
            <div className="dbtns"><button onClick={() => void cancelExtrude()}>Cancel</button><button className="primary" data-testid="extrude-ok" onClick={() => void okExtrude()}>OK</button></div>
          </div>
        )}

        {mode === 'modify' && (
          <div className={`dialog${modTool === 'move' ? ' compact' : ''}`} data-testid="modify-dialog">
            <div className="dhead">{valueEdit ? `EDIT ${valueEdit.name.toUpperCase()}` : MOD_TITLE[modTool]}</div>
            {modTool === 'coil' && <CoilFields cf={cf} setCf={setCf} hasBodies={(modBase?.bodies.length ?? 0) > 0} onEnter={() => void okModify()} />}
            {modTool === 'coil' ? null : BODY_TOOLS.includes(modTool) && !valueEdit ? <BodyFields tool={modTool} bf={bf} setBf={setBf} bodies={bodiesSel} allBodies={modBase?.bodies.map((b) => b.name) ?? []} target={combineTarget} onEnter={() => void okModify()} /> : <>
            {modTool === 'hole' && holeEdit && <div className="drow"><span>Editing</span><b data-testid="edge-count">{holeEdit}</b></div>}
            {valueEdit || (FACE_TOOLS.includes(modTool) && modTool === 'hole' && holeEdit) ? null : FACE_TOOLS.includes(modTool)
              ? <div className="drow"><span>{ONE_FACE.includes(modTool) ? 'Face' : 'Faces'}</span><b data-testid="edge-count">{facesSel.length ? `${facesSel.length} selected` : ONE_FACE.includes(modTool) ? 'Select a face' : 'Select faces'}</b></div>
              : <div className="drow"><span>Edges</span><b data-testid="edge-count">{edgesSel.length ? `${edgesSel.length} selected` : 'Select edges'}</b></div>}
            {modTool === 'hole' && <>
              {(['x', 'y', 'z'] as const).map((k) => <label className="drow" key={k}><span>Position {k.toUpperCase()}</span><input aria-label={`Position ${k.toUpperCase()}`} type="text" value={hf[k]} onChange={(e) => setHf({ ...hf, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okModify(); }} /></label>)}
              <label className="drow"><span>Type</span><select aria-label="Hole type" value={hf.type} onChange={(e) => setHf({ ...hf, type: e.target.value as HoleForm['type'] })}><option value="simple">Simple</option><option value="counterbore">Counterbore</option><option value="countersink">Countersink</option></select></label>
              {hf.type === 'counterbore' && <><label className="drow"><span>Bore diameter</span><input aria-label="Counterbore diameter" type="text" value={hf.cbd} onChange={(e) => setHf({ ...hf, cbd: e.target.value })} /></label><label className="drow"><span>Bore depth</span><input aria-label="Counterbore depth" type="text" value={hf.cbh} onChange={(e) => setHf({ ...hf, cbh: e.target.value })} /></label></>}
              {hf.type === 'countersink' && <><label className="drow"><span>Sink diameter</span><input aria-label="Countersink diameter" type="text" value={hf.csd} onChange={(e) => setHf({ ...hf, csd: e.target.value })} /></label><label className="drow"><span>Sink angle</span><input aria-label="Countersink angle" type="text" value={hf.csa} onChange={(e) => setHf({ ...hf, csa: e.target.value })} /></label></>}
              <label className="drow"><span>Depth</span><input aria-label="Depth" type="text" placeholder="through all" value={hf.depth} onChange={(e) => setHf({ ...hf, depth: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void okModify(); }} /></label></>}
            {modTool === 'thread' && <>
              <label className="drow"><span>Size</span><input aria-label="Thread size" type="text" placeholder="e.g. M8 (empty: the size that fits)" value={tf.designation} onChange={(e) => setTf({ ...tf, designation: e.target.value })} /></label>
              <label className="drow"><span>Length</span><input aria-label="Thread length" type="text" placeholder="the whole face" value={tf.length} onChange={(e) => setTf({ ...tf, length: e.target.value })} /></label>
              <label className="drow"><span>Modeled</span><input aria-label="Modeled thread" type="checkbox" checked={tf.modeled} onChange={(e) => setTf({ ...tf, modeled: e.target.checked })} /></label></>}
            {modTool === 'draft' && !valueEdit && <label className="drow"><span>Neutral</span><select aria-label="Neutral plane" value={bf.neutral} onChange={(e) => setBf({ ...bf, neutral: e.target.value as BodyForm['neutral'] })}><option value="bottom">Bottom of the body</option><option value="top">Top of the body</option><option value="XY">XY plane (z = 0)</option><option value="XZ">XZ plane (y = 0)</option><option value="YZ">YZ plane (x = 0)</option></select></label>}
            {modTool !== 'thread' && <label className="drow"><span>{VALUE_LABEL[modTool]}</span>
              <input aria-label={VALUE_LABEL[modTool]} data-main type="text" value={modValue} onChange={(e) => setModValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void okModify(); }} /></label>}
            <div className="dnote">{valueEdit ? 'Only the number can be changed here; the step keeps the edges or faces it was made on. To change those, delete the step and make it again.' : modTool === 'hole' ? (holeEdit ? 'Change the numbers; the hole follows. Leave Depth empty to go right through.' : 'The hole is drilled into the body at the position, straight in from the face. Leave Depth empty to go right through.') : modTool === 'thread' ? 'A cosmetic thread marks the size on the hole without changing the shape (it shows in the timeline). Tick Modeled to cut the real thread profile (slower).' : modTool === 'draft' ? 'Tilts the picked walls by the angle about the neutral plane, which keeps its size. A positive angle narrows the part away from the neutral plane (a mould that pulls up from it); a negative one widens it.' : modTool === 'offsetface' ? 'Moves the picked flat faces along their normals: a positive distance grows the body, a negative one shrinks it.' : modTool === 'shell' ? 'Hollows the body inward, leaving the clicked faces open. Click a picked face again to deselect it.' : modTool === 'presspull' ? 'A positive distance pulls the face out (adds material); a negative one pushes it in (removes material). Click another face to change the pick.' : <>{modTool === 'fillet' ? 'A fillet follows the edges that continue smoothly from the one you pick (a rounded corner carries on round the whole outline).' : 'A chamfer follows the edges that continue smoothly from the one you pick.'} Click a picked edge again to deselect it.</>}</div></>}
            <div className="dbtns"><button onClick={() => void cancelModify()}>Cancel</button><button className="primary" data-testid="modify-ok" onClick={() => void okModify()}>OK</button></div>
          </div>
        )}

        {mode === 'sketch' && tool === 'offset' && offsetPick && (
          <div className="entry" data-testid="offset-entry">
            <label>Offset<input ref={offsetRef} aria-label="Offset distance" type="text" value={offsetTouched || typed !== '' ? typed : showSize(liveOffset() === null ? undefined : Math.round(liveOffset()! * 10) / 10)} onFocus={(e) => e.target.select()} onChange={(e) => { setTyped(e.target.value); setOffsetTouched(true); }} onKeyDown={(e) => { if (e.key === 'Enter') commitOffset(); }} /></label>
            <span className="hint">Move the mouse to the side you want and click, or type a distance and press Enter</span>
          </div>
        )}
        {section && (
          <div className="dialog" data-testid="section-dialog">
            <div className="dhead">SECTION AS DXF</div>
            <label className="drow"><span>Body</span><select aria-label="Section body" value={section.body} onChange={(e) => setSection({ ...section, body: e.target.value })}>{snap.bodies.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></label>
            <label className="drow"><span>Plane</span><select aria-label="Section plane" value={section.plane} onChange={(e) => setSection({ ...section, plane: e.target.value as 'XY' | 'XZ' | 'YZ' })}><option value="XY">XY (cut across Z, a plan view)</option><option value="XZ">XZ (cut across Y, a front view)</option><option value="YZ">YZ (cut across X, a side view)</option></select></label>
            <label className="drow"><span>Position</span><input aria-label="Section position" type="text" value={section.offset} onChange={(e) => setSection({ ...section, offset: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void doSectionExport(); }} /></label>
            <div className="dnote">Cuts the body along the plane at that position (millimetres) and saves the outline of the cut as DXF lines and arcs, with Z up for the front and side views. Nothing is added to your design.</div>
            <div className="dbtns"><button onClick={() => setSection(null)}>Cancel</button><button className="primary" data-testid="section-ok" onClick={() => void doSectionExport()}>Export DXF</button></div>
          </div>
        )}
        {measure && (
          <div className="dialog measure" data-testid="measure-panel">
            <div className="dhead">MEASURE</div>
            {!measure.length && <div className="dnote">Click a point (the end of an edge), an edge or a face. A second click measures between the two.</div>}
            {measure.map((m, i) => (
              <div key={i} className="mitem" data-testid={`measure-item-${i}`}>
                <div className="drow"><b>{i + 1}. {describeItem(m)}</b></div>
                {measureOne(m).map((r) => <div className="drow" key={r.label}><span>{r.label}</span><span data-testid="measure-value">{r.value}</span></div>)}
              </div>
            ))}
            {measure.length === 2 && <div className="mitem between" data-testid="measure-between">
              <div className="drow"><b>Between 1 and 2</b></div>
              {measureRows.map((r) => <div className="drow" key={r.label}><span>{r.label}</span><span data-testid="measure-value">{r.value}</span></div>)}
            </div>}
            <div className="dbtns"><button onClick={() => setMeasure([])}>Clear</button><button className="primary" data-testid="measure-close" onClick={() => setMeasure(null)}>Close</button></div>
          </div>
        )}
        {edit && (
          <div className="entry dim" data-testid="value-entry">
            <span>{edit.title}</span>
            <input autoFocus aria-label="Value" type="text" value={edit.value} onFocus={(e) => e.target.select()} onChange={(e) => setEdit({ ...edit, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { const { submit, value, option } = edit; setEdit(null); submit(value, option); } }} />
            {edit.options && (
              <select aria-label="Kind" data-testid="value-option" value={edit.option} onChange={(e) => setEdit({ ...edit, option: e.target.value, value: edit.valueFor ? edit.valueFor(e.target.value) : edit.value })}>
                {edit.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            )}
          </div>
        )}

        {placeImport && (
          <div className="confirm place" data-testid="place-import"><span>The file puts it with its centre at X {fmt(placeImport.centre[0])}, Y {fmt(placeImport.centre[1])} and its bottom at Z {fmt(placeImport.low)} (mm). Where should it go?</span>
            <button data-testid="place-keep" onClick={() => setPlaceImport(null)}>Keep that position</button>
            <button className="primary" data-testid="place-origin" onClick={() => { const p = placeImport; setPlaceImport(null); send([{ command: 'solid.move', params: { bodies: p.names, translate: [-Math.round(p.centre[0] * 1000) / 1000, -Math.round(p.centre[1] * 1000) / 1000, -Math.round(p.low * 1000) / 1000], copy: false } }]); setTimeout(() => viewApi.current?.setView('home'), 400); }}>Centre it on the origin, on the floor</button></div>
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
      {showKeys && <ShortcutsDialog onClose={() => setShowKeys(false)} />}
      {showUpdates && <UpdatesDialog info={upd.info} error={upd.error} dirty={snap.doc.dirty} act={upd.act} onClose={() => setShowUpdates(false)} />}
      {viewMenu && <ContextMenu x={viewMenu.x} y={viewMenu.y} items={viewItems()} onClose={() => setViewMenu(null)} />}
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
