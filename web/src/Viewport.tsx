import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Body } from './api';

export interface Pick { body: string; face: number; point: [number, number, number] }
interface Props { bodies: Body[]; selected: { body: string; face: number } | null; theme: string; onPick: (p: Pick | null) => void }

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** The 3D view. Z is up, as in the engine. Each body is one mesh whose triangles know their B-rep face. */
export function Viewport({ bodies, selected, theme, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{ scene: THREE.Scene; cam: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; ctl: OrbitControls; group: THREE.Group; fitted: boolean; grid: THREE.GridHelper } | null>(null);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const bodiesRef = useRef(bodies); bodiesRef.current = bodies;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, 1, 1, 20000); cam.up.set(0, 0, 1); cam.position.set(150, -220, 130);
    const ctl = new OrbitControls(cam, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(200, -300, 400); scene.add(sun);
    scene.add(new THREE.AxesHelper(30));
    const grid = new THREE.GridHelper(400, 40); grid.rotation.x = Math.PI / 2; scene.add(grid);
    const group = new THREE.Group(); scene.add(group);
    const t = { scene, cam, renderer, ctl, group, fitted: false, grid }; three.current = t;
    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(el); size();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene, cam); }; loop();

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down: [number, number] | null = null;
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return; // a drag is a camera move, not a pick
      const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(group.children, false)[0];
      const b = hit && (hit.object.userData.body as Body | undefined);
      if (hit && b && hit.faceIndex != null) pickRef.current({ body: b.name, face: b.faceIds[hit.faceIndex] ?? 0, point: hit.point.toArray() as [number, number, number] });
      else pickRef.current(null);
    });
    // test hook: where a model point lands on screen (used by e2e/viewport.mjs)
    (window as any).__forge = { project: (p: number[]) => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(cam); const r = dom.getBoundingClientRect(); return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]; } };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.removeChild(dom); three.current = null; delete (window as any).__forge; };
  }, []);

  // meshes and colours follow the model, the selection and the theme
  useEffect(() => {
    const t = three.current; if (!t) return;
    t.scene.background = new THREE.Color(css('--bg'));
    t.scene.remove(t.grid); t.grid.geometry.dispose(); // the grid is rebuilt so it follows the theme
    t.grid = new THREE.GridHelper(400, 40, css('--line'), css('--line')); t.grid.rotation.x = Math.PI / 2; t.scene.add(t.grid);
    for (const c of [...t.group.children]) { t.group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    const base = new THREE.Color(css('--muted')).lerp(new THREE.Color(0xffffff), 0.25), hi = new THREE.Color(css('--accent'));
    const box = new THREE.Box3();
    for (const b of bodies) {
      const n = b.indices.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const v = (b.indices[i] ?? 0) * 3; pos[i * 3] = b.positions[v] ?? 0; pos[i * 3 + 1] = b.positions[v + 1] ?? 0; pos[i * 3 + 2] = b.positions[v + 2] ?? 0; }
      for (let tri = 0; tri < b.faceIds.length; tri++) { const on = selected?.body === b.name && selected.face === b.faceIds[tri]; const c = on ? hi : base; for (let k = 0; k < 3; k++) { col[(tri * 3 + k) * 3] = c.r; col[(tri * 3 + k) * 3 + 1] = c.g; col[(tri * 3 + k) * 3 + 2] = c.b; } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }));
      mesh.userData.body = b; t.group.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })); mesh.add(edges);
      g.computeBoundingBox(); if (g.boundingBox) box.union(g.boundingBox);
    }
    if (!t.fitted && !box.isEmpty()) { // frame the first model once; later edits keep the camera where the person put it
      const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
      t.ctl.target.copy(c); t.cam.position.copy(c).add(new THREE.Vector3(1.6, -2.2, 1.3).normalize().multiplyScalar(r * 3.2)); t.fitted = true;
    }
  }, [bodies, selected, theme]);

  return <div className="viewport" ref={host} data-testid="viewport" />;
}
