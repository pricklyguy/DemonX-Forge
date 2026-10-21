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
export interface SketchDimension {
  id: string; kind: string; param: string; expression: string; value: number; curve?: string;
  /** An angle: the two lines it is between. */
  lines?: [string, string];
  /** A distance between two points (kind distance, distance_x or distance_y): the points, with where they are now. */
  points?: { id: string; at: Vec2 }[];
  /** A distance from a point (in `points`) to a line (kind point_line_distance). */
  line?: string;
}

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

/** An edge of a body as the engine lists it. The name is the two faces it lies between (`A|B`, with `~1`, `~2` when the same pair meets more than once). */
export interface BodyEdge { index: number; name: string; mid: Vec3; start: Vec3; end: Vec3; length: number }

export interface Body {
  name: string;
  /** xyz per vertex, flat. */
  positions: number[];
  /** Three vertex numbers per triangle, flat. */
  indices: number[];
  /** The B-rep face of every triangle. */
  faceIds: number[];
  faces: Face[];
  edges: BodyEdge[];
  /** True for a triangle mesh (an imported STL, OBJ or 3MF): it has no real faces or edges until Mesh to Solid converts it. */
  mesh: boolean;
}

export interface Parameter { name: string; expression: string; value: number; unit: string }
export interface TimelineItem { id: number; name: string; type: string; suppressed: boolean; error: string | null }

export interface Doc { name: string; /** True when there are changes since the last save or open. */ dirty: boolean }
export type ExportFormat = 'step' | 'stl' | 'stla' | '3mf' | 'obj';

export interface Snapshot {
  doc: Doc;
  bodies: Body[];
  parameters: Parameter[];
  timeline: TimelineItem[];
  /** How many timeline items are active; fewer than the list means the history is rolled back. */
  marker: number;
  /** The engine's state stamp when this snapshot was made (see Engine.stamp). */
  stamp: string;
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
  /** A cut through a body as DXF. The design is not changed. */
  exportSectionDxf(sec: { plane: 'XY' | 'XZ' | 'YZ'; offset: number; body: string }): Promise<Uint8Array>;
  /** Insert a STEP or IGES file as a new component. */
  /** STEP and IGES give solid bodies; STL, OBJ and 3MF give mesh bodies (a triangle mesh, millimetres, Z up) that Mesh to Solid can turn into solids. */
  /** Rebuild a closed mesh body as an editable solid: as sketches and extrudes when it is made of flat steps and straight walls, otherwise by the engine's prism converter. */
  convertMesh(body: string, tolMm: number): Promise<{ warnings: string[]; method: 'slabs' | 'engine' }>;
  importModel(bytes: Uint8Array, ext: 'step' | 'stp' | 'iges' | 'igs' | 'stl' | 'obj' | '3mf', name: string): Promise<string[]>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** The design as the bytes of a .forge file; the design is then called `name` and counts as saved. */
  save(name: string): Promise<Uint8Array>;
  /** Replaces the design with the one in a .forge file (FileError when it is not one); the design is then called `name`. */
  load(bytes: Uint8Array, name: string): Promise<void>;
  newDesign(): Promise<void>;
  /** Every visible body in an exchange format. */
  exportBodies(format: ExportFormat): Promise<Uint8Array>;
  /** The shapes of one sketch as an ASCII DXF (millimetres). */
  exportSketchDxf(sketch: string): Promise<Uint8Array>;
  /** A flat face's outline as DXF. The face is picked by body, face index and a point on it. The design is not changed. */
  exportFaceDxf(face: { body: string; index: number; point: [number, number, number] }): Promise<Uint8Array>;
  /** Reads something from the engine without changing the model (a feature's definition, what depends on it). */
  query(command: string, params?: Record<string, unknown>): Promise<unknown>;
  /** The current model as a face-tagged mesh. Bodies is empty for an empty design. */
  snapshot(): Promise<Snapshot>;
  /** Changes whenever the design does (an edit, an undo, a redo): a cheap way to ask "has anything changed?". */
  stamp(): Promise<string>;
  /** The command catalogue (id, label, one-line parameter text, enabled now), optionally only those whose id or label contain `filter`. */
  commandList(filter?: string): Promise<{ id: string; label: string; params: string; enabled: boolean }[]>;
  /** Volume, area, centre of mass and bounding box of one body or all of them. */
  measure(body?: string): Promise<unknown>;
  /** A picture of the design as PNG bytes. */
  screenshot(o: { view?: string; width?: number; height?: number }): Promise<Uint8Array>;
}
