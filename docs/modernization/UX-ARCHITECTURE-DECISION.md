# UX Architecture Decision: Forge Frontend or SolidCraft Application Foundation

**Status:** Option B prototype approved; product cutover still requires owner approval
**Date:** 2026-10-22  
**Scope:** Interaction architecture and product foundation for DemonX Forge on `codex/fusion-parity`  
**Review mode:** Source inspection; prototype implementation began after owner approval

## Recommendation

Proceed with **Option B as the target product foundation**: use the SolidCraft Rust/egui desktop application and its tested browser, selection, context-menu, sketch, and feature-dialog workflows as the starting point for a DemonX Forge desktop experience. Keep Forge's identity and theme, use SolidCraft's native project format for the prototype, and build a narrow compatibility layer for the Forge MCP contract.

This recommendation is based on the user's direct experience with the running SolidCraft app and the corresponding implementation evidence below. Forge's current UI has useful sketch, viewport, and feature work, but its browser, general selection state, and command editing remain application-specific and uneven. Rebuilding those interaction patterns in React would create a large second UI implementation while the reference already has a more integrated set of workflows and UI tests.

This UX review revises the frontend direction in `docs/modernization/ARCHITECTURE.md`, which recommended retaining React before this usability-focused reassessment. The owner approved a reversible native prototype and explicitly lowered `.forge` compatibility priority. Forge MCP contracts and security remain mandatory constraints.

The owner approved the prototype, not replacement of the existing application. Keep the React UI, server, adapter, and existing projects as rollback until the native experience passes the scenario and compatibility gates in this document. Retain `.forge` files unchanged; opening them in the prototype is optional unless it becomes a specific blocker. Do not change the default Forge product path or MCP behavior until the owner approves cutover.

## Evidence and confidence

Evidence below is from the checked-out Forge development branch and the read-only SolidCraft repository. Source presence establishes an implementation path; it does not establish that every workflow has been tested end to end. SolidCraft UI tests are present in source, but could not be run in this environment: `cargo` and `rustc` are unavailable, and no SolidCraft desktop executable is present under its checkout's `target` directory. The SolidCraft application was therefore not launched for this review. Forge's existing browser E2E scripts were inspected but not run: although `web/dist/index.html` is present, `FORGE_ENGINE` is unset and there is no `data/engine` binary in this checkout.

Forge's pinned engine and the reference workspace both identify version `0.19.0` (`engine/SOLIDCRAFT_REF`; SolidCraft root `Cargo.toml`). That is a useful compatibility starting point, not proof that a new native UI can read and write every existing Forge document correctly.

## Side-by-side comparison

