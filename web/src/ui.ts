// Types shared by the interface components.
import type { Vec2, Vec3 } from './api';
import type { Tool } from './sketch/tools';

export type Mode = 'model' | 'pickPlane' | 'sketch' | 'extrude';
export type PlanePick = { plane: 'XY' | 'XZ' | 'YZ' } | { face: Vec3; body: string; index: number };
export interface ProfileRef { sketch: number; index: number; at: Vec2 }

export interface ViewApi {
  fit(): void;
  setView(name: 'home' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'): void;
  /** Camera orientation as a row-major 3x3 world-to-camera rotation. */
  rotation(): number[];
}
export type { Tool };
