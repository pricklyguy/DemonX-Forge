import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Body, Sketch, SketchCurve, Vec2, Vec3 } from './api';
import { loopPolygon, curvePoints } from './sketch/loops';
import { ORIGIN_PLANES, normalOf, rayToSketch, toWorld, type Plane } from './sketch/plane';
import { niceStep, round3, snapGrid, snapPoints } from './sketch/snap';
import { pickEntity, type PickMode, type Picked } from './sketch/pick';
import { isDraw, preview as previewOf } from './sketch/tools';
import type { EdgeGeometry } from '../../server/src/engine/meshEdges';
import type { EdgeRef, Mode, PlanePick, ProfileRef, Tool, ViewApi } from './ui';

export interface FacePick { body: string; face: number; point: Vec3 }

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
  selectedFace: { body: string; face: number } | null;
  selectedProfiles: ProfileRef[];
  /** The edges that can be picked while choosing edges (empty otherwise), and the ones drawn as selected. */
  edgeSets: { body: string; edges: EdgeGeometry[] }[];
  edgeHighlight: EdgeRef[];
  onEdgePick(ref: EdgeRef | null, additive: boolean): void;
  onFacePick(p: FacePick | null): void;
  onPlanePick(p: PlanePick): void;
  /** `pt` is snapped for drawing tools and exact for picking tools; `tol` is about 9 screen pixels in sketch units. */
  onSketchClick(pt: Vec2, tol: number, additive: boolean): void;
  onSketchRightClick(): void;
  onProfilePick(sketch: number, index: number, at: Vec2): void;
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
  const S = useRef<null | { rebuild(what: 'bodies' | 'sketches' | 'planes' | 'preview' | 'camera' | 'edges'): void }>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); el.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 50000); cam.up.set(0, 0, 1); cam.position.set(150, -220, 130);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(200, -300, 400); scene.add(sun);
    const gBodies = new THREE.Group(), gSketch = new THREE.Group(), gPlanes = new THREE.Group(), gGrid = new THREE.Group(), gPreview = new THREE.Group(), gEdges = new THREE.Group();
    scene.add(gBodies, gSketch, gPlanes, gGrid, gPreview, gEdges);
    const lineMats = new Set<LineMaterial>();
    // dimension values drawn as small labels over the sketch (plain HTML, moved to follow the camera every frame)
    const labelLayer = document.createElement('div'); labelLayer.className = 'dimlayer'; el.appendChild(labelLayer);
    let labels: { el: HTMLElement; w: THREE.Vector3 }[] = [];
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
        for (let t = 0; t < b.faceIds.length; t++) { const on = p.selectedFace?.body === b.name && p.selectedFace.face === b.faceIds[t]; const c = on ? hi : base; for (let k = 0; k < 3; k++) { col[(t * 3 + k) * 3] = c.r; col[(t * 3 + k) * 3 + 1] = c.g; col[(t * 3 + k) * 3 + 2] = c.b; } }
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
        for (const d of s.dimensions) {
          const c = s.curves.find((x) => x.id === d.curve); if (!c) continue;
          const at: Vec2 = c.start && c.end ? [(c.start[0] + c.end[0]) / 2, (c.start[1] + c.end[1]) / 2] : c.center ? [c.center[0] + (c.radius ?? 0), c.center[1]] : [0, 0];
          const lab = document.createElement('div'); lab.className = 'dimlabel'; lab.dataset.testid = 'dimlabel';
          lab.textContent = `${d.kind === 'diameter' ? 'Ø' : d.kind === 'radius' ? 'R' : ''}${Math.round(d.value * 1000) / 1000}`;
          labelLayer.appendChild(lab); labels.push({ el: lab, w: v3(toWorld(plane, at)) });
        }
        const open: number[] = [], solid: number[] = [], construction: number[] = [];
        for (const c of s.curves) (c.construction ? construction : isActive && c.fullyConstrained ? solid : open).push(...curveSegments(c, plane));
        if (open.length) gSketch.add(thick(open, cyan, isActive ? 2.5 : 1.75, isActive ? 1 : 0.7));
        if (solid.length) gSketch.add(thick(solid, text, 2.5));
        if (construction.length) gSketch.add(dashed(construction, css('--muted'), 1.5));
        const wantFill = p.showProfiles && ((p.mode === 'sketch' && isActive) || (p.mode === 'extrude' && !isActive));
        if (wantFill) {
          for (const pr of s.profiles) {
            const outer = loopPolygon(s.curves, pr.curves); if (outer.length < 3) continue;
            const shape = new THREE.Shape(outer.map((q) => new THREE.Vector2(q[0], q[1])));
            for (const h of pr.holes) { const hp = loopPolygon(s.curves, h); if (hp.length >= 3) shape.holes.push(new THREE.Path(hp.map((q) => new THREE.Vector2(q[0], q[1])))); }
            const picked = p.selectedProfiles.some((r) => r.sketch === s.id && r.index === pr.index);
            const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: picked ? accent : cyan, transparent: true, opacity: picked ? 0.55 : 0.22, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
            mesh.matrixAutoUpdate = false; mesh.matrix.copy(planeMatrix(plane));
            mesh.userData = { sketch: s.id, index: pr.index, extrude: p.mode === 'extrude' };
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
    let hover: Picked | null = null;
    const rebuildPreview = () => {
      clear(gPreview);
      const p = P.current, s = p.activeSketch;
      if (!(p.mode === 'sketch' && s)) return;
      const plane = planeOf(s), amber = css('--amber');
      const flat = (poly: Vec2[]) => { const o: number[] = []; for (let i = 0; i < poly.length - 1; i++) o.push(...toWorld(plane, poly[i]!), ...toWorld(plane, poly[i + 1]!)); return o; };
      if (isDraw(p.tool) && cursor && p.pending.length) { const seg = previewOf(p.tool, p.pending, cursor).flatMap(flat); if (seg.length) gPreview.add(thick(seg, amber, 2)); }
      const mark = (at: Vec2, k: number, w: number) => { const [x, y] = at, sq: Vec2[] = [[x - k, y - k], [x + k, y - k], [x + k, y + k], [x - k, y + k], [x - k, y - k]]; return thick(flat(sq), amber, w); };
      if (p.showPoints) for (const q of s.points) gPreview.add(mark(q.at, wpp() * 3, 1.25));
      const showEntity = (e: Picked, w: number) => {
        if (e.kind === 'curve') { const c = s.curves.find((x) => x.id === e.id); if (c) gPreview.add(thick(curveSegments(c, plane), amber, w)); }
        else { const q = s.points.find((x) => x.id === e.id); if (q) gPreview.add(mark(q.at, wpp() * 6, 2.5)); }
      };
      for (const id of p.highlight) { const c = s.curves.find((x) => x.id === id); showEntity(c ? { kind: 'curve', id } : { kind: 'point', id }, 4); }
      if (hover && p.pickMode) showEntity(hover, 3);
      if (cursor && isDraw(p.tool)) gPreview.add(mark(cursor, wpp() * 6, 1.5));
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
    P.current.apiRef.current = { fit, setView: (n) => setView(n), rotation: () => { const m = cam.matrixWorldInverse.elements; return [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!]; } };

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
      const known: Vec2[] = [[0, 0]];
      for (const c of s.curves) { if (c.start) known.push(c.start); if (c.end) known.push(c.end); if (c.center) known.push(c.center); }
      const tol = wpp() * 9;
      const hit = snapPoints(raw, known, tol);
      if (hit) return hit;
      return P.current.snap ? snapGrid(raw, niceStep(wpp() * 14)) : ([round3(raw[0]), round3(raw[1])] as Vec2);
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
    dom.addEventListener('pointerdown', (e) => { if (e.button === 0) down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointermove', (e) => {
      const p = P.current;
      if (p.mode === 'sketch') {
        const draw = isDraw(p.tool);
        const pt = draw ? sketchPoint(e) : rawPoint(e); cursor = pt; p.onCursor(pt);
        hover = pt && p.activeSketch && p.pickMode ? pickEntity(p.activeSketch, pt, wpp() * 9, p.pickMode) : null;
        rebuildPreview();
      } else if (p.mode === 'pickPlane') {
        setRay(e);
        const hit = ray.intersectObjects(planeMeshes, false)[0];
        planeMeshes.forEach((m) => ((m.material as THREE.MeshBasicMaterial).opacity = m === hit?.object ? 0.4 : 0.16));
      } else if (p.mode === 'modify') {
        const h = pickEdge(e);
        if (h?.body !== hoverEdge?.body || h?.index !== hoverEdge?.index) { hoverEdge = h; rebuildEdges(); }
      }
    });
    dom.addEventListener('pointerleave', () => { cursor = null; P.current.onCursor(null); if (P.current.mode === 'sketch') rebuildPreview(); });
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4; down = null;
      if (moved) return;
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
      } else if (p.mode === 'modify') {
        p.onEdgePick(pickEdge(e), e.shiftKey || e.ctrlKey || e.metaKey);
      } else if (p.mode === 'extrude') {
        setRay(e);
        const hit = ray.intersectObjects(gSketch.children.filter((o) => o.userData.extrude), false)[0];
        if (hit) { const s = p.sketches.find((x) => x.id === hit.object.userData.sketch); if (s) { const pt = rayToSketch(planeOf(s), [ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z], [ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z]); if (pt) p.onProfilePick(s.id, hit.object.userData.index, pt); } }
      } else {
        setRay(e);
        const hit = ray.intersectObjects(gBodies.children, false)[0];
        const b = hit && (hit.object.userData.body as Body | undefined);
        if (hit && b && hit.faceIndex != null) p.onFacePick({ body: b.name, face: b.faceIds[hit.faceIndex] ?? 0, point: hit.point.toArray() as Vec3 });
        else p.onFacePick(null);
      }
    });
    dom.addEventListener('contextmenu', (e) => { e.preventDefault(); if (P.current.mode === 'sketch') P.current.onSketchRightClick(); });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); size.set(w, h); lineMats.forEach((m) => m.resolution.set(w, h)); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let lastMode: Mode | null = null, lastSketchId: number | null = null;
    S.current = {
      rebuild: (what) => {
        if (what === 'bodies') rebuildBodies();
        if (what === 'sketches') rebuildSketches();
        if (what === 'planes') rebuildPlanes();
        if (what === 'preview') rebuildPreview();
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
      for (const l of labels) { const q = l.w.clone().project(cam); l.el.style.display = q.z > 1 ? 'none' : ''; l.el.style.left = `${((q.x + 1) / 2) * size.x}px`; l.el.style.top = `${((1 - q.y) / 2) * size.y}px`; }
    };
    loop();
    (window as any).__forge = {
      project: (w: number[]) => { const v = new THREE.Vector3(w[0], w[1], w[2]).project(cam); const r = dom.getBoundingClientRect(); return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]; },
      sketchToScreen: (q: Vec2) => { const s = P.current.activeSketch; if (!s) return null; const w = toWorld(planeOf(s), q); return (window as any).__forge.project(w); },
      pointerSnap: () => cursor,
      // test hook: what the edge picker finds at the screen position of a world point
      edgeAt: (w: number[]) => { const [x, y] = (window as any).__forge.project(w); const sets = P.current.edgeSets; return { sets: sets.length, edges: sets.reduce((n, t) => n + t.edges.length, 0), pick: pickEdge({ clientX: x, clientY: y }), mode: P.current.mode }; },
    };
    const fitOnce = () => { if (!firstFit && gBodies.children.length) { firstFit = true; fit(); } };
    (S.current as any).fitOnce = fitOnce;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); renderer.dispose(); el.removeChild(dom); S.current = null; labelLayer.remove(); delete (window as any).__forge; };
  }, []);

  const p = props;
  useEffect(() => { S.current?.rebuild('bodies'); (S.current as any)?.fitOnce?.(); }, [p.bodies, p.hiddenBodies, p.selectedFace, p.showEdges, p.theme]);
  useEffect(() => { S.current?.rebuild('sketches'); }, [p.sketches, p.hiddenSketches, p.mode, p.showProfiles, p.selectedProfiles, p.theme]);
  useEffect(() => { S.current?.rebuild('planes'); }, [p.mode, p.showOrigin, p.bodies, p.theme]);
  useEffect(() => { S.current?.rebuild('preview'); }, [p.pending, p.tool, p.mode, p.activeSketch, p.pickMode, p.highlight, p.showPoints]);
  useEffect(() => { S.current?.rebuild('camera'); }, [p.mode, p.activeSketch?.id]);
  useEffect(() => { S.current?.rebuild('edges'); }, [p.mode, p.edgeSets, p.edgeHighlight, p.theme]);

  return <div className="viewport" ref={host} data-testid="viewport" />;
}