| Area | Option A — retain React/Three.js | Option B — SolidCraft Rust/egui foundation | UX decision |
|---|---|---|---|
| Body selection | `Viewport` can highlight a whole body during selected modify operations, but `Browser` body rows only render a label and visibility button. They have no row-select, body-rename, or row-context-menu handlers. | Browser entries represent `Sel::Body`; row selection supports modifier-aware selection, and body context menus expose rename, visibility, isolate, export, and save-as-mesh actions. | B already has the interaction model Forge needs. A would need a shared, typed selection model across tree, viewport, dialogs, and commands. |
| Face, edge, vertex selection | Three.js ray hits map triangles through `faceIds`; face picking is used by modify and sketch-plane flows. E2E scripts cover face and edge operations. Forge's current face selection is mode-dependent and the reported reliability issue remains open. | Selection uses typed `Sel` values for bodies, faces, edges, vertices, planes, profiles, and sketch elements. `PickIndexes` spatially indexes mesh triangles and edge segments, with tests for picking behavior. | B has stronger selection architecture and explicit performance handling. Both still need scenario-level validation on real models. |
| Browser tree | Tree supports body/sketch/origin visibility and sketch double-click editing. Body rows are not selectable or renameable. Origin planes are listed and become buttons while plane-picking mode is active. | Tree models document/component/folder structure, selected state, visibility, activation, drag/drop, row context menus, and feature rows. Body rename is routed to `body.rename`. | B is much closer to a complete CAD browser. Forge would need structural row state, modifier selection, context menus, rename and isolate workflows. |
| Export scope | `/api/export` validates a format, then `Engine.exportBodies(format)` exports the full design. There is no selected-body argument in the engine interface or route. | Body context menus pass explicit body names to `file.export` and `file.save_mesh`; the mesh dialog requires selected bodies and carries those names to the engine. | B has body scope. Neither one-file STL path preserves named bodies as separately addressable objects; details below. |
| Origin plane and face sketch | Forge supports origin-plane picking from a modal/picking flow and a selected planar face can start a sketch through a context action. These paths exist, but are split across modes and menus. | Origin and construction planes are first-class selection types. Browser and viewport context menus offer Create Sketch for a plane; a face context menu also offers Create Sketch. | B has more direct paths and consistent selection inputs. |
| Sketch and feature editing | Forge implements direct editing for sketches, extrudes, holes, and selected numeric features. Other timeline feature edits return an explicit “not available yet” message. | The UI is organized around command dialogs and typed selection inputs; timeline and browser actions route into sketch/feature editing. Its existing UI suite covers many command dialogs and interaction flows. | B reduces new interaction engineering. The exact requested feature edit scenario still needs to be run on the native app before acceptance. |
| Context menus and manipulation | Forge has viewport and timeline menus, typed sketch input, drag handles for some features, and Fusion-inspired camera controls. It has no body-row menu. | SolidCraft has context actions for viewport geometry, bodies, faces, edges, browser entries, and timeline features, plus interactive dialogs and manipulation paths. | B has broader, more consistent menu coverage. Rebrand menus and shortcuts rather than copy protected product assets or wording. |
| Timeline and parameters | Forge has a timeline with rename/suppress/roll/delete and selected feature editors; its parameter browser edits values inline. Several feature types cannot be edited in place. | SolidCraft has the feature browser/timeline and a parameter-editing flow that operates on the document's parameter model. Its browser and timeline have dedicated test modules. | B is the more integrated starting point; regression compatibility with Forge's existing history must be established. |
| Theme and product identity | Forge already has its DemonX branding, dark/light theme, custom visual language, and browser app shell. | SolidCraft has Dark/Light palettes, token-based UI styling, and importable theme files (`solidcraft-theme/1`). It has SolidCraft window IDs, names, icons, and package identity that require rebranding. | Both can meet the brand requirement. B needs an explicit DemonX theme, product IDs, name, and Forge-owned icons; do not ship SolidCraft identity or assets as Forge assets. |
| MCP and security | Forge exposes nine `forge_*` tools through its own Node bridge. Requests are loopback-only; modeling commands are allowlisted; file operations use checked upload/download routes; engine file paths are confined to a temporary allow-path. | SolidCraft provides its own CLI/app MCP surface and a separate token-authenticated loopback control channel with per-request path scopes. Its MCP surface is not a drop-in Forge MCP replacement. | A preserves the current contract directly. B can evaluate the existing app control channel for a compatibility facade, while retaining Forge's names, schemas, command restrictions, and path boundary. |
| Save/open | `.forge` is a versioned ZIP containing `forge.json` and the engine-native `design.solidcraft`. Forge wraps and validates this format. | SolidCraft opens/saves `.solidcraft` design containers and JSON; it does not recognize Forge's outer `.forge` archive as a SolidCraft design. | B can retain `.forge` by preserving its wrapper and reading/writing the inner engine design. Validate fixtures, history, body names, parameters, visibility, and recovery before switching. |
| Windows/Linux delivery | Forge already has Node/React build and Windows/Linux packaging workflows. | SolidCraft has native Rust packaging scripts and release workflows for Windows and Linux distributions. Its build requires Rust 1.95 and native graphics/package toolchains. | B has real native packaging paths, but DemonX branding, signing, dependencies, and release automation need migration work. |
| Engineering and maintenance | Lowest short-term migration risk. Polishing the tree and interaction model touches the React stateful app, viewport picker, server API and engine adapter; future UI work remains on Forge-specific interaction code. | Highest initial cutover and compatibility cost. It reuses the mature application and avoids rebuilding a parallel browser/dialog system, but creates a Rust-native product migration and needs a Forge MCP/document bridge. | B is the better long-term UX investment if the bridge is kept narrow and the native scenario passes before cutover. |

## Representative workflow assessment

The requested scenario is a product acceptance test, not a claim based on menu labels. The table names the current implementation path and the work each option still needs.

