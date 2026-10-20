import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Body, Sketch, SketchCurve, Vec2, Vec3 } from './api';
import { loopPolygon, curvePoints } from './sketch/loops';
import { findRegions } from './sketch/regions';
import { ORIGIN_PLANES, normalOf, rayToSketch, toWorld, type Plane } from './sketch/plane';
import { niceStep, round3, snapGrid } from './sketch/snap';
import { inferSnap, type Inference } from './sketch/inference';
import { pickEntity, type PickMode, type Picked } from './sketch/pick';
import { isDraw, preview as previewOf } from './sketch/tools';
import type { EdgeGeometry } from '../../server/src/engine/meshEdges';
import { applyTyped, sizeBoxes } from './sketch/tools';
import type { EdgeRef, Mode, PlanePick, ProfileRef, Tool, ViewApi } from './ui';

export interface FacePick { body: string; face: number; point: Vec3 }

/** A draggable arrow: starts `base` mm along `dir` from `origin` and ends `value` further on. */
export type Handle = { origin: Vec3; dir: Vec3; value: number; base?: number; /** When set the arrow is drawn this long whatever `value` is (Move: the arrows stay with the body, `value` is only what dragging changes) */ fixed?: number; color?: string; label?: string; onChange(v: number): void; onSubmit?(): void };
interface Props {
  bodies: Body[];
  sketches: Sketch[];
  activeSketch: Sketch | null;
  theme: string;
  mode: Mode;
  tool: Tool | null;
  pending: Vec2[];
  /** What the pointer can land on (null: nothing is picked), ids drawn as selected, and whether to show every sketch point. */
  pickMode: PickMode | null;
  highlight: string[];
  showPoints: boolean;
  hiddenBodies: Set<string>;
  hiddenSketches: Set<number>;
  showOrigin: boolean;
  showGrid: boolean;
  showEdges: boolean;
  showProfiles: boolean;
  snap: boolean;
  selectedFaces: { body: string; face: number }[];
  /** Whole bodies drawn as selected (Mirror and the patterns). */
  selectedBodies?: string[];
  selectedProfiles: ProfileRef[];
  /** The edges that can be picked while choosing edges (empty otherwise), and the ones drawn as selected. */
  edgeSets: { body: string; edges: EdgeGeometry[] }[];
  edgeHighlight: EdgeRef[];
  /** While true (Press Pull), a click in modify mode picks a face instead of an edge. */
  pickFaces?: boolean;
  /** An arrow that can be dragged to set a distance (Press Pull and Extrude): it starts at `origin`, points along `dir` and ends `value` away. */
  handle?: Handle | null;
  /** Several arrows at once (Move: one per axis). Used in place of `handle` when given. */
  handles?: Handle[];
  onEdgePick(ref: EdgeRef | null, additive: boolean): void;
  onFacePick(p: FacePick | null): void;
  onPlanePick(p: PlanePick): void;
  /** `pt` is snapped for drawing tools and exact for picking tools; `tol` is about 9 screen pixels in sketch units. */
  onSketchClick(pt: Vec2, tol: number, additive: boolean): void;
  /** The pointer was pressed at `a`, dragged and released at `b` with a drawing tool and nothing placed yet: the same as clicking a then b. */
  onSketchDrag(a: Vec2, b: Vec2): void;
  /** A rubber band dragged over empty space with no tool: `crossing` is true when dragged right to left (curves it touches count, not only those inside). */
  onSketchBox?(a: Vec2, b: Vec2, crossing: boolean, additive: boolean): void;
  /** Show the sizes of the sketch's curves (driving dimensions, and measured sizes where there is none) as labels you can double-click to change. */
  showDims?: boolean;
  /** A dimension label was double-clicked and a new value typed into it. */
  onDimEdit?(curveId: string, text: string): void;
  /** With no tool, pressing on a point or curve and dragging moves it ('move' for each step, 'end' on release). */
  onEntityDrag?(phase: 'start' | 'move' | 'end', ent: Picked, from: Vec2, to: Vec2): void;
  /** Sketches whose closed shapes can be clicked in the model view (the ones no feature has used yet). */
  fillSketches?: Set<number>;
  /** Extra outline drawn in the sketch while a tool shows what it would do (the Offset preview), as polylines in sketch coordinates. */
  extraPreview?: Vec2[][];
  /** The sizes typed into the boxes on the shape being drawn ('' = left to the pointer), and what to do when they change or Enter is pressed in one. */
  sizes?: string[];
  onSizeTyped?(i: number, text: string): void;
  onSizeSubmit?(): void;
  onSketchRightClick(): void;
  /** A right click in the view (not while a shape is half drawn): open the actions menu at the pointer. */
  onContextAt?(x: number, y: number): void;
  onProfilePick(sketch: number, index: number, at: Vec2, additive: boolean): void;
  onCursor(pt: Vec2 | null): void;
  apiRef: MutableRefObject<ViewApi | null>;
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const planeOf = (s: Sketch): Plane => s.plane;

/** The 3D view. Z is up in the model, as in the engine; while sketching the camera's up is the sketch's own y axis. */
export function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const S = useRef<null | { rebuild(what: 'bodies' | 'sketches' | 'planes' | 'preview' | 'camera' | 'edges' | 'handle'): void }>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); el.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 50000); cam.up.set(0, 0, 1); cam.position.set(150, -220, 130);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(200, -300, 400); scene.add(sun);
    const gBodies = new THREE.Group(), gSketch = new THREE.Group(), gPlanes = new THREE.Group(), gGrid = new THREE.Group(), gPreview = new THREE.Group(), gEdges = new THREE.Group(), gHandle = new THREE.Group();
    scene.add(gBodies, gSketch, gPlanes, gGrid, gPreview, gEdges, gHandle);
    const lineMats = new Set<LineMaterial>();
    // dimension values drawn as small labels over the sketch (plain HTML, moved to follow the camera every frame)
    const labelLayer = document.createElement('div'); labelLayer.className = 'dimlayer'; el.appendChild(labelLayer);
    const liveLayer = document.createElement('div'); liveLayer.className = 'dimlayer'; el.appendChild(liveLayer); // the sizes shown while a shape is being drawn
    let labels: { el: HTMLElement; w: THREE.Vector3 }[] = [];
    // the size boxes on the shape being drawn: real inputs (typing replaces the pointer's value), kept between rebuilds so focus survives
    let liveAnchors: { w: THREE.Vector3; text: string }[] = [];
    const liveInputs: HTMLInputElement[] = [];
    const ensureInputs = (n: number) => {
      while (liveInputs.length > n) { const x = liveInputs.pop()!; x.remove(); }
      while (liveInputs.length < n) {
        const i = liveInputs.length, el2 = document.createElement('input');
        el2.type = 'text'; el2.className = 'dimlabel live dimin'; el2.setAttribute('aria-label', i === 0 ? 'Typed size' : 'Second typed size'); el2.autocomplete = 'off'; el2.spellcheck = false;
        el2.addEventListener('focus', () => el2.select());
        el2.addEventListener('input', () => P.current.onSizeTyped?.(i, el2.value));
        el2.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); P.current.onSizeSubmit?.(); } });
        el2.addEventListener('blur', () => { if (el2.value.trim() === '') P.current.onSizeTyped?.(i, ''); });
        liveLayer.appendChild(el2); liveInputs.push(el2);
      }
    };
    const size = new THREE.Vector2(1, 1);

    // ---- controls: the middle button pans, Shift + middle orbits, the wheel zooms toward the cursor (as in Fusion)
    let ctl: OrbitControls;
    const makeControls = () => {
      const keep = ctl?.target.clone();
      ctl?.dispose();
      ctl = new OrbitControls(cam, dom);
      ctl.mouseButtons = { LEFT: -1 as never, MIDDLE: THREE.MOUSE.PAN, RIGHT: -1 as never };
      ctl.zoomToCursor = true; ctl.enableDamping = false;
      if (keep) ctl.target.copy(keep);
      ctl.update();
    };
    makeControls();
    const setUp = (up: THREE.Vector3) => { if (cam.up.distanceTo(up) < 1e-9) return; cam.up.copy(up); makeControls(); };

    const wpp = () => (2 * cam.position.distanceTo(ctl.target) * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(size.y, 1); // world units per pixel at the target
    const thick = (pts: number[], color: THREE.ColorRepresentation, width: number, opacity = 1) => {
      const g = new LineSegmentsGeometry(); g.setPositions(pts);
      const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity, depthTest: false });
      m.resolution.copy(size); lineMats.add(m);
      const l = new LineSegments2(g, m); l.renderOrder = 10; return l;
    };
    const dashed = (pts: number[], color: THREE.ColorRepresentation, width: number) => {
      const l = thick(pts, color, width, 0.9); const m = l.material as LineMaterial; m.dashed = true; m.dashSize = wpp() * 8 || 3; m.gapSize = wpp() * 5 || 2; l.computeLineDistances(); return l;
    };
    const clear = (g: THREE.Group) => { for (const c of [...g.children]) { g.remove(c); c.traverse((o: any) => { o.geometry?.dispose?.(); if (o.material?.isLineMaterial) lineMats.delete(o.material); o.material?.dispose?.(); }); } };

    // ---- bodies
    const rebuildBodies = () => {
      scene.background = new THREE.Color(css('--bg'));
      clear(gBodies);
      const p = P.current;
      const base = new THREE.Color(css('--muted')).lerp(new THREE.Color(0xffffff), 0.25), hi = new THREE.Color(css('--accent'));
      for (const b of p.bodies) {
        if (p.hiddenBodies.has(b.name)) continue;
        const n = b.indices.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const v = (b.indices[i] ?? 0) * 3; pos[i * 3] = b.positions[v] ?? 0; pos[i * 3 + 1] = b.positions[v + 1] ?? 0; pos[i * 3 + 2] = b.positions[v + 2] ?? 0; }
        for (let t = 0; t < b.faceIds.length; t++) { const on = !!p.selectedBodies?.includes(b.name) || p.selectedFaces.some((f) => f.body === b.name && f.face === b.faceIds[t]); const c = on ? hi : base; for (let k = 0; k < 3; k++) { col[(t * 3 + k) * 3] = c.r; col[(t * 3 + k) * 3 + 1] = c.g; col[(t * 3 + k) * 3 + 2] = c.b; } }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
        mesh.userData.body = b;
        if (p.showEdges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })));
        gBodies.add(mesh);
      }
    };

    // ---- sketches: curves, and filled regions while sketching or choosing what to extrude
    const curveSegments = (c: SketchCurve, plane: Plane): number[] => {
      const pts = curvePoints(c, 48); const out: number[] = [];
      const closed = c.type === 'circle';
      for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = toWorld(plane, pts[i]!), b = toWorld(plane, pts[(i + 1) % pts.length]!); out.push(...a, ...b); }
      return out;
    };
    const planeMatrix = (pl: Plane) => { const n = normalOf(pl); return new THREE.Matrix4().makeBasis(v3(pl.xDir), v3(pl.yDir), v3(n)).setPosition(v3(pl.origin)); };
    const rebuildSketches = () => {
      clear(gSketch);
      labelLayer.replaceChildren(); labels = [];
      const p = P.current;
      const cyan = css('--cyan'), text = css('--text'), accent = css('--accent');
      for (const s of p.sketches) {
        if (p.hiddenSketches.has(s.id) || !s.visible) continue;
        const plane = planeOf(s), isActive = s.active;
        if (p.showDims !== false) { // the sizes on the sketch: a driving dimension where there is one, otherwise the measured size (double-click either to change it)
          const n2 = (x: number) => String(Math.round(x * 1000) / 1000);
          const label = (curveId: string, at: Vec2, text: string, driving: boolean) => {
            const lab = document.createElement('div'); lab.className = `dimlabel dimedit${driving ? '' : ' measured'}`; lab.dataset.testid = driving ? 'dimlabel' : 'measured'; lab.dataset.curve = curveId; lab.textContent = text; lab.title = 'Double-click to change';
            lab.addEventListener('dblclick', (ev) => {
              ev.stopPropagation(); if (lab.querySelector('input')) return;
              const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'dimedit-input'; inp.setAttribute('aria-label', 'Dimension value'); inp.value = text.replace(/^[ØR]/, '');
              lab.textContent = ''; lab.appendChild(inp); inp.focus(); inp.select();
              let done = false;
              const finish = (commit: boolean) => { if (done) return; done = true; const val = inp.value.trim(); if (commit && val && val !== text.replace(/^[ØR]/, '')) P.current.onDimEdit?.(curveId, val); lab.textContent = text; };
              inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') { k.preventDefault(); finish(true); } else if (k.key === 'Escape') { k.stopPropagation(); finish(false); } k.stopPropagation(); });
              inp.addEventListener('blur', () => finish(false));
            });
            lab.addEventListener('pointerdown', (ev) => ev.stopPropagation());
            labelLayer.appendChild(lab); labels.push({ el: lab, w: v3(toWorld(plane, at)) });
          };
          const has = new Set<string>();
          for (const d of s.dimensions) {
            const c = s.curves.find((x) => x.id === d.curve); if (!c) continue;
            const at: Vec2 = c.start && c.end ? [(c.start[0] + c.end[0]) / 2, (c.start[1] + c.end[1]) / 2] : c.center ? [c.center[0] + (c.radius ?? 0), c.center[1]] : [0, 0];
            label(c.id, at, `${d.kind === 'diameter' ? 'Ø' : d.kind === 'radius' ? 'R' : ''}${n2(d.value)}`, true); has.add(c.id);
          }
          if (isActive) { // measured sizes for the curves that have no dimension; parallel lines of the same length share one label (a rectangle shows two)
            const mid: Vec2 = (() => { const xs = s.curves.flatMap((c) => c.start && c.end ? [c.start[0], c.end[0]] : c.center ? [c.center[0]] : []), ys = s.curves.flatMap((c) => c.start && c.end ? [c.start[1], c.end[1]] : c.center ? [c.center[1]] : []); return xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0]; })();
            const seen: { len: number; ang: number }[] = [];
            for (const c of s.curves) {
              if (c.construction || has.has(c.id)) continue;
              if (c.type === 'line' && c.start && c.end) {
                const dx = c.end[0] - c.start[0], dy = c.end[1] - c.start[1], len = Math.hypot(dx, dy); if (len < 1e-6) continue;
                const ang = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
                if (seen.some((q) => Math.abs(q.len - len) < 1e-6 && Math.min(Math.abs(q.ang - ang), Math.PI - Math.abs(q.ang - ang)) < 1e-6)) continue;
                seen.push({ len, ang });
                const m: Vec2 = [(c.start[0] + c.end[0]) / 2, (c.start[1] + c.end[1]) / 2];
                let nx = -dy / len, ny = dx / len; if ((m[0] - mid[0]) * nx + (m[1] - mid[1]) * ny < 0) { nx = -nx; ny = -ny; } // the label stands outside the shape
                const off = wpp() * 16;
                label(c.id, [m[0] + nx * off, m[1] + ny * off], n2(len), false);
              } else if (c.type === 'circle' && c.center && c.radius !== undefined) { const d = (c.radius + wpp() * 20) * Math.SQRT1_2; label(c.id, [c.center[0] + d, c.center[1] + d], `Ø${n2(2 * c.radius)}`, false); } // up and to the right of the circle, not over it or its rim
              else if (c.type === 'arc' && c.center && c.radius !== undefined) { const d = (c.radius + wpp() * 20) * Math.SQRT1_2; label(c.id, [c.center[0] + d, c.center[1] + d], `R${n2(c.radius)}`, false); }
            }
          }
        }
        const open: number[] = [], solid: number[] = [], construction: number[] = [];
        for (const c of s.curves) (c.construction ? construction : isActive && c.fullyConstrained ? solid : open).push(...curveSegments(c, plane));
        if (open.length) gSketch.add(thick(open, cyan, isActive ? 2.5 : 1.75, isActive ? 1 : 0.7));
        if (solid.length) gSketch.add(thick(solid, text, 2.5));
        if (construction.length) gSketch.add(dashed(construction, css('--muted'), 1.5));
        const wantFill = p.showProfiles && ((p.mode === 'sketch' && isActive) || (p.mode === 'extrude' && !isActive) || (p.mode === 'model' && !isActive && !!p.fillSketches?.has(s.id)));
        if (wantFill) {
          const regions = findRegions(s.curves, s.profiles); // the real outline of each region, also when it is only part of a circle
          for (const pr of s.profiles) {
            const rg = regions.find((r) => r.index === pr.index);
            const outer = rg ? rg.outer : loopPolygon(s.curves, pr.curves); if (outer.length < 3) continue;
            const shape = new THREE.Shape(outer.map((q) => new THREE.Vector2(q[0], q[1])));
            const holePolys = rg ? rg.holes : pr.holes.map((h) => loopPolygon(s.curves, h));
            for (const hp of holePolys) if (hp.length >= 3) shape.holes.push(new THREE.Path(hp.map((q) => new THREE.Vector2(q[0], q[1]))));
            const picked = p.selectedProfiles.some((r) => r.sketch === s.id && r.index === pr.index);
            const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: picked ? accent : cyan, transparent: true, opacity: picked ? 0.55 : 0.22, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
            mesh.matrixAutoUpdate = false; mesh.matrix.copy(planeMatrix(plane));
            mesh.userData = { sketch: s.id, index: pr.index, extrude: p.mode === 'extrude' || p.mode === 'model' || (p.mode === 'sketch' && !p.tool) };
            gSketch.add(mesh);
          }
        }
      }
    };

    // ---- planes to sketch on (and the origin planes when shown)
    const modelRadius = () => {
      const b = new THREE.Box3(); gBodies.children.forEach((o) => b.expandByObject(o)); gSketch.children.forEach((o) => { if ((o as any).isLineSegments2) b.expandByObject(o); });
      return b.isEmpty() ? 60 : Math.max(40, b.getSize(new THREE.Vector3()).length() * 0.6);
    };
    let planeMeshes: THREE.Mesh[] = [];
    const rebuildPlanes = () => {
      clear(gPlanes); planeMeshes = [];
      const p = P.current;
      if (!(p.mode === 'pickPlane' || p.showOrigin)) return;
      const r = modelRadius();
      const colors: Record<string, string> = { XY: '#4f8fe0', XZ: '#4caf7a', YZ: '#e0605a' };
      for (const key of ['XY', 'XZ', 'YZ'] as const) {
        const pl = ORIGIN_PLANES[key];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 1.6), new THREE.MeshBasicMaterial({ color: colors[key]!, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
        m.matrixAutoUpdate = false; m.matrix.copy(planeMatrix(pl)); m.userData.plane = key;
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: colors[key]!, transparent: true, opacity: 0.8 }));
        m.add(edge); gPlanes.add(m); planeMeshes.push(m);
      }
    };

    // ---- grid in the sketch plane
    let gridKey = '';
    const updateGrid = () => {
      const p = P.current, s = p.activeSketch;
      if (!(p.mode === 'sketch' && s && p.showGrid)) { if (gGrid.children.length) clear(gGrid); gridKey = ''; return; }
      const step = niceStep(wpp() * 14);
      const half = Math.ceil((cam.position.distanceTo(ctl.target) * 1.3) / (step * 10)) * step * 10;
      const key = `${s.id}:${step}:${half}`;
      if (key === gridKey) return;
      gridKey = key; clear(gGrid);
      const plane = planeOf(s), minor: number[] = [], major: number[] = [];
      const n = Math.round(half / step);
      for (let i = -n; i <= n; i++) {
        const t = i * step, bucket = i % 10 === 0 ? major : minor;
        bucket.push(...toWorld(plane, [t, -half]), ...toWorld(plane, [t, half]), ...toWorld(plane, [-half, t]), ...toWorld(plane, [half, t]));
      }
      const line = css('--line');
      const mk = (pts: number[], w: number, o: number) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: line, transparent: true, opacity: o, depthWrite: false })); };
      gGrid.add(mk(minor, 1, 0.45), mk(major, 1, 0.95));
      gGrid.add(thick([...toWorld(plane, [-half, 0]), ...toWorld(plane, [half, 0])], '#e0605a', 1.5, 0.8), thick([...toWorld(plane, [0, -half]), ...toWorld(plane, [0, half])], '#4caf7a', 1.5, 0.8));
    };

    // ---- the cursor, the shape being drawn, what is under the pointer and what is selected
    let cursor: Vec2 | null = null;
    let lastSnap: Inference | null = null; // what the pointer snapped to last (drawn as a marker while drawing)
    let hover: Picked | null = null;
    const rebuildPreview = () => {
      clear(gPreview);
      const p = P.current, s = p.activeSketch;
      if (!(p.mode === 'sketch' && s)) return;
      const plane = planeOf(s), amber = css('--amber');
      const flat = (poly: Vec2[]) => { const o: number[] = []; for (let i = 0; i < poly.length - 1; i++) o.push(...toWorld(plane, poly[i]!), ...toWorld(plane, poly[i + 1]!)); return o; };
      for (const poly of p.extraPreview ?? []) if (poly.length > 1) gPreview.add(thick(flat(poly), amber, 2)); // Offset: the outline as it would be
      if (isDraw(p.tool) && cursor && p.pending.length) { const seg = previewOf(p.tool, p.pending, applyTyped(p.tool, p.pending, cursor, p.sizes ?? [])).flatMap(flat); if (seg.length) gPreview.add(thick(seg, amber, 2)); }
      liveAnchors = [];
      if (isDraw(p.tool) && cursor && p.pending.length) { // the boxes on the shape being drawn, for the stage it is at
        const n = (x: number) => String(Math.round(x * 100) / 100);
        for (const bx of sizeBoxes(p.tool, p.pending, applyTyped(p.tool, p.pending, cursor, p.sizes ?? []))) liveAnchors.push({ w: new THREE.Vector3(...toWorld(plane, bx.at)), text: n(bx.value) });
      }
      ensureInputs(liveAnchors.length);
      const mark = (at: Vec2, k: number, w: number) => { const [x, y] = at, sq: Vec2[] = [[x - k, y - k], [x + k, y - k], [x + k, y + k], [x - k, y + k], [x - k, y - k]]; return thick(flat(sq), amber, w); };
      if (p.showPoints) for (const q of s.points) gPreview.add(mark(q.at, wpp() * 3, 1.25));
      const showEntity = (e: Picked, w: number) => {
        if (e.kind === 'curve') { const c = s.curves.find((x) => x.id === e.id); if (c) gPreview.add(thick(curveSegments(c, plane), amber, w)); }
        else { const q = s.points.find((x) => x.id === e.id); if (q) gPreview.add(mark(q.at, wpp() * 6, 2.5)); }
      };
      for (const id of p.highlight) { const c = s.curves.find((x) => x.id === id); showEntity(c ? { kind: 'curve', id } : { kind: 'point', id }, 4); }
      if (hover && p.pickMode) showEntity(hover, 3);
      if (cursor && isDraw(p.tool)) gPreview.add(mark(cursor, wpp() * 6, 1.5));
      if (cursor && isDraw(p.tool) && lastSnap) { // Fusion-style hints: a square for an end or centre, a triangle for a middle, a cross for a crossing, dashed lines for alignment
        const k = wpp() * 7, [x, y] = cursor, sn = lastSnap, cyan = css('--cyan');
        if (sn.kind === 'mid') gPreview.add(thick(flat([[x - k, y - k], [x + k, y - k], [x, y + k], [x - k, y - k]]), cyan, 2.5));
        else if (sn.kind === 'inter') { gPreview.add(thick(flat([[x - k, y - k], [x + k, y + k]]), cyan, 2.5)); gPreview.add(thick(flat([[x - k, y + k], [x + k, y - k]]), cyan, 2.5)); }
        else if (sn.kind === 'align') {
          for (const g of [sn.x && { from: sn.x.from, to: [sn.x.value, y] as Vec2 }, sn.y && { from: sn.y.from, to: [x, sn.y.value] as Vec2 }]) if (g) gPreview.add(thick(flat([g.from, g.to]), css('--amber'), 1.25));
        } else gPreview.add(thick(flat([[x - k, y - k], [x + k, y - k], [x + k, y + k], [x - k, y + k], [x - k, y - k]]), cyan, 2.5));
      }
    };

    // ---- edges: the one under the pointer and the selected ones
    let hoverEdge: EdgeRef | null = null;
    const rebuildEdges = () => {
      clear(gEdges);
      const p = P.current;
      const find = (r: EdgeRef) => p.edgeSets.find((s) => s.body === r.body)?.edges.find((x) => x.index === r.index);
      for (const r of p.edgeHighlight) { const g = find(r); if (g) gEdges.add(thick(g.segments, css('--accent'), 4.5)); }
      if (hoverEdge && p.mode === 'modify') { const g = find(hoverEdge); if (g) gEdges.add(thick(g.segments, css('--amber'), 3.5)); }
    };
    // ---- the drag arrow of Press Pull and Extrude: a line from the face to the distance, with a cone at the tip
    const handleList = (): Handle[] => P.current.handles ?? (P.current.handle ? [P.current.handle] : []);
    const geomOf = (h: Handle) => {
      const d = new THREE.Vector3(...h.dir).normalize(), o = new THREE.Vector3(...h.origin).addScaledVector(d, h.base ?? 0), tip = o.clone().addScaledVector(d, h.fixed ?? h.value);
      return { o, d, tip };
    };
    const handleGeometry = () => { const h = handleList()[0]; return h ? geomOf(h) : null; };
    const rebuildHandle = () => {
      clear(gHandle);
      const k = wpp() * 11; // the cone is about 11 px across
      for (const h of handleList()) {
        const g = geomOf(h), col = new THREE.Color(h.color ?? css('--accent')), s = Math.sign((h.fixed ?? h.value) || 1);
        gHandle.add(thick([g.o.x, g.o.y, g.o.z, g.tip.x, g.tip.y, g.tip.z], h.color ?? css('--accent'), 3));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(k, k * 2.4, 20), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
        cone.position.copy(g.tip).addScaledVector(g.d, s * k * 1.2);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), g.d.clone().multiplyScalar(s));
        cone.renderOrder = 10; gHandle.add(cone);
      }
    };
    // the distance box beside each arrow's tip: shows the value while dragging, and typing a number into it moves the arrow
    const handleInputs: HTMLInputElement[] = [];
    const syncHandleInput = () => {
      const hs = handleList();
      while (handleInputs.length > hs.length) handleInputs.pop()!.remove();
      hs.forEach((h, i) => {
        let el3 = handleInputs[i];
        if (!el3) {
          el3 = document.createElement('input'); el3.type = 'text'; el3.className = 'dimlabel live dimin handle-input'; el3.autocomplete = 'off'; el3.spellcheck = false;
          el3.addEventListener('focus', () => el3!.select());
          el3.addEventListener('input', () => { const n = Number(el3!.value.replace(',', '.')); if (el3!.value.trim() !== '' && Number.isFinite(n)) handleList()[i]?.onChange(n); });
          el3.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); handleList()[i]?.onSubmit?.(); } });
          liveLayer.appendChild(el3); handleInputs[i] = el3;
        }
        el3.setAttribute('aria-label', h.label ?? 'Drag arrow value');
        const q = geomOf(h).tip.clone().project(cam);
        el3.style.left = `${((q.x + 1) / 2) * size.x + 54}px`; el3.style.top = `${((1 - q.y) / 2) * size.y - 16}px`;
        if (document.activeElement !== el3) el3.value = `${Math.round(h.value * 100) / 100}`;
        el3.style.width = `${Math.max(5, el3.value.length + 3)}ch`;
      });
    };
    const toPx = (v: THREE.Vector3) => { const q = v.clone().project(cam), r = dom.getBoundingClientRect(); return new THREE.Vector2(((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height); };
    let drag: { i: number; m0: THREE.Vector2; v0: number; u: THREE.Vector2; pxPerMm: number } | null = null;
    /** Whether a pointer press grabs an arrow (near its tip or its shaft; the nearest of several), and the drag it starts. */
    const grabHandle = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect(), m = new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
      let best = -1, bd = Infinity, bu: THREE.Vector2 | null = null;
      handleList().forEach((h, i) => {
        const g = geomOf(h), a = toPx(g.o), tp = toPx(g.tip), ab = tp.clone().sub(a), len2 = ab.lengthSq();
        const s = len2 > 1 ? Math.max(0, Math.min(1, m.clone().sub(a).dot(ab) / len2)) : 0;
        const dist = Math.min(m.distanceTo(a.clone().addScaledVector(ab, s)) - 12, m.distanceTo(tp) - 18);
        if (dist > 0) return;
        const unit = toPx(g.o.clone().addScaledVector(g.d, 10)).sub(a); // 10 mm along the arrow, in pixels
        if (unit.length() < 3) return; // looking straight down the arrow: it cannot be dragged
        const near = m.distanceTo(tp);
        if (near < bd) { bd = near; best = i; bu = unit; }
      });
      if (best < 0 || !bu) return false;
      const u: THREE.Vector2 = bu;
      drag = { i: best, m0: m, v0: handleList()[best]!.value, u: u.clone().normalize(), pxPerMm: u.length() / 10 };
      return true;
    };
    const dragHandle = (e: PointerEvent) => {
      const h = drag && handleList()[drag.i]; if (!drag || !h) return;
      const r = dom.getBoundingClientRect(), m = new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
      const raw = drag.v0 + m.sub(drag.m0).dot(drag.u) / drag.pxPerMm, step = e.shiftKey ? 0.1 : 0.5;
      h.onChange(Math.round(raw / step) * step);
    };
    /** How far from the camera the edge a-b is where the pick ray passes it (the closest point of the segment to the ray; a screen-space fraction would be wrong under perspective). */
    const depthAlong = (a: THREE.Vector3, b: THREE.Vector3) => {
      const o = ray.ray.origin, d = ray.ray.direction, u = b.clone().sub(a), w0 = a.clone().sub(o);
      const A = u.dot(u), B = u.dot(d), D = u.dot(w0), E = d.dot(w0), den = A - B * B; // d is a unit vector
      const s = den > 1e-12 ? Math.max(0, Math.min(1, (B * E - D) / den)) : 0;
      return o.distanceTo(a.clone().addScaledVector(u, s));
    };
    /** The edge nearest the pointer within a few pixels, ignoring edges hidden behind a face. */
    const pickEdge = (e: { clientX: number; clientY: number }): EdgeRef | null => {
      const r = dom.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      setRay(e);
      const hit = ray.intersectObjects(gBodies.children, false)[0], dFace = hit ? hit.distance : Infinity;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
      const toPx = (v: THREE.Vector3) => { q.copy(v).project(cam); return [((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height, q.z] as const; };
      let best: EdgeRef | null = null, bd = 9; // pixels
      for (const set of P.current.edgeSets) for (const g of set.edges) for (let i = 0; i < g.segments.length; i += 6) {
        a.set(g.segments[i]!, g.segments[i + 1]!, g.segments[i + 2]!); b.set(g.segments[i + 3]!, g.segments[i + 4]!, g.segments[i + 5]!);
        const [ax, ay, az] = toPx(a), [bx, by, bz] = toPx(b);
        if (az > 1 && bz > 1) continue;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / l2)) : 0;
        const d = Math.hypot(mx - (ax + t * dx), my - (ay + t * dy));
        if (d >= bd) continue;
        const depth = depthAlong(a, b);
        if (depth > dFace + Math.max(0.8, dFace * 0.004)) continue; // behind a face
        bd = d; best = { body: set.body, index: g.index };
      }
      return best;
    };

    // ---- camera helpers
    const target = () => ctl.target;
    const fit = () => {
      const b = new THREE.Box3(); gBodies.children.forEach((o) => b.expandByObject(o)); gSketch.children.forEach((o) => { if ((o as any).isLineSegments2) b.expandByObject(o); });
      let c: THREE.Vector3, r: number;
      if (b.isEmpty()) { c = new THREE.Vector3(); r = 60; } else { c = b.getCenter(new THREE.Vector3()); r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 5); }
      const dir = cam.position.clone().sub(ctl.target).normalize();
      ctl.target.copy(c); cam.position.copy(c).add(dir.multiplyScalar((r / Math.sin((cam.fov * Math.PI) / 360)) * 1.1)); ctl.update();
    };
    const DIRS: Record<string, [number, number, number]> = { top: [0, 0, 1], bottom: [0, 0, -1], front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0], home: [1.2, -1.6, 1] };
    const setView = (name: keyof typeof DIRS) => {
      setUp(new THREE.Vector3(0, 0, 1));
      const d = new THREE.Vector3(...DIRS[name]!).normalize();
      if (name === 'top') d.set(0, -1e-4, 1).normalize(); if (name === 'bottom') d.set(0, -1e-4, -1).normalize();
      const dist = cam.position.distanceTo(ctl.target);
      cam.position.copy(ctl.target).add(d.multiplyScalar(dist)); ctl.update(); fit();
    };
    const lookAtSketch = (s: Sketch) => {
      const pl = planeOf(s), n = v3(normalOf(pl)).normalize();
      setUp(v3(pl.yDir));
      const dist = Math.max(cam.position.distanceTo(ctl.target), 60);
      ctl.target.copy(v3(pl.origin)); cam.position.copy(v3(pl.origin)).add(n.multiplyScalar(dist)); ctl.update();
    };
    P.current.apiRef.current = { focusSize: (i: number, first?: string) => { const x = liveInputs[i]; if (!x) return false; x.focus(); if (first !== undefined) { x.value = first; P.current.onSizeTyped?.(i, first); } else x.select(); return true; }, fit, setView: (n) => setView(n), rotation: () => { const m = cam.matrixWorldInverse.elements; return [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!]; } };

    // ---- picking and pointer handling
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const setRay = (e: { clientX: number; clientY: number }) => { const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); };
    const rawPoint = (e: { clientX: number; clientY: number }): Vec2 | null => {
      const s = P.current.activeSketch; if (!s) return null;
      setRay(e);
      return rayToSketch(planeOf(s), [ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z], [ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z]);
    };
    const sketchPoint = (e: { clientX: number; clientY: number }): Vec2 | null => {
      const s = P.current.activeSketch; if (!s) return null;
      const raw = rawPoint(e);
      if (!raw) return null;
      const tol = wpp() * 9, grid = (): Vec2 => (P.current.snap ? snapGrid(raw, niceStep(wpp() * 14)) : ([round3(raw[0]), round3(raw[1])] as Vec2));
      const hit = inferSnap(raw, s.curves, tol, P.current.pending.length ? P.current.pending[P.current.pending.length - 1] : undefined);
      lastSnap = hit;
      if (!hit) return grid();
      if (hit.kind !== 'align') return hit.point;
      const g = grid(); // aligned in one direction (or both): the other direction follows the grid
      return [round3(hit.x ? hit.x.value : g[0]), round3(hit.y ? hit.y.value : g[1])];
    };
    const planarFaceHit = (): { body: string; point: Vec3; index: number } | null => {
      for (const h of ray.intersectObjects(gBodies.children, false)) {
        const b = h.object.userData.body as Body | undefined; if (!b || h.faceIndex == null) continue;
        const face = b.faces.find((f) => f.index === b.faceIds[h.faceIndex!]);
        if (face?.planeNormal) return { body: b.name, point: h.point.toArray() as Vec3, index: face.index };
        return null; // the nearest surface is curved: nothing to sketch on
      }
      return null;
    };

    let down: [number, number] | null = null;
    let drawFrom: Vec2 | null = null; // where a drag with a drawing tool began
    let band: { from: Vec2; at: [number, number]; el: HTMLDivElement | null } | null = null; // the rubber band of a drag over empty space
    const endBand = () => { band?.el?.remove(); band = null; };
    let entDrag: { ent: Picked; from: Vec2; at: [number, number]; started: boolean; last: Vec2 } | null = null; // a point or curve being dragged in a sketch
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (grabHandle(e)) { down = null; dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing'; return; }
      down = [e.clientX, e.clientY];
      const q = P.current;
      entDrag = null;
      if (q.mode === 'sketch' && !q.tool && q.activeSketch && q.onEntityDrag) { const raw = rawPoint(e); const ent = raw ? pickEntity(q.activeSketch, raw, wpp() * 9, 'any') : null; if (ent && raw) entDrag = { ent, from: raw, at: [e.clientX, e.clientY], started: false, last: raw }; }
      drawFrom = q.mode === 'sketch' && isDraw(q.tool) && q.pending.length === 0 ? sketchPoint(e) : null;
      endBand();
      if (q.mode === 'sketch' && !q.tool && !entDrag && q.activeSketch && q.onSketchBox) { const raw = rawPoint(e); if (raw) band = { from: raw, at: [e.clientX, e.clientY], el: null }; }
    });
    // the shape under the pointer lights up (model view and Extrude), so it is clear what can be clicked
    let hoverFill: THREE.Object3D | null = null;
    const hoverProfile = (e: PointerEvent, suppress = false) => {
      const p = P.current; let hit: THREE.Object3D | null = null;
      if (!suppress && (p.mode === 'model' || p.mode === 'extrude' || (p.mode === 'sketch' && !p.tool))) {
        setRay(e);
        const ph = ray.intersectObjects(gSketch.children.filter((o) => o.userData.extrude), false)[0], bh = ray.intersectObjects(gBodies.children, false)[0];
        if (ph && (!bh || ph.distance < bh.distance + 1e-3)) hit = ph.object;
      }
      if (hit === hoverFill) return;
      hoverFill = hit;
      for (const o of gSketch.children) if (o.userData.extrude) {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial, picked = p.selectedProfiles.some((r) => r.sketch === o.userData.sketch && r.index === o.userData.index);
        m.color.set(picked || o === hit ? css('--accent') : css('--cyan')); m.opacity = picked ? 0.55 : o === hit ? 0.42 : 0.22;
      }
      dom.style.cursor = hit ? 'pointer' : '';
    };
    dom.addEventListener('pointermove', (e) => {
      if (drag) { dragHandle(e); return; }
      if (band && (band.el || Math.hypot(e.clientX - band.at[0], e.clientY - band.at[1]) > 4)) {
        const r = dom.getBoundingClientRect();
        if (!band.el) { band.el = document.createElement('div'); band.el.className = 'rubberband'; band.el.setAttribute('data-testid', 'rubberband'); liveLayer.appendChild(band.el); dom.setPointerCapture(e.pointerId); }
        const x0 = band.at[0] - r.left, y0 = band.at[1] - r.top, x1 = e.clientX - r.left, y1 = e.clientY - r.top;
        Object.assign(band.el.style, { left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
        band.el.classList.toggle('crossing', x1 < x0); // right to left touches, left to right needs the whole curve inside
        return;
      }
      if (entDrag && (entDrag.started || Math.hypot(e.clientX - entDrag.at[0], e.clientY - entDrag.at[1]) > 4)) {
        const to = sketchPoint(e) ?? rawPoint(e); if (!to) return;
        if (!entDrag.started) { entDrag.started = true; dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing'; P.current.onEntityDrag!('start', entDrag.ent, entDrag.from, entDrag.from); }
        P.current.onEntityDrag!('move', entDrag.ent, entDrag.last, to); entDrag.last = to; return;
      }
      if (P.current.mode !== 'sketch') hoverProfile(e);
      const p = P.current;
      if (p.mode === 'sketch') {
        const draw = isDraw(p.tool);
        const pt = draw ? sketchPoint(e) : rawPoint(e); cursor = pt; p.onCursor(pt);
        hover = pt && p.activeSketch && p.pickMode ? pickEntity(p.activeSketch, pt, wpp() * 9, p.pickMode) : null;
        hoverProfile(e, !!hover || !!p.tool); // a shape lights up when no curve is under the pointer
        rebuildPreview();
      } else if (p.mode === 'pickPlane') {
        setRay(e);
        const hit = ray.intersectObjects(planeMeshes, false)[0];
        planeMeshes.forEach((m) => ((m.material as THREE.MeshBasicMaterial).opacity = m === hit?.object ? 0.4 : 0.16));
      } else if (p.mode === 'modify' && !p.pickFaces) {
        const h = pickEdge(e);
        if (h?.body !== hoverEdge?.body || h?.index !== hoverEdge?.index) { hoverEdge = h; rebuildEdges(); }
      }
    });
    dom.addEventListener('pointerleave', () => { cursor = null; P.current.onCursor(null); if (P.current.mode === 'sketch') rebuildPreview(); });
    dom.addEventListener('pointerup', (e) => {
      if (drag) { drag = null; dom.style.cursor = ''; try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ } return; }
      if (entDrag?.started) { P.current.onEntityDrag!('end', entDrag.ent, entDrag.last, entDrag.last); entDrag = null; down = null; dom.style.cursor = ''; try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ } return; }
      entDrag = null;
      if (band?.el) {
        const to = rawPoint(e), crossing = e.clientX < band.at[0], from = band.from, additive = e.shiftKey || e.ctrlKey || e.metaKey;
        endBand(); down = null; drawFrom = null; try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        if (to) P.current.onSketchBox?.(from, to, crossing, additive);
        return;
      }
      endBand();
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4; down = null;
      if (moved) { // press, drag and release draws a shape in one go (the same as two clicks)
        const to = drawFrom && P.current.mode === 'sketch' ? sketchPoint(e) : null;
        if (drawFrom && to) P.current.onSketchDrag(drawFrom, to);
        drawFrom = null; return;
      }
      drawFrom = null;
      const p = P.current;
      if (p.mode === 'sketch') {
        const pt = isDraw(p.tool) ? sketchPoint(e) : rawPoint(e); if (!pt || !p.activeSketch) return;
        p.onSketchClick(pt, wpp() * 9, e.shiftKey || e.ctrlKey || e.metaKey);
      } else if (p.mode === 'pickPlane') {
        setRay(e);
        const hit = ray.intersectObjects(planeMeshes, false)[0];
        const face = planarFaceHit();
        const bodyDist = ray.intersectObjects(gBodies.children, false)[0]?.distance ?? Infinity;
        if (face && bodyDist <= (hit?.distance ?? Infinity)) p.onPlanePick({ face: face.point, body: face.body, index: face.index });
        else if (hit) p.onPlanePick({ plane: hit.object.userData.plane });
      } else if (p.mode === 'modify' && !p.pickFaces) {
        p.onEdgePick(pickEdge(e), e.shiftKey || e.ctrlKey || e.metaKey);
      } else if (p.mode === 'extrude') {
        setRay(e);
        const hit = ray.intersectObjects(gSketch.children.filter((o) => o.userData.extrude), false)[0];
        if (hit) { const s = p.sketches.find((x) => x.id === hit.object.userData.sketch); if (s) { const pt = rayToSketch(planeOf(s), [ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z], [ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z]); if (pt) p.onProfilePick(s.id, hit.object.userData.index, pt, e.shiftKey || e.ctrlKey || e.metaKey); } }
      } else {
        setRay(e);
        const hit = ray.intersectObjects(gBodies.children, false)[0];
        const ph = ray.intersectObjects(gSketch.children.filter((o) => o.userData.extrude), false)[0];
        if (ph && (!hit || ph.distance < hit.distance + 1e-3)) { // a closed shape of a finished sketch: select it, then E extrudes it
          const s = p.sketches.find((x) => x.id === ph.object.userData.sketch);
          if (s) { const pt = rayToSketch(planeOf(s), [ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z], [ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z]); if (pt) { p.onProfilePick(s.id, ph.object.userData.index, pt, e.shiftKey || e.ctrlKey || e.metaKey); return; } }
        }
        const b = hit && (hit.object.userData.body as Body | undefined);
        if (hit && b && hit.faceIndex != null) p.onFacePick({ body: b.name, face: b.faceIds[hit.faceIndex] ?? 0, point: hit.point.toArray() as Vec3 });
        else p.onFacePick(null);
      }
    });
    dom.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const q = P.current;
      if (q.mode === 'sketch' && q.pending.length) q.onSketchRightClick(); // a shape or chain is under way: right click ends it, as before
      else q.onContextAt?.(e.clientX, e.clientY);
    });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); size.set(w, h); lineMats.forEach((m) => m.resolution.set(w, h)); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let lastMode: Mode | null = null, lastSketchId: number | null = null;
    S.current = {
      rebuild: (what) => {
        if (what === 'bodies') rebuildBodies();
        if (what === 'sketches') rebuildSketches();
        if (what === 'planes') rebuildPlanes();
        if (what === 'preview') rebuildPreview();
        if (what === 'handle') rebuildHandle();
        if (what === 'edges') { if (P.current.mode !== 'modify') hoverEdge = null; rebuildEdges(); }
        if (what === 'camera') {
          const p = P.current;
          const id = p.mode === 'sketch' ? (p.activeSketch?.id ?? null) : null;
          if (id !== null && id !== lastSketchId) lookAtSketch(p.activeSketch!);
          if (p.mode !== 'sketch' && lastMode === 'sketch') { setView('home'); } // leaving a sketch: back to an angled view of the whole model
          lastSketchId = id; lastMode = p.mode;
        }
      },
    };
    let raf = 0, firstFit = false;
    const loop = () => {
      raf = requestAnimationFrame(loop); ctl.update(); updateGrid(); renderer.render(scene, cam);
      syncHandleInput();
      liveInputs.forEach((inp, i) => {
        const an = liveAnchors[i]; if (!an) return;
        const q = an.w.clone().project(cam); inp.style.left = `${((q.x + 1) / 2) * size.x}px`; inp.style.top = `${((1 - q.y) / 2) * size.y}px`;
        if (document.activeElement !== inp) inp.value = (P.current.sizes?.[i] ?? '') !== '' ? P.current.sizes![i]! : an.text; // not being edited: the typed value, or what the pointer gives
        inp.style.width = `${Math.max(4, inp.value.length + 1)}ch`;
      });
      for (const l of labels) { const q = l.w.clone().project(cam); l.el.style.display = q.z > 1 ? 'none' : ''; l.el.style.left = `${((q.x + 1) / 2) * size.x}px`; l.el.style.top = `${((1 - q.y) / 2) * size.y}px`; }
    };
    loop();
    (window as any).__forge = {
      project: (w: number[]) => { const v = new THREE.Vector3(w[0], w[1], w[2]).project(cam); const r = dom.getBoundingClientRect(); return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]; },
      sketchToScreen: (q: Vec2) => { const s = P.current.activeSketch; if (!s) return null; const w = toWorld(planeOf(s), q); return (window as any).__forge.project(w); },
      pointerSnap: () => cursor,
      /** test hook: what the pointer snapped to last */
      snapKind: () => lastSnap?.kind ?? null,
      /** test hook: the pickable shapes of the sketches and whether each is lit (hovered or selected) */
      fills: () => gSketch.children.filter((o) => o.userData.extrude).map((o) => ({ sketch: o.userData.sketch, index: o.userData.index, opacity: Math.round(((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity * 100) / 100 })),
      /** test hook: where the drag arrow's tip is on screen, and its value */
      handleTip: (i = 0) => { const h = handleList()[i]; if (!h) return null; const g = geomOf(h); return { at: (window as any).__forge.project([g.tip.x, g.tip.y, g.tip.z]), value: h.value }; },
      // test hook: what the edge picker finds at the screen position of a world point
      edgeAt: (w: number[]) => { const [x, y] = (window as any).__forge.project(w); const sets = P.current.edgeSets; return { sets: sets.length, edges: sets.reduce((n, t) => n + t.edges.length, 0), pick: pickEdge({ clientX: x, clientY: y }), mode: P.current.mode }; },
    };
    const fitOnce = () => { if (!firstFit && gBodies.children.length) { firstFit = true; fit(); } };
    (S.current as any).fitOnce = fitOnce;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); renderer.dispose(); el.removeChild(dom); S.current = null; endBand(); labelLayer.remove(); handleInputs.forEach((x) => x.remove()); liveInputs.length = 0; liveLayer.remove(); delete (window as any).__forge; };
  }, []);

  const p = props;
  useEffect(() => { S.current?.rebuild('bodies'); (S.current as any)?.fitOnce?.(); }, [p.bodies, p.hiddenBodies, p.selectedFaces, p.selectedBodies, p.showEdges, p.theme]);
  useEffect(() => { S.current?.rebuild('sketches'); }, [p.sketches, p.hiddenSketches, p.mode, p.tool, p.showProfiles, p.selectedProfiles, p.theme, p.showDims]);
  useEffect(() => { S.current?.rebuild('planes'); }, [p.mode, p.showOrigin, p.bodies, p.theme]);
  useEffect(() => { S.current?.rebuild('preview'); }, [p.pending, p.tool, p.mode, p.activeSketch, p.pickMode, p.highlight, p.showPoints, p.extraPreview, p.sizes?.join('|')]);
  useEffect(() => { S.current?.rebuild('camera'); }, [p.mode, p.activeSketch?.id]);
  useEffect(() => { S.current?.rebuild('handle'); }, [p.handle?.origin.join(), p.handle?.dir.join(), p.handle?.value, p.handles?.map((h) => `${h.origin.join()}|${h.dir.join()}|${h.value}|${h.base}|${h.fixed}`).join(';'), p.theme]);
  useEffect(() => { S.current?.rebuild('edges'); }, [p.mode, p.edgeSets, p.edgeHighlight, p.theme]);

  return <div className="viewport" ref={host} data-testid="viewport" />;
}
