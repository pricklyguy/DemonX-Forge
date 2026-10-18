// The one interface the rest of Forge uses to model. Nothing outside server/src/engine may know which engine is behind it
// (today SolidCraft's headless CLI over MCP). Lengths are millimetres, angles degrees.

export type Vec3 = [number, number, number];

export interface Face {
  index: number;
  name: string;
  area: number;
  /** A point that lies on the face (a centroid can fall in a hole). */
  point: Vec3;
  centroid: Vec3;
  /** Present for planar faces. */
  planeNormal?: Vec3;
  /** Present for cylindrical faces. */
  cylinder?: { origin: Vec3; axis: Vec3; radius: number };
}

export type Vec2 = [number, number];

export interface SketchCurve {
  id: string;
  type: 'line' | 'circle' | 'arc' | 'other';
  construction: boolean;
  fullyConstrained: boolean;
  /** Lines and arcs. */
  start?: Vec2;
  end?: Vec2;
  /** Circles and arcs; arcs run counter-clockwise from start to end. */
  center?: Vec2;
  radius?: number;
  /** The engine's ids of the points this curve ends and is centred on (for constraints, fillets and picking). */
  startId?: string;
  endId?: string;
  centerId?: string;
}

export interface SketchPoint { id: string; at: Vec2; fixed: boolean }

/** A driving dimension (a number the sketch is solved to). `curve` is set for dimensions on one curve. */
export interface SketchDimension { id: string; kind: string; param: string; expression: string; value: number; curve?: string }

/** A closed region of a sketch that can be extruded. `holes` are the loops inside it, as curve ids. */
export interface Profile { index: number; area: number; centroid: Vec2; curves: string[]; holes: string[][] }

export interface Sketch {
  id: number;
  name: string;
  visible: boolean;
  /** True while the sketch is open for drawing. */
  active: boolean;
  /** Sketch plane in world millimetres: sketch (x, y) maps to origin + x * xDir + y * yDir. */
  plane: { origin: Vec3; xDir: Vec3; yDir: Vec3 };
  curves: SketchCurve[];
  points: SketchPoint[];
  dimensions: SketchDimension[];
  profiles: Profile[];
  /** Degrees of freedom left (0 means fully constrained). */
  dof: number;
}

export interface Body {
  name: string;
  /** xyz per vertex, flat. */
  positions: number[];
  /** Three vertex numbers per triangle, flat. */
  indices: number[];
  /** The B-rep face of every triangle. */
  faceIds: number[];
  faces: Face[];
}

export interface Parameter { name: string; expression: string; value: number; unit: string }
export interface TimelineItem { id: number; name: string; type: string; suppressed: boolean; error: string | null }

export interface Snapshot {
  bodies: Body[];
  parameters: Parameter[];
  timeline: TimelineItem[];
  sketches: Sketch[];
  /** How long the engine took to produce it, for the status bar. */
  ms: number;
  /** Things the engine would have ignored silently, found by our own checks. */
  warnings: string[];
}

export interface CommandStep {
  command: string;
  params?: Record<string, unknown>;
}

export class EngineError extends Error {}

export interface Engine {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Run steps in order; if one fails the design is left as it was (rolled back) and EngineError says why. */
  run(steps: CommandStep[]): Promise<string[]>;
  setParameter(name: string, value: string | number): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** The current model as a face-tagged mesh. Bodies is empty for an empty design. */
  snapshot(): Promise<Snapshot>;
}