| Step | Option A — changes needed | Option B — existing path and remaining work |
|---|---|---|
| Create three distinct bodies | Current sketch/extrude supports New Body. Make the body list and body identity available in a persistent selection model. | The command dialogs and engine support creating named bodies with `new_body` operations. Run the exact three-body GUI sequence. |
| Rename each body | Add a body-row context menu or inline edit, a validated server command, and rename propagation through selection, visibility, history references, and exports. | Body context menu has Rename for one body and routes to `body.rename`. Verify the row reflects the new name and the model reopens with it. |
| Select each body independently | Add body row click/keyboard selection, modifier-aware multi-select, viewport body selection, and consistent selection clearing. | Browser rows select body identities; body context actions operate on one or several selected bodies. Confirm clicking each row and viewport body yields the intended identity. |
| Hide, show, isolate | Hide/show exists as transient React state. Add isolate/show-all actions and decide/persist visibility semantics across save/reopen. | Body context actions provide Show/Hide and Isolate; visibility is tracked by the document session. Verify save/reopen semantics in the app. |
| Select faces and sketch on one face | Face picking and a “Create Sketch on this face” action exist. Improve hit priority/feedback and verify the selected face survives entering sketch mode. | Typed face picks feed selection inputs; face context menu offers Create Sketch. Spatial pick indexing and face-sketch UI tests exist. Run the sequence on a real solid. |
| Modify resulting geometry | Extend in-place editing beyond currently supported Forge feature types where required; ensure preview/commit/cancel/undo update the same history. | Existing feature dialogs and timeline actions use the same engine command path. Verify a real face-attached sketch, feature edit, rebuild, undo and redo. |
| Export one body as STL | Extend route and `Engine.exportBodies` to accept validated body names and forward them to the engine. Add export tests proving omitted/invalid names fail safely. | Body context menu scopes the mesh export to one body. The current code routes the chosen body name into `file.save_mesh`. Verify triangle count and volume against that body only. |
| Export multiple bodies while preserving separation | Add an explicit export choice: separate STL files (for example, a ZIP of one STL per body) or one multi-object 3MF/OBJ/STEP file. Do not silently flatten identity into one STL. Test names and body counts after import. | Multi-body selection is passed to the exporter. 3MF creates a named mesh object per body, and OBJ writes named objects. STL writes a flat triangle stream: disconnected bodies remain separate geometric shells only when they do not touch, but STL carries no body names or object boundary. Add a one-file-per-body STL option or recommend multi-object 3MF for this acceptance criterion. |
| Save and reopen | Keep the `.forge` wrapper and engine payload; add a round-trip fixture that checks all three named bodies, history, parameters, and saved visibility state. | Add a `.forge` open/save adapter around the existing native design container, then validate Forge files from v0.27.0 and the current branch. SolidCraft's `.solidcraft` support alone does not prove `.forge` compatibility. |

### Export semantics

An STL contains triangles, not named bodies or mesh objects. A multi-body export to one STL can preserve disconnected triangle shells geometrically, but does not preserve the three body identities and can make touching bodies indistinguishable as separate objects in downstream software. SolidCraft's STL writer receives a list of separately meshed bodies and appends the triangles to the STL output; its 3MF path emits a `MeshObject` per body. Forge currently exports all bodies through one engine export call and exposes no body scope. The product should make the choice explicit: per-body STL outputs, or a named multi-object 3MF/OBJ/STEP export when separation matters.

## Architecture and migration proposal

1. **Approved prototype:** on `codex/fusion-parity`, build an isolated native target from a pinned SolidCraft submodule. Keep Forge and SolidCraft checkouts unchanged; apply the minimal DemonX branding overlay at build time and preserve all notices.
2. **Native vertical slice:** execute the three-body UX scenario with screenshots, native save/reopen, topology/export assertions, and undo/redo. Do not count the UI/engine source tests alone as product acceptance.
3. **Project format:** use SolidCraft's native project format during the prototype. Keep old `.forge` files and the existing application as backups; do not spend meaningful effort on migration unless a specific project workflow becomes a release blocker.
4. **MCP compatibility:** keep Forge's nine-tool contract and checked Node bridge as a compatibility layer. First evaluate SolidCraft's existing `--control PORT` channel: it is bound to loopback, requires a per-launch random token, and accepts per-request `allow_paths`. Adapt the Forge namespace over that authenticated channel so calls affect the active native document. Retain Forge's stricter command allowlist and its checked file routes; do not pass client paths through `forge_run_commands`. Keep Forge's Host/Origin checks on any HTTP-facing compatibility route, and test the existing Forge MCP client suite against the native session before making it the default.
5. **Acceptance and rollback gate:** pass the three-body scenario below through GUI and MCP where supported, save/reopen it, inspect exported body/object counts, pass MCP security tests, and run Windows/Linux build and packaging checks. Preserve the React release path and known-good Forge engine binary as rollback until these gates pass. Then present the migration plan and request the separate product cutover decision.

### Main risks and controls

- **MCP and session split:** a standalone native engine session and a separate Forge MCP server could show different models. SolidCraft already documents an authenticated loopback control channel for the running UI (`docs/control-protocol.md`, `apps/solidcraft/src/control_server.rs`, `crates/mcp/src/backend.rs`); verify it can back every Forge tool, including save/open, errors, and screenshots, before relying on it.
- **Path access:** upstream file commands can accept paths. Forge's Node bridge currently confines the engine to a temporary directory and streams files through validated routes. Preserve those restrictions at the compatibility boundary and test traversal, non-loopback requests, wrong Host/Origin, and denied file commands.
- **`.forge` migration:** SolidCraft's `.solidcraft` extension does not imply it can open Forge's ZIP wrapper. The owner has made old project compatibility low priority. Preserve the old app/projects as backups and use native `.solidcraft` files in the prototype; revisit a converter only if required for a specific release workflow.
- **STL identity:** one STL cannot preserve named body objects. Offer separate files or a multi-object format and explain the choice in the export UI.
- **Brand and licensing:** SolidCraft's workspace declares MIT OR Apache-2.0 and includes attribution/third-party notices. Preserve applicable notices and audit every adapted dependency, icon, font, illustration, and package asset. Use Forge-owned visual identity and icons.
- **Platform build:** the Rust UI adds native GPU and platform packaging dependencies. Test actual Windows and Linux builds and installers; source workflows alone are not release evidence.
- **Parallel UI cost:** avoid maintaining two permanent product frontends. Keep React only as a migration rollback path, then retire it after the approved native cutover passes product gates.

