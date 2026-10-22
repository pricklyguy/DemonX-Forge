# Forge / Solidcraft / target workflow matrix

**Assessment date:** 2026-10-22. “In Forge” means code or test evidence was found in the v0.27.0 checkout; it does not imply the full workflow was run during this assessment. “Reference” means implementation evidence exists in the read-only Solidcraft checkout, not that Forge has integrated it.

| Capability | Forge v0.27.0 | Solidcraft reference | Desired Forge workflow / status |
|---|---|---|---|
| Sketch plane, line/rectangle/circle/arc/slot | Present; sketch tools and browser checks | Present; command registry and desktop/web sketch UI | Familiar plane/face start, preview and dimensions; **audit geometry and re-edit** |
| Sketch constraints/dimensions | Present; lines, radii, angles and distances in engine mapping and UI | Rich solver/constraint commands and UI | Stable parametric solve, editable dimensions, useful DOF feedback; **verify solve/rebuild** |
| Snap/inference | Present in Forge `sketch/inference.ts`, `snap.ts`; README lists endpoints, centers, crossings, midpoints, alignment | Present in `ui-egui` inference and drag-snap systems | Visible high-confidence inference markers/guides; **verify hover and placement** |
| Profiles and overlapping regions | Region detection implementation and tests | Engine profile and sketch topology commands | Correct hover highlight and precise profile selection; **regression gate** |
| Extrude/revolve/sweep/loft | Present via UI and engine command path; focused e2e exists | Present in command engine and tests; loft rails and additional controls exist | Preview, typed values, multiple operations and predictable rebuild; **partial parity** |
| Fillet/chamfer | Present; `edges.test.ts`, edge UI path | Kernel-owned blend commands/tests, variable and vertex blend implementations | Edge-first selection, stable tangent/chained selection and previews; **representative stress tests needed** |
| Press-pull/shell/offset face/draft | Present; focused tests for some tools | Present with broader face/edge and surface operations | Reliable face/edge targeting, direction and failure recovery; **audit** |
| Hole/thread/rib | Present in Forge feature forms/command registry; tests vary | Present with more placement, standard, and feature support | Typed and drag placement, edit from history, accurate depth/thread limits; **partial parity** |
| Pattern/mirror/combine/move/split/scale/coil/pipe/emboss | Present in Forge command/UI inventory; not all history edit support verified | Present; reference includes more occurrence/assembly-aware operations | Selection-driven command start, transforms and robust edit/rebuild; **partial parity** |
| Browser, components and assemblies | Forge has browser/component list; native assemblies/joints are not established | Extensive components, occurrences, joints, motion links and configurations | Browser tree and stable components first; assemblies/joints are **new work** |
| Timeline/history/parameters | Forge snapshot, feature edit and parameter routes; focused edit tests | Native parametric doc graph, incremental recompute, configurations and richer history | Deterministic rebuild, suppressed/failed features, dependencies and edits; **audit complete lifecycle** |
| Construction geometry/reference entities | Sketch construction geometry present; reference planes/axes limited/not established | Construction entities and broader plane/axis/reference commands | Plane/axis creation and stable references in browser/history; **gap** |
| Selection, context menus and view | Forge uses Three.js picking and context menu; known historic issues with face picks/orbit | Desktop UI has selection, navigation, gizmos and interaction tests | Face/edge/body/component selection with hover feedback, camera orbit across all views; **high priority validation** |
| Measuring | Forge `/api/measure`, MCP `forge_measure`, Inspect UI | `measure` handles body and selected geometry; richer outputs | Accurate analytic values and useful two-item comparisons; **validate** |
| Formats | Forge `.forge`, STEP/IGES import; STEP/STL/3MF/OBJ and DXF export; mesh import | Native design, STEP and mesh formats, plus broader import/export, FCStd/Rhino converters | Reliable roundtrip, recovery, clear import errors; additional native CAD imports are **not yet verified** |
| MCP and structured commands | Forge-specific MCP bridge and HTTP JSON command API; path-capable commands are explicitly blocked, including sketch, parameter, timeline, and linked-component paths | Broader CLI/MCP and command schemas, topology, diagnostics, recovery, assembly tools | Preserve Forge IDs/schemas and restrictions while extending discoverability; **contract regression gate** |
| Screenshot/undo/redo/parameters | Present through Forge MCP; unit tests cover routes | Present through MCP/CLI/control channel | Same open design, errors actionable, undo exactly one logical operation; **integration test required** |
| Responsiveness/precision | Three.js display meshes; engine process and 3MF geometry transfer | Rust engine and custom tessellation; large geometry/cache/performance work | Maintain mm/Z-up, error bounds, low-latency selection and command response; **benchmark baseline missing** |
| Windows/Linux packaging | CI builds Windows ZIP/Linux tarball; docs and launchers present | Desktop builds/packages; web WASM configuration | Installed package workflows on both OSes; **actual OS acceptance pending** |
| Build and test toolchain | Vite 8.3.5, Vitest 5.0.5 and React plugin 6.1.2; unit, typecheck and build pass on Windows | Rust toolchain; not directly comparable | Supported Node baseline set to 20.19.0; npm audit is clean; **real engine and packaged cross-platform validation pending** |

## Capability interpretation

Solidcraft's command registry and test corpus are valuable reuse evidence, especially for modeling and assembly capabilities, but they are not automatic Forge functionality. The Forge adapter's command allowlist, frontend forms, selection model, serialization, error mapping and MCP contract must all support the operation before it is considered integrated. No capability is marked “complete” based only on a command ID or README bullet.

## Source sampling

- Forge: `README.md`, `docs/PLAN.md`, `docs/MCP.md`, `server/src/engine/Engine.ts`, `server/src/engine/solidcraft.ts`, `server/src/mcp.ts`, `server/src/commands.ts`, `web/src/App.tsx`, `web/src/Viewport.tsx`, `web/src/Ribbon.tsx`, `web/src/sketch/*`, `server/test/mcp.test.ts`, `e2e/*`.
- Solidcraft: `Cargo.toml`, `LICENSE-MIT`, `LICENSE-APACHE`, `ATTRIBUTION.md`, `crates/engine/src/cmd/*`, `crates/kernel/src/*`, `crates/io/src/*`, `crates/mcp`, `apps/solidcraft-cli`, `apps/solidcraft-web`, `crates/ui-egui` and associated tests. The checked-out Solidcraft source is read-only.
