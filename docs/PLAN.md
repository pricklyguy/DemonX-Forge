# DemonX Forge: plan and decisions

## What it is

A Fusion-style parametric 3D CAD application, local only, in the DemonX look. Not a launcher for someone else's program: the interface, the file handling and the command layer are ours; the modelling engine underneath is replaceable.

## Decisions

- **2026-10-18, owner: own repository, own product.** Apps that share code in one repository break each other. Forge shares the look (colour variables, dark and light, layout habits), not code, with DemonX CNC and Design.
- **2026-10-18, owner: no integration with DemonX CNC or Design.** Export files only (STEP, STL, DXF, SVG). Forge does not talk to their servers.
- **2026-10-18, owner: Fusion-style, not FreeCAD-style.** Browser tree, sketch then features, timeline, parameters. FreeCAD's workbench layout was tried and rejected.
- **2026-10-18, owner and Claude: clean room.** Public documentation and observed behaviour only. No reverse engineering of Autodesk Fusion or any proprietary CAD; no reading or converting its files. Open source (SolidCraft, MIT OR Apache-2.0) may be used under its licence.
- **2026-10-18, owner: name is DemonX Forge.** ("Mesh" was rejected: a mesh is only the display approximation of a solid.) Check for name clashes before publishing anywhere.
- **2026-10-18, owner and Claude: engine = SolidCraft's headless CLI behind our `Engine` interface** (React and Three.js interface of our own). Why: a spike (`docs/evaluation/SPIKE.md`) showed face picking, parameter edits and click-to-command in under half a second on a small part, and checks (`docs/evaluation/SOLIDCRAFT.md`) showed correct STEP/STL output verified by OpenCascade. Fallback: OpenCascade in WebAssembly or as a sidecar, if the kernel proves too weak on the owner's parts.
- **2026-10-18, owner and Claude: GPL-3.0-or-later**, same as DemonX, so code can move between them. The owner has no plan to sell it; this only keeps things simple.
- **2026-10-18, owner: follow Fusion's layout, menus and keys as closely as practical, for familiarity** (Solid and Sketch tabs, Create / Modify groups, browser tree, timeline strip, view cube, sketch palette; E extrude, L line, R rectangle, C circle, D dimension, H hole, Ctrl+Z / Ctrl+Y). Order of work: **sketch and extrude first.** Layout and shortcuts were taken from the owner's own screenshots of how they use Fusion (observed behaviour); icons, artwork and wording are ours, never copied.
- **2026-10-18, owner: Z is up** (the owner uses Z-up in Fusion too; the engine is Z-up). The TOP view looks down Z. No Y-up option is planned.
- **2026-10-18: work on `main` for the first commits** (empty repository), branches and PRs after that.

## Engine hand-over and the Windows package

- **2026-10-18: the Windows zip is built by GitHub Actions** (`.github/workflows/windows-package.yml`), like DemonX's: a Windows job compiles SolidCraft's `solidcraft-cli.exe` from the commit in `engine/SOLIDCRAFT_REF` (no debug info, stripped, so the file is much smaller than the 384 MB debug build used in the evaluation), runs a smoke test on it, then a Linux job bundles the server, the web app, its own Node, the engine and the engine's licence files into `DemonX-Forge-<version>-windows-x64.zip` (+ `.sha256`). A tag `v<version>` also attaches it to a release (notes in `docs/releases/`).
- The engine commit is pinned on purpose: SolidCraft changes daily and its command names are not stable. Change `engine/SOLIDCRAFT_REF` only after trying the new one.
- **Tried:** the packaging script on Linux (zip builds, Node download checked against its published checksum) and the bundled server run from the package folder against the real Linux engine with the full browser check (`e2e/viewport.mjs`, all passed). **Not tried:** the Windows engine build in CI, and the zip on a Windows PC. The first Windows build compiles the whole engine (expect 20 to 40 minutes; later runs use a cache) and may need fixing.
- Not in the package yet: auto-update (DemonX has it), a Start menu entry, code signing.

## Engine findings (keep adding)

