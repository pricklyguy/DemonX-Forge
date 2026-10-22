# Requirement inventory from `forge-chat.txt`

**Source:** complete 217,845-byte, 1,848-line development-history file supplied by the owner. `U#` references the position of a human-authored `YOU:` message in that file; the current modernization prompt is marked `Current request`. Some user messages quote handoff summaries; cited IDs point to the original requests and follow-up reports where available. Images and release notifications were treated as evidence or status, not independent feature requirements.

## Product and engineering decisions

| ID | Requirement | Source | Classification at v0.27.0 | Evidence / follow-up |
|---|---|---|---|
| P-01 | Independent DemonX Forge product/repository; Forge identity and colors; no code/server integration with CNC or Design; exchange files by export/import. | U4, U7–U9 | Requested and implemented (code/documentation evidence) | `README.md`, `docs/PLAN.md`; sibling-app changes are outside this branch. |
| P-02 | Fusion-familiar workflow, menus, shortcuts and interaction conventions, implemented independently; do not copy protected source/assets or read proprietary design files. | U17, U20, U35, U47, U91, U94; Current request | Requested but incomplete | `CLAUDE.md`, `web/src/Ribbon.tsx`, `App.tsx`, `Viewport.tsx`; verify parity only as independent workflows. |
| P-03 | Millimetre modeling, degrees, Z-up. | U19, U22; Current request | Claimed implemented, unverified here | `README.md`, `Engine.ts`, engine tests; current assessment could not run the real engine. |
| P-04 | Work on a non-main branch; preserve user work; no auto-merge; preserve rollback points; never modify Solidcraft reference. | Current request | Requested and implemented for this checkout | Start status was clean on `codex/fusion-parity`; separate Forge and Solidcraft checkouts remain unchanged. |
| P-05 | Keep shared repo memory in plans/release docs and report testing honestly. | U1, U22; Current request | Requested and implemented (documentation evidence) | `AGENTS.md`, `CLAUDE.md`, `docs/PLAN.md`, this assessment set. |
| P-06 | Use Solidcraft as a verified capability source; retain attribution/licensing; decide architecture before implementation. | U1–U5, U8; Current request | Requested and incomplete | Architecture recommendation is documented; engine build and comparative part runs remain unverified. |

## Requested application capabilities and feedback

