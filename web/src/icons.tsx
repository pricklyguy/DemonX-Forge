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
  bFillet: () => <Svg><path d="M4 22 V12 L11 6 H24" opacity=".5" /><path d="M4 22 H20 A4 4 0 0 0 24 18 V6" /><path d="M20 22 A4 4 0 0 0 24 18" stroke={A} strokeWidth={3} /></Svg>,
  bChamfer: () => <Svg><path d="M4 22 V12 L11 6 H24" opacity=".5" /><path d="M4 22 H19 L24 17 V6" /><path d="M19 22 L24 17" stroke={A} strokeWidth={3} /></Svg>,
  bPressPull: () => <Svg><path d="M4 22 H24 V13 H4 Z" /><path d="M4 13 L9 8 H24" opacity=".5" /><path d="M14 11 V3 M10.5 6.5 L14 3 L17.5 6.5" stroke={A} strokeWidth={2.5} /></Svg>,
  revolve: () => <Svg><path d="M14 3 V25" strokeDasharray="2 2" opacity=".6" /><path d="M14 8 H22 V20 H14" /><path d="M14 8 C8 8 6 12 6 14 C6 16 8 20 14 20" stroke={A} strokeWidth={2.5} /></Svg>,
  mirror: () => <Svg><path d="M14 3 V25" strokeDasharray="2 2" opacity=".6" /><path d="M4 9 L11 12 V20 L4 23 Z" /><path d="M24 9 L17 12 V20 L24 23 Z" stroke={A} strokeWidth={2} /></Svg>,
  rpattern: () => <Svg><rect x="4" y="5" width="7" height="7" /><rect x="15" y="5" width="7" height="7" stroke={A} strokeWidth={2} /><rect x="4" y="16" width="7" height="7" stroke={A} strokeWidth={2} /><rect x="15" y="16" width="7" height="7" stroke={A} strokeWidth={2} /></Svg>,
  cpattern: () => <Svg><circle cx="14" cy="14" r="9" strokeDasharray="2 2" opacity=".6" /><circle cx="14" cy="5" r="2.6" /><circle cx="22.5" cy="16" r="2.6" stroke={A} strokeWidth={2} /><circle cx="5.5" cy="16" r="2.6" stroke={A} strokeWidth={2} /></Svg>,
  sweep: () => <Svg><circle cx="6" cy="21" r="3" /><path d="M6 18 C6 8 14 12 22 5" stroke={A} strokeWidth={2.5} /><path d="M9 21 C17 21 21 14 24 8" opacity=".5" /></Svg>,
  loft: () => <Svg><rect x="4" y="18" width="14" height="6" /><circle cx="19" cy="7" r="4" /><path d="M4 18 L15 7 M18 18 L23 8" stroke={A} strokeWidth={2} /></Svg>,
  bShell: () => <Svg><path d="M4 10 L14 5 L24 10 V20 L14 25 L4 20 Z" /><path d="M9 12 L14 9.5 L19 12 V18 L14 20.5 L9 18 Z" stroke={A} strokeWidth={2} /></Svg>,
  rectCenter: () => <Svg><rect x="5" y="8" width="18" height="12" stroke={C} /><circle cx="14" cy="14" r="1.8" /><path d="M14 14 L23 20" strokeDasharray="2 2" /></Svg>,
  circle2: () => <Svg><circle cx="14" cy="14" r="9" stroke={C} /><circle cx="5" cy="14" r="1.6" /><circle cx="23" cy="14" r="1.6" /></Svg>,
  arc3: () => <Svg><path d="M5 20 C8 6 20 6 23 20" stroke={C} /><circle cx="5" cy="20" r="1.6" /><circle cx="23" cy="20" r="1.6" /><circle cx="14" cy="8.5" r="1.4" /></Svg>,
  slot: () => <Svg><path d="M9 8 H19 A6 6 0 0 1 19 20 H9 A6 6 0 0 1 9 8 Z" stroke={C} /></Svg>,
  trim: () => <Svg><path d="M4 20 L24 8" stroke={C} /><path d="M10 4 L14 24" stroke={C} /><path d="M12.5 14 L24 8" stroke={A} strokeWidth={3} /></Svg>,
  extend: () => <Svg><path d="M4 20 L16 13" stroke={C} /><path d="M16 13 L22 9.5" stroke={A} strokeDasharray="2 2" /><path d="M24 4 V24" /></Svg>,
  offset: () => <Svg><path d="M5 22 V8 H19" stroke={C} /><path d="M10 22 V13 H24" stroke={A} /></Svg>,
  fillet: () => <Svg><path d="M5 5 V15 A8 8 0 0 0 13 23 H23" stroke={C} /></Svg>,
  cHoriz: () => <Svg size={22}><path d="M3 14 H25" /><path d="M9 8 V20 M19 8 V20" opacity=".35" /></Svg>,
  cCoinc: () => <Svg size={22}><circle cx="14" cy="14" r="4" /><path d="M3 14 H10 M18 14 H25" opacity=".5" /></Svg>,
  cParallel: () => <Svg size={22}><path d="M7 22 L16 5 M14 24 L23 7" /></Svg>,
  cPerp: () => <Svg size={22}><path d="M6 23 H24 M6 23 V5" /><path d="M6 17 H12 V23" strokeWidth={1.2} /></Svg>,
  cTangent: () => <Svg size={22}><circle cx="14" cy="17" r="7" /><path d="M2 10 H26" /></Svg>,
  cEqual: () => <Svg size={22}><path d="M6 10 H22 M6 18 H22" strokeWidth={2.4} /></Svg>,
  cMid: () => <Svg size={22}><path d="M3 20 H25" /><path d="M14 20 L14 6 M9 11 L14 6 L19 11" opacity=".6" /><circle cx="14" cy="20" r="2.2" /></Svg>,
  cConc: () => <Svg size={22}><circle cx="14" cy="14" r="10" /><circle cx="14" cy="14" r="5" /></Svg>,
  cFix: () => <Svg size={22}><rect x="7" y="12" width="14" height="11" rx="2" /><path d="M10 12 V8 A4 4 0 0 1 18 8 V12" /></Svg>,
};

/** The timeline icon for an engine feature type. */
export function featureIcon(type: string) {
  if (/sketch/i.test(type)) return <Icon.sketch />;
  if (/extrude/i.test(type)) return <Icon.extrude />;
  if (/hole/i.test(type)) return <Icon.hole />;
  return <Icon.generic />;
}