## Verification needed before cutover

- Launch the branded native app on Windows and Linux; validate high-DPI, supported GPU fallback, keyboard/mouse behavior, and packaging.
- Run the acceptance scenario using three spatially separated bodies, then repeat with bodies that touch to expose STL identity limitations.
- Test body rename, selection, visibility/isolate, face and origin-plane picking, face sketch attachment, feature edit, rebuild, undo/redo, and error recovery through the UI.
- Export one body to STL; export multiple bodies to separate STL files and to a multi-object 3MF; reimport and verify body/object count, names where the format supports them, bounds, and volume.
- Open and save representative v0.27.0 `.forge` documents and current-branch `.forge` documents; confirm history and parameters remain editable.
- Run existing Forge MCP clients against the active native document and compare tool names, JSON schemas, errors, unit conventions, screenshots, undo/redo, and GUI synchronization.
- Execute regression tests for local-only access, forbidden paths, command allowlisting, archive size limits, and safe error messages.
- Run SolidCraft UI/engine tests and Forge server/web/E2E/MCP suites in CI. This review could not run Rust or launch the SolidCraft app locally because the Rust toolchain and built desktop executable are absent.

## Source references

**DemonX Forge**

- `web/src/Browser.tsx`: body rows expose visibility only; sketch rows also support double-click edit; origin plane choices appear while picking.
- `web/src/Viewport.tsx`: Three.js face-hit mapping, face highlighting, plane picking, and body highlighting during body-modify modes.
- `web/src/App.tsx`: face context action for sketching, current feature-edit support and unsupported-edit error, transient hidden-body state, export UI, and origin plane selection.
- `server/src/engine/Engine.ts`: `exportBodies(format)` has no body-selection parameter.
- `server/src/index.ts`: export route calls `e.exportBodies` for every body.
- `server/src/commands.ts`, `server/src/access.ts`, `server/src/mcp.ts`, `server/src/engine/solidcraft.ts`: modeling allowlist, loopback access, Forge MCP contract, and engine process path confinement.
- `server/src/forgeFile.ts`: versioned `.forge` ZIP wrapper around the engine design.
- `e2e/README.md`, `e2e/select.mjs`, `e2e/sketch.mjs`, `e2e/mcp.mjs`, `e2e/files.mjs`: existing workflow coverage; these scripts were inspected, not executed in this review.

**SolidCraft reference (read-only)**

- `crates/ui-egui/src/browser.rs`: selectable body entries, visibility state, modifier-aware row selection, component/browser tree, and feature rows.
- `crates/ui-egui/src/context_menu.rs`: face/body actions, body rename, show/hide/isolate, body-scoped export, and face/plane Create Sketch.
- `crates/ui-egui/src/selection.rs`, `crates/ui-egui/src/pick_index.rs`: typed entity selection and indexed triangle/edge picking.
- `crates/ui-egui/src/dialogs_save_mesh.rs`, `crates/engine/src/cmd/file.rs`, `crates/io/src/lib.rs`: scoped mesh export and per-body 3MF objects versus flattened STL triangles.
- `crates/ui-egui/src/timeline.rs`, `crates/ui-egui/src/browser_model_tests.rs`, `crates/ui-egui/src/shell_face_sketch_ui_tests.rs`, `crates/ui-egui/src/pick_index_tests.rs`: timeline and interaction implementation/test locations.
- `crates/ui-egui/src/theme_files.rs`, `assets/styles/ui/themes/`, `apps/solidcraft/src/main.rs`, `packaging/windows/`, `packaging/linux/`: theme customization, application identity, and native packages requiring DemonX rebranding.
- `docs/control-protocol.md`, `apps/solidcraft/src/control_server.rs`, `crates/mcp/src/backend.rs`: existing authenticated loopback control bridge and per-request path scopes to evaluate for preserving Forge MCP compatibility.
- Root `Cargo.toml`, `LICENSE-MIT`, `LICENSE-APACHE`, `ATTRIBUTION.md`, and `THIRD-PARTY-LICENSES.txt`: license and attribution review inputs.