| ID | Conversation request | Source | Classification at v0.27.0 | Evidence and acceptance still required |
|---|---|---|---|
| W-01 | Build and package a usable Windows application; package workflow and instructions. | U9–U16, U82, U97 | Requested and implemented; platform validation incomplete | Release workflow/scripts exist. Validate v0.27.0 packages on real Windows and Linux systems. |
| W-02 | DemonX mark/header/favicon and app identity; no code integration with sibling apps. | U9–U14, U37, U40–U46 | Requested and implemented in Forge | Forge assets/header exist. Verify contrast, scaling and package identity; sibling-app work is outside this branch. |
| W-03 | Sketch then extrude; discoverable sketch tool; E shortcut; Z-up. | U17, U19–U21, U73 | Requested and implemented (code/test evidence) | Feature paths and tests exist. Run a real multi-feature workflow and verify profile selection/MCP parity. |
| W-04 | Line/rectangle/circle/arc/slot tools, inline dimension typing, Tab, drag drawing, constraints and editable/show-hide dimensions. | U32, U35, U47, U50, U53, U83, U91, U94, U96 | Requested and implemented (code/test evidence); full workflow unverified here | Sketch implementation/unit tests exist; rerun browser/engine drawing, dimensional solve and reopen acceptance. |
| W-05 | Hover/overlap selection, modifier selection, geometry dragging and rubber-band selection. | U32, U35, U47, U53, U103, U106 | Requested but incomplete pending regression audit | README claims selection behaviors; earlier reports describe failures. Verify both selection-window directions and active sketch/model state. |
| W-06 | Inference markers and alignment guides for endpoints, centers, intersections and midpoints. | U53, U71, U91 | Claimed implemented, unverified here | Snap modules/tests exist and README claims hints; verify visible markers, priorities and placement in a real viewport. |
| W-07 | Extrude profile selection, zero default, live preview, arrow drag, direct typing and operation/direction choices. | U17, U20, U32, U47, U91 | Requested and implemented (code/test evidence); owner-confirmed on earlier release | E2E files exist; test new/join/cut/intersect, symmetric/two direction, cancel/undo, rebuild and reopen. |
| W-08 | Revolve, sweep, loft, shell, hole, draft, patterns, mirror, combine, move/copy, split, rib, thread, scale, coil, pipe, emboss and mesh conversion. | U24–U30, U73, U91 | Requested and implemented in part; verification uneven | UI/command/test evidence varies by feature. Validate real geometry, preview/refusal, edit, save/reopen and undo/redo per operation. |
| W-09 | Edge-first fillet/chamfer selection, live preview and drag affordance. | U21, U25, U91, U93 | Present in both products; behavior parity incomplete | Forge tests cover edge picking/preview; README does not claim a fillet-radius drag handle. Verify chained edges, limits, cancel and occlusion. |
| W-10 | Face selection, face-attached sketches/features, snap-to-height, unrestricted orbit. | U32, U35, U47, U53, U103–U106 | Requested but incomplete pending high-priority regression | Face sketching/features and view controls exist, but user reported blockers. Test the reported half-wall and height-match workflows. |
| W-11 | Measure solid dimensions with a dedicated tool. | U91 | Requested and implemented in part; precision unverified here | Inspect/Measure and MCP route exist; compare point/edge/face and body results to analytic cases. |
| W-12 | Browser tree, editable timeline, parameters, dependency rebuild, undo/redo and recovery. | U47, U53, U91, U94, U99; Current request | Requested and implemented in part; recovery incomplete/unverified | Timeline/edit/parameter paths and tests exist; verify downstream rebuild, failed-feature repair, save/reopen and interrupted-work recovery. |
| W-13 | Discoverable grouped menus, context menus, usable dialogs and commands reachable without shortcuts. | U35, U47, U53, U91, U94 | Present in both products; layout behavior differs and remains incomplete | Ribbon, context menu and shortcut help exist; test narrow/wide widths, command reachability and dialog overflow. |
| W-14 | `.forge` save/open; STEP/IGES import; STEP/STL/3MF/OBJ and DXF export; mesh import. | U21, U24, U28, U30 | Requested and implemented; round-trip scope incomplete | Route/unit and browser tests exist. Validate malformed/large files, assembly STEP and external structure/measure. |
| W-15 | Mesh-to-solid for regular parts; clear refusal for sculpted/uneven meshes. | U30, U109, U116; Current request | Requested and implemented in part; acceptance incomplete | Forge has slab conversion and volume check. Test representative non-demo meshes and verify unchanged state on refusal. |
| W-16 | MCP inspection, command discovery, modeling, measurement, screenshot, parameter change, undo/redo, errors and filesystem restrictions. | U78, U85, U88, U89, U91; Current request | Requested and implemented; real-engine/client regression pending | Bridge and tests exist; client setup eventually worked per owner. New contract/security tests are in this branch; e2e needs engine. |
| W-17 | Version display, updates, desktop shortcut/login startup and Windows/Linux launch workflow. | U78, U82, U85, U97 | Requested and implemented; packaged OS validation incomplete | Docs/scripts/UI and unit tests exist; verify actual update rollback and Linux launcher. |
| W-18 | Predictable undo/redo, actionable errors and model integrity; document recovery/autosave behavior. | U47, U91, U103, U106; Current request | Requested and implemented in part; recovery requirement remains unverified | Undo/redo and rollback batches exist; determine and test autosave/recovery behavior explicitly. |
| W-19 | Sketch dimensions, direct-manipulator editing, section DXF, FreeCAD/Rhino import and history editing. | U30, U50, U83, U91 | Mixed: implemented, incomplete and missing items | Angle/point dimensions and section DXF exist in code/docs; direct drag and additional native CAD imports remain incomplete/not claimed. |
| W-20 | Components, assemblies, joints, motion and configurations. | Current request | Present in Solidcraft but missing/incomplete in Forge | Solidcraft has component/occurrence/joint/motion/configuration code and tests; Forge browser/components are not assembly parity. Decide scope after core reliability. |
| W-21 | Reference planes/axes, construction geometry, selection of vertices/edges/faces/bodies/components and measurement. | U53, U91; Current request | Requested and incomplete | Some sketch construction and face/edge/body picks exist; full reference entities, vertex/component selection and selection measurement need end-to-end evidence. |
| W-22 | Predictable geometry, performance and responsiveness; supported Windows/Linux packaging. | U11–U16, U82; Current request | Requested but incomplete | No representative performance baseline; actual Windows/Linux package acceptance and precision corpus are pending. |

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
