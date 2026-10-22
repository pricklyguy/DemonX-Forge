# Requirement inventory from `forge-chat.txt`

**Source:** complete 217,845-byte, 1,848-line development-history file supplied by the owner. Messages are grouped below by requirement; IDs refer to the order of human-authored requests and feedback in that file (including summaries carried forward between context windows). Images and release notifications were treated as evidence or status, not independent feature requirements.

## Product and engineering decisions

| ID | Requirement | Current disposition at v0.27.0 | Evidence / follow-up |
|---|---|---|---|
| P-01 | Independent DemonX Forge product/repository; Forge identity and colors; no code/server integration with CNC or Design; exchange files by export/import. | Implemented by product layout/docs and standalone repo. | `README.md`, `docs/PLAN.md`; verify current package branding during release audit. |
| P-02 | Fusion-familiar workflow, menus, shortcuts and interaction conventions, implemented independently; do not copy protected source/assets or read proprietary design files. | Implemented in many workflows; parity is partial and must be feature-by-feature validated. | `CLAUDE.md`, `web/src/Ribbon.tsx`, `App.tsx`, `Viewport.tsx`; user supplied interaction observations, not code. |
| P-03 | Millimetre modeling, degrees, Z-up. | Implemented in app contract and documented; needs geometry/API regression coverage. | `README.md`, `Engine.ts`, engine contract tests. |
| P-04 | Work on a non-main branch; preserve user work; no auto-merge; preserve rollback points; never modify Solidcraft reference. | Current checkout meets branch and clean-start conditions. | `git status` at start; writable `codex/fusion-parity`; separate reference read-only. |
| P-05 | Keep shared repo memory in plans/release docs and report testing honestly. | Implemented as repo guidance, but modernization docs and fresh audit required. | `AGENTS.md`, `CLAUDE.md`, `docs/PLAN.md`. |

## Requested application capabilities and feedback

