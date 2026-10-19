// Types shared by the interface components.
import type { Vec2, Vec3 } from './api';
import type { Tool } from './sketch/tools';

export type Mode = 'model' | 'pickPlane' | 'sketch' | 'extrude' | 'modify';
/** An edge of a body, by the engine's body name and edge index. */
export interface EdgeRef { body: string; index: number }
export type PlanePick = { plane: 'XY' | 'XZ' | 'YZ' } | { face: Vec3; body: string; index: number };
export interface ProfileRef { sketch: number; index: number; at: Vec2 }

export interface ViewApi {
  /** Put the cursor in a size box on the shape being drawn (optionally starting it with a typed character); false when there is none. */
  focusSize(i: number, first?: string): boolean;
  fit(): void;
  setView(name: 'home' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'): void;
  /** Camera orientation as a row-major 3x3 world-to-camera rotation. */
  rotation(): number[];
}
export type { Tool };
