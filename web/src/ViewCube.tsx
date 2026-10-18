import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ViewApi } from './ui';

const S = 54; // cube edge in px
// For each face: its outward normal and the face's right and down directions in world axes (Z up), chosen so each reads correctly from outside.
const FACES: { name: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'; label: string; r: number[]; d: number[]; n: number[] }[] = [
  { name: 'top', label: 'TOP', r: [1, 0, 0], d: [0, -1, 0], n: [0, 0, 1] },
  { name: 'bottom', label: 'BOTTOM', r: [1, 0, 0], d: [0, 1, 0], n: [0, 0, -1] },
  { name: 'front', label: 'FRONT', r: [1, 0, 0], d: [0, 0, -1], n: [0, -1, 0] },
  { name: 'back', label: 'BACK', r: [-1, 0, 0], d: [0, 0, -1], n: [0, 1, 0] },
  { name: 'right', label: 'RIGHT', r: [0, 1, 0], d: [0, 0, -1], n: [1, 0, 0] },
  { name: 'left', label: 'LEFT', r: [0, -1, 0], d: [0, 0, -1], n: [-1, 0, 0] },
];
const face3d = (f: (typeof FACES)[number]) => `matrix3d(${f.r[0]},${f.r[1]},${f.r[2]},0, ${f.d[0]},${f.d[1]},${f.d[2]},0, ${f.n[0]},${f.n[1]},${f.n[2]},0, ${f.n[0]! * S / 2},${f.n[1]! * S / 2},${f.n[2]! * S / 2},1)`;

/** A small cube that turns with the camera; clicking a face looks at the model from that side. */
export function ViewCube({ api, onHome }: { api: MutableRefObject<ViewApi | null>; onHome(): void }) {
  const cube = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = api.current?.rotation(); if (!m || !cube.current) return;
      // world -> camera rotation, with the y axis flipped because CSS y points down
      cube.current.style.transform = `matrix3d(${m[0]},${-m[3]!},${m[6]},0, ${m[1]},${-m[4]!},${m[7]},0, ${m[2]},${-m[5]!},${m[8]},0, 0,0,0,1)`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [api]);
  return (
    <div className="viewcube" data-testid="viewcube">
      <div className="vcscene"><div className="vccube" ref={cube}>
        {FACES.map((f) => <div key={f.name} className="vcface" data-face={f.name} style={{ transform: face3d(f) }} onClick={() => api.current?.setView(f.name)}>{f.label}</div>)}
      </div></div>
      <button className="vchome" title="Home view" aria-label="Home view" onClick={onHome}>⌂</button>
    </div>
  );
}