| ID | Conversation request | State based on source and tests inspected | Acceptance still required |
|---|---|---|---|
| W-01 | Build and package a usable Windows application; package workflow and instructions. | Present; release workflow and Windows/Linux packaging scripts exist. | Validate current v0.27.0 packages on actual Windows and Linux systems; CI package success alone is not user validation. |
| W-02 | Logo, DemonX mark/header, favicon and app branding; align sibling apps without integrating code. | Forge assets/header exist. | Branding work in sibling apps was external to this checkout; verify Forge contrast, scaling and package identity. |
| W-03 | Sketch then extrude; sketch is discoverable first; E extrude; retain Z-up. | Present with tests and README. | Validate multi-feature real workflow, profile selection after edits and MCP parity. |
| W-04 | Sketch geometry: lines, rectangles, circles, arcs, slots; type dimensions inline, Tab between dimensions, drag to draw; constraints and editable/show-hide dimensions. | Implementations and sketch tests exist; user reported typing and selection fixed in follow-up versions. | Re-run drawing/dimension workflows against actual browser and engine; audit constrained solve and edit/reopen. |
| W-05 | Hover feedback, selectable sketch regions/overlaps, shift/control selection, drag/move, rubber-band selection. | Current README claims hover and rubber-band selection; earlier user reported regressions and later confirmed several fixes. | End-to-end verify left-to-right and right-to-left box semantics, overlapping profiles, active-sketch selection and selection persistence. |
| W-06 | Automatic sketch inference: endpoints, centers, intersections, midpoints and alignment guides. | README claims snap hints; user specifically asked midpoint/intersection markers and alignment to unattached geometry. | Verify marker visibility, priority/tolerance, entity types and GUI behavior; no claim of complete parity until checked. |
| W-07 | Extrude profile selection; zero initial value; live preview, arrow drag and direct typing; support directions/operations. | Present with `e2e` coverage and earlier owner confirmation. | Test new/join/cut/intersect, symmetric/two direction, cancel/undo and saved rebuilds. |
| W-08 | Solid operations: revolve, sweep, loft, fillet, chamfer, shell, hole, draft, pattern, mirror, combine, press/pull, move/copy, split, rib, thread, scale, coil, pipe, emboss, mesh conversion. | Most have UI or command paths and some feature-specific tests; v0.27 feature inventory is broad. | Evidence is uneven: run representative geometry workflows, parameter edits, save/reopen and undo/redo per roadmap. |
| W-09 | Select body edges before starting fillet/chamfer; live preview and drag affordance. | Fillet/chamfer selection and previews exist; README only explicitly confirms drag arrow for Extrude/Press Pull/Offset Face. | Verify edge-first start, multi-edge/chained topology, invalid radii, cancellation and picking occlusion. |
| W-10 | Select faces for extrusion/press pull; sketch on faces; snap feature heights to another face; orient camera freely. | Face sketching, face tools and view controls exist; conversation records prior face-selection failures. | Must test current version: user-reported sketch-on-face extrude failure and orbit restriction make this a priority reliability gate. |
| W-11 | Measurement tool for checking solid dimensions. | README documents Inspect/Measure. | Verify point/edge/face pair measurements, units, accuracy and errors against analytic cases. |
| W-12 | Browser tree, feature timeline, editable features, parameters and dependency rebuild. | Present and partially covered by tests. | Test feature edits through downstream rebuilds, suppression, rollback, failed rebuild repair, save/reopen, undo/redo. |
| W-13 | All commands discoverable without memorizing shortcuts; context menus, grouped tabs/submenus and compact usable dialogs. | Ribbon/context menu and shortcut help exist; user reported clipping and inaccessible commands/dialogs. | Verify narrow and wide viewport layouts, menus, all command reachability and dialog collision behavior. |
| W-14 | Save/open/export; STEP/IGES import; STL/OBJ/3MF mesh import; DXF of sketches/faces/sections. | Implemented and covered by several tests; README claims supported formats. | Verify true round-trips and malformed/oversized files, meshes and assembly STEP imports. |
| W-15 | Mesh-to-solid for regular/prismatic parts; avoid claiming arbitrary sculpted mesh support. | Forge has local mesh conversion code and volume validation; README states limitations. | Test existing conversion cases on representative non-demo meshes; document exact accepted geometry class and refusal. |
| W-16 | MCP connect from Claude/OpenAI clients; structured design inspection, command discovery, modeling, measurement, screenshots, parameter changes, undo/redo, errors. | MCP server and tests exist; transcript records client connection failure then owner-confirmed working setup. | Test protocol compatibility and end-to-end client workflow against current binary, including stale/failed engine and path safety. |
| W-17 | Update checks/install, current version visible, desktop launcher, login startup, Windows/Linux workflow. | Present in docs/scripts/UI at baseline. | Validate actual update rollback, package install/uninstall and Linux desktop behavior. |
| W-18 | Preserve predictable undo/redo, recovery, actionable error handling and model integrity. | Undo/redo and transactional engine batches exist. | Autosave/recovery and crash recovery are not proven by listed evidence; add/document exact supported recovery policy. |
| W-19 | Future items named in history: angle and point-to-point sketch dimensions; fillet-radius/hole-position dragging; section DXF; FreeCAD/Rhino import; sketch on face and feature editing. | Some are present as user requests or README claims, others remain explicitly listed as not here yet. | Verify each against source and current tests; roadmap uses status labels below. |

## Evidence categories

- **Requested and implemented (code/test evidence):** feature has an implementation path and a focused automated test or end-to-end scenario. This is not equivalent to cross-platform or real-part validation.
- **Requested and owner-confirmed:** owner explicitly reported the workflow worked in a release. This is historical evidence for that release only.
- **Requested but incomplete:** capability exists only in part or README marks a limitation.
- **Claimed implemented, unverified here:** documentation or code surface says it exists, but this assessment did not execute the workflow or establish end-to-end correctness.
- **Reference capability, missing or not integrated in Forge:** present in Solidcraft code/command registry but unavailable through Forge UI/API or current engine pin.
- **New work:** no sufficient implementation and acceptance evidence found.

## History requirements that are no longer active

The initial 2026-10-18 evaluation asked about a different upstream, a potential WASM build size, kernel selection, CLI sample parts, and a decision before building. That decision was completed historically: the owner approved a standalone Forge repository, branded UI and Solidcraft CLI engine behind an adapter. It remains an architectural trace, not a request to restart the product or to copy proprietary CAD behavior. Earlier request to carry the logo to sibling applications was directed to a different repository and is outside this Forge branch.

## Traceability source

The conversation includes explicit feedback with version labels through v0.23.0 and summary handoffs. The checkout is now v0.27.0; version increments by themselves do not prove those fixes remain correct. This table records accumulated asks and user-reported outcomes, while the feature matrix and test plan describe the current audit state.
