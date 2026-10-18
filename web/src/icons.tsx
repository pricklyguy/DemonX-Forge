// Our own line icons (24 px, drawn in currentColor with one accent stroke). Not copies of any other program's artwork.
import type { ReactNode } from 'react';

const base = { width: 28, height: 28, viewBox: '0 0 28 28', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const A = 'var(--accent)';
const C = 'var(--cyan)';

function Svg({ children, size }: { children: ReactNode; size?: number }) {
  return <svg {...base} {...(size ? { width: size, height: size } : {})} aria-hidden="true">{children}</svg>;
}

export const Icon = {
  sketch: () => <Svg><rect x="4" y="8" width="16" height="16" rx="1.5" /><path d="M14 14 L23 5 L26 8 L17 17 L13.5 17.5 Z" stroke={A} /></Svg>,
  extrude: () => <Svg><path d="M5 20 L14 24 L23 20 L23 12 L14 16 L5 12 Z" /><path d="M5 12 L14 8 L23 12" /><path d="M14 16 V3 M10.5 6.5 L14 3 L17.5 6.5" stroke={A} /></Svg>,
  hole: () => <Svg><path d="M3 12 L14 7 L25 12 L25 19 L14 24 L3 19 Z" /><ellipse cx="14" cy="14" rx="4.5" ry="2.6" stroke={A} /></Svg>,
  line: () => <Svg><path d="M5 22 L23 6" stroke={C} /><circle cx="5" cy="22" r="2" /><circle cx="23" cy="6" r="2" /></Svg>,
  rect: () => <Svg><rect x="5" y="8" width="18" height="12" stroke={C} /><circle cx="5" cy="8" r="1.6" /><circle cx="23" cy="20" r="1.6" /></Svg>,
  circle: () => <Svg><circle cx="14" cy="14" r="9" stroke={C} /><circle cx="14" cy="14" r="1.6" /></Svg>,
  dimension: () => <Svg><path d="M5 20 V8 M23 20 V8 M5 14 H23" stroke={C} /><path d="M8 11.5 L5 14 L8 16.5 M20 11.5 L23 14 L20 16.5" /></Svg>,
  finish: () => <Svg size={30}><circle cx="14" cy="14" r="11" stroke="var(--ok)" /><path d="M8.5 14.5 L12.5 18.5 L20 10" stroke="var(--ok)" /></Svg>,
  fit: () => <Svg size={20}><path d="M4 10 V4 H10 M18 4 H24 V10 M24 18 V24 H18 M10 24 H4 V18" /><rect x="10" y="10" width="8" height="8" /></Svg>,
  home: () => <Svg size={20}><path d="M4 14 L14 5 L24 14 M7 12 V23 H21 V12" /></Svg>,
  grid: () => <Svg size={20}><path d="M5 5 H23 V23 H5 Z M5 11 H23 M5 17 H23 M11 5 V23 M17 5 V23" /></Svg>,
  edges: () => <Svg size={20}><path d="M14 4 L23 9 V19 L14 24 L5 19 V9 Z M14 14 L23 9 M14 14 L5 9 M14 14 V24" /></Svg>,
  eye: () => <Svg size={16}><path d="M2 14 C6 7 22 7 26 14 C22 21 6 21 2 14 Z" /><circle cx="14" cy="14" r="3.5" /></Svg>,
  eyeOff: () => <Svg size={16}><path d="M2 14 C6 7 22 7 26 14 C22 21 6 21 2 14 Z" opacity=".45" /><path d="M5 23 L23 5" /></Svg>,
  caret: () => <Svg size={12}><path d="M9 6 L19 14 L9 22" strokeWidth={3} /></Svg>,
  undo: () => <Svg size={18}><path d="M9 8 L4 13 L9 18 M4 13 H17 C21 13 24 15.5 24 19.5" /></Svg>,
  redo: () => <Svg size={18}><path d="M19 8 L24 13 L19 18 M24 13 H11 C7 13 4 15.5 4 19.5" /></Svg>,
  generic: () => <Svg size={20}><rect x="6" y="6" width="16" height="16" rx="2" /></Svg>,
};

/** The timeline icon for an engine feature type. */
export function featureIcon(type: string) {
  if (/sketch/i.test(type)) return <Icon.sketch />;
  if (/extrude/i.test(type)) return <Icon.extrude />;
  if (/hole/i.test(type)) return <Icon.hole />;
  return <Icon.generic />;
}