- **A sketch on a face needs an exact pick:** `sketch.create` with `plane: {face: [x,y,z], body, index}`; the point and body alone are refused.
- **A full circle extrudes to two half-cylinder faces** (`c1#1`, `c1#2`), so clicking a hole's wall picks half of it. To fix later by grouping faces that share a name before the `#`.
- **A cut goes along the sketch normal by default**, which for a sketch on a top face is away from the body (it removes nothing). Forge flips a Cut toward the body (using the body's centre), as Fusion does; a negative distance flips it back.
- **A second dimension on the same line is refused** (over-constrained). To change one, set its parameter (`d1`, `d2`, ...): the line follows. Forge's dimension tool does this when you click a dimensioned line.
- **Standard planes:** XY is x right, y up (normal +Z); XZ has sketch y pointing down the world's Z (normal +Y); YZ has x = world Y, y = world Z (normal +X). The camera's up vector follows the sketch's y axis, otherwise a sketch on XZ looks upside down.
- Origin planes overlap, so a click picks the nearest one under the pointer (the hover highlight shows which).

- **Face areas from `body_topology` are approximate.** The demo bracket's top face is exactly 2943.451 mm² (width 60) and 4943.451 (width 100), checked by OpenCascade on the exported STEP and by hand; the engine's face list says 2945.06 and 4946.21 (+0.05 to +0.06 %). Volumes and areas from its `measure` command and from the STEP are exact. So: use `measure` for any number shown as a dimension; the face list is for picking and display only. (Not yet checked whether `measure` gives the exact face area; do that before showing areas.)
- **Unknown parameters are silently ignored** by the engine; our adapter warns (`unknownParamNames`).
- **A failed batch comes back as JSON** with `rolled_back: true`; the adapter turns it into a sentence and the design is unchanged (tested).

## What works now (0.2.0)

Fusion-style layout: SOLID tab with Create Sketch, Extrude (E), Hole (H); a SKETCH tab (only while a sketch is open) with Line (L), Rectangle (R), Circle (C), Sketch Dimension (D) and Finish Sketch; the browser tree (origin, bodies, sketches, parameters, with show/hide); an icon timeline; a view cube; a navigation bar (fit, home, grid, edges); the sketch palette (grid, snap, profile fill).
Workflow: Create Sketch, pick an origin plane or a flat face, draw (snap to grid and to existing points, a live outline while drawing, or type sizes: rectangle `40,30`, circle diameter, line length and angle), dimension (labels shown; click a dimensioned line again to change it), Finish Sketch (or press E: it finishes the sketch and opens Extrude), pick regions, set distance, direction (one side or symmetric) and operation (new body, join, cut, intersect) with a **live preview** (applied to the real model and undone when anything changes or on Cancel). Undo and redo (Ctrl+Z, Ctrl+Y). Mouse as in Fusion: middle drag pans, Shift + middle orbits, wheel zooms toward the cursor.
Tried in a real browser against the real engine: `e2e/sketch.mjs` (rectangle, circle, typed circle, dimension, change a dimension, E, preview, Cancel, OK, sketch on a face, cut, undo/redo, browser tree) and `e2e/viewport.mjs` (demo part, picking, parameters, hole, view cube, mouse). Not tried: a Windows PC with this version, a touch or trackpad, sketches on curved faces.
Not there yet: arcs, trim, offset, sketch constraints (only dimensions), editing an old sketch or feature from the timeline, extrude by dragging an arrow, extrude of a face, fillet and chamfer (need edge picking), press/pull, patterns, save and open, export, dark/light for the view cube text.

## Next (in this order, one at a time)

1. Run the 0.2.0 Windows zip on the owner's PC and fix what breaks.
2. Sketch tools to finish: arc, trim, offset, constraints (horizontal, vertical, coincident, tangent), editing a sketch from the timeline (double-click), project edges.
3. Feature timeline (edit, suppress, reorder) and a parameters table.
4. Real B-rep edges in the viewport (pick an edge for fillet and chamfer); a binary mesh call instead of 3MF files.
5. File menu: save and open our project file, export STEP / STL / 3MF / DXF.
6. Command console, scripts, and an MCP entry of our own.
7. Measure speed on a large part; decide whether a Rust sidecar of our own is needed.

## Not done on purpose

Assemblies, sheet metal, CAM, rendering, simulation. PCB work is deferred.
