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
- **2026-10-18: work on `main` for the first commits** (empty repository), branches and PRs after that.

## Engine hand-over and the Windows package

- **2026-10-18: the Windows zip is built by GitHub Actions** (`.github/workflows/windows-package.yml`), like DemonX's: a Windows job compiles SolidCraft's `solidcraft-cli.exe` from the commit in `engine/SOLIDCRAFT_REF` (no debug info, stripped, so the file is much smaller than the 384 MB debug build used in the evaluation), runs a smoke test on it, then a Linux job bundles the server, the web app, its own Node, the engine and the engine's licence files into `DemonX-Forge-<version>-windows-x64.zip` (+ `.sha256`). A tag `v<version>` also attaches it to a release (notes in `docs/releases/`).
- The engine commit is pinned on purpose: SolidCraft changes daily and its command names are not stable. Change `engine/SOLIDCRAFT_REF` only after trying the new one.
- **Tried:** the packaging script on Linux (zip builds, Node download checked against its published checksum) and the bundled server run from the package folder against the real Linux engine with the full browser check (`e2e/viewport.mjs`, all passed). **Not tried:** the Windows engine build in CI, and the zip on a Windows PC. The first Windows build compiles the whole engine (expect 20 to 40 minutes; later runs use a cache) and may need fixing.
- Not in the package yet: auto-update (DemonX has it), a Start menu entry, code signing.

## Engine findings (keep adding)

- **Face areas from `body_topology` are approximate.** The demo bracket's top face is exactly 2943.451 mm² (width 60) and 4943.451 (width 100), checked by OpenCascade on the exported STEP and by hand; the engine's face list says 2945.06 and 4946.21 (+0.05 to +0.06 %). Volumes and areas from its `measure` command and from the STEP are exact. So: use `measure` for any number shown as a dimension; the face list is for picking and display only. (Not yet checked whether `measure` gives the exact face area; do that before showing areas.)
- **Unknown parameters are silently ignored** by the engine; our adapter warns (`unknownParamNames`).
- **A failed batch comes back as JSON** with `rolled_back: true`; the adapter turns it into a sentence and the design is unchanged (tested).

## What works now (skeleton)

Server: engine adapter over MCP stdio, 3MF-with-face-tags mesh path, loopback-only HTTP API. Web: browser tree, viewport (Three.js) with face picking, parameter slider, drill-at-click, undo. Demo part: `server/fixtures/bracket.json`.

## Next (in this order, one at a time)

1. Run the Windows zip on the owner's PC and fix what breaks.
2. Sketch on a face or plane: lines, rectangles, circles, dimensions, finish; extrude as a feature.
3. Feature timeline (edit, suppress, reorder) and a parameters table.
4. Real B-rep edges in the viewport (pick an edge for fillet and chamfer); a binary mesh call instead of 3MF files.
5. File menu: save and open our project file, export STEP / STL / 3MF / DXF.
6. Command console, scripts, and an MCP entry of our own.
7. Measure speed on a large part; decide whether a Rust sidecar of our own is needed.

## Not done on purpose

Assemblies, sheet metal, CAM, rendering, simulation. PCB work is deferred.
