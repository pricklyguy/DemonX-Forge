# DemonX Forge modernization roadmap

**Baseline:** Forge v0.27.0, branch `codex/fusion-parity`.
**Strategy (updated 2026-10-22):** the owner approved the SolidCraft-based native application as Forge's primary product direction. Keep the existing React app/server and saved projects as a rollback during the phased transition; do not spend effort rebuilding its interaction architecture. Native usability gates lead active work. Forge MCP names and security remain required compatibility gates. Native `.solidcraft` is preferred; legacy `.forge` migration is low priority.

## Approved native prototype track

**Transition status:** Windows native package is installed separately and passed installed-app real-model, nine-tool MCP/security, save/reopen, export, and update/rollback acceptance. Keep the React app as a fallback. Linux package validation and broader platform coverage remain open; they do not block Windows daily use.

### Prototype 1 — Source pin, branding, and reproducible build

**Status:** Windows package, install, launch, and full UI suite verified; Linux build/package remains pending. The pinned `prototype/solidcraft` source (`75261cd79733fe47cf898b54f865e6bfaffa1129`) is built from an isolated clone with a branding overlay. The branch workflow still needs `SOLIDCRAFT_READ_TOKEN` for CI checkout. Full Windows evidence is in `PROTOTYPE-RESULTS.md`.

**Completion:** overlay validation passes, pinned workspace builds and its engine/UI tests pass on Windows and Linux, and a branded native window starts on Windows with a captured screenshot. Attach build logs/artifacts and document dependencies and license notices.

**UX checkpoint (2026-10-22):** the native navigation cube is now the default for new profiles,
and the app bar uses Forge's existing horizontal wordmark. Existing saved navigator choices remain
respected. The Windows installed release build and native GUI/MCP workflow passed with the updated
overlay. The complete UI suite later passed with 1,854 tests, 0 failures, and 6 ignored after using
a writable test profile for thumbnail caching. See `PROTOTYPE-RESULTS.md` for details.

### Prototype 2 — Three-body usability acceptance

**Status:** passed on the Windows native prototype; Linux package acceptance and broader owner usability remain open.

- Create three spatially separate bodies and rename them from the browser.
- Select each independently; verify hide/show/isolate, face and edge selection, and selection persistence across tool changes.
- Create a sketch on an existing body face; select an origin plane in the viewport; extrude and edit the resulting feature in history. Sketch-on-origin-plane GUI authoring remains a follow-up check.
- Export one body as STL; export several bodies as separate STL files and as 3MF, then verify object/body counts and independent geometry.
- Save and reopen the native project; verify body names, feature history, parameters, and geometry. Exercise undo/redo around modeling and history edits.

**Completion:** automated real-engine assertions plus a Windows UI/control run, screenshots, and a comparison against the existing Forge workflow are recorded in `PROTOTYPE-RESULTS.md`. The upstream UI test suite by itself does not satisfy this product scenario.

### Prototype 3 — Forge MCP compatibility and security

**Status:** passed against the Windows native GUI with all nine established Forge tools and security restrictions exercised. Linux packaged execution remains pending.

- Keep the existing nine Forge tool names, schemas, units, errors, and response shapes.
- Route calls to the same active native GUI document through SolidCraft's token-authenticated loopback control channel.
- Retain Forge's modeling/query allowlists, loopback and Host/Origin checks, and restricted file handling. Never pass client-selected paths through the modeling batch.
- Demonstrate an MCP-authored sketch/extrude/modify workflow reflected in the GUI, then inspect, measure, screenshot, undo/redo, and save/reopen it.
- Keep the adapter isolated from Forge's default product route; add MCP compatibility and security regressions before any migration.

**Implementation checkpoint:** `prototype/mcp-native.ts` reuses `server/src/mcp.ts` and `server/src/commands.ts` instead of defining a second tool contract. The installed-app acceptance harness sent MCP protocol requests through the bundled bridge and verified native document/GUI state, all nine tools, authentication, path scope, and unsafe-operation refusals.

**Completion:** existing Forge MCP integration tests pass against the active native session, including forbidden command/path and unauthenticated control refusals.

### Prototype 4 — Packaging and migration recommendation

**Status:** Windows package installed and accepted at `C:\DemonX-Forge-Native`; the separate existing Forge installation is intact. Manifest verification, versioned install/update/rollback, persistent per-user paths, native app launch, modeling, MCP, export, and save/reopen passed. Linux package execution is unverified and does not block the Windows installation.

- Build and launch Windows/Linux packages with Forge-owned identity and isolated app-data paths; preserve SolidCraft license and third-party notices.
- Keep package and update steps repeatable: stage immutable version folders, switch one active-release pointer atomically, retain the previous release, and keep project/settings/recovery data outside version folders.
- Document native `.solidcraft` project handling. Do not spend significant work on `.forge` import unless a concrete acceptance blocker appears; preserve the old application, project files, and STL backups.
- Compare the three-body scenario against the current Forge UI, publish screenshots, verified behaviors, limitations, and rollback steps.
- Present a migration plan and wait for separate owner approval before replacing the existing application.

**Windows installation gate:** passed on 2026-10-22; the owner can use the native app while the incumbent remains a fallback. Linux package and broader release audit remain outstanding. No merge into `main`.

### Future branding task — `.dxforge` project extension (low priority)

**Status:** deferred until the permanent Windows installation and core CAD usability work are stable. New projects continue to use SolidCraft's native `.solidcraft` format and serialization for now.

- Add `.dxforge` as the preferred Forge save/open extension while retaining read/write compatibility with existing `.solidcraft` projects.
- Update Save/Save As/Open dialogs, recent files, project icons, Windows and Linux desktop/file associations, and command-line open behavior together.
- Preserve the current underlying project bytes unless a separate format change is justified by a tested migration and rollback plan.

**Completion:** create/save/open/reopen both extensions, confirm recent-file behavior and native history integrity, and verify install/uninstall associations on Windows and Linux without changing `.solidcraft` projects.

The React-focused Phases 2–8 below are retained as the verified incumbent-app backlog and regression reference. They are deferred as the primary product path while the approved native prototype gates are active.

## Phase 0 — Assessment and baseline contracts

**Status:** complete. The five assessment documents and requirement traceability are drafted; branch safety is recorded; Windows typecheck, build, unit/service tests and package-script portability checks were run. The toolchain was updated to supported Vite 8 / Vitest 5 releases and the full npm audit reported zero vulnerabilities at the checkpoint. The engine and browser checks initially lacked local prerequisites; the pinned engine has since been obtained from the official v0.27.0 release and validated in Phase 1. Results are recorded in `TEST-PLAN.md`.

## Phase 1 — MCP, service security and adapter contract

**Status:** complete on the Windows development host. The established tool names and schemas remain stable; real-engine protocol and browser MCP checks pass, including security refusals and GUI save/reopen of an MCP-authored model. Four skipped server tests are explicitly Linux-only launcher cases; no engine-dependent server tests skipped with `FORGE_ENGINE` set.

**Priority:** critical; all GUI features and any engine upgrade depend on it.

- Freeze the existing Forge MCP tool names, input schemas, output shapes, protocol behavior and documented configuration as compatibility fixtures.
- Add end-to-end MCP regression cases for read-only design inspection, command discovery, a sketch/extrude model, measure, screenshot, parameter change, undo/redo, refusal/error and filesystem/unsafe command restrictions.
- Review loopback/Host/Origin validation, command allowlist, query allowlist, payload bounds and path ownership as part of the regression suite.
- Add adapter capability/version diagnostics; unknown commands and parameters must fail or warn clearly, never silently produce a misleading success.

**Completion:** old clients remain compatible; all read/write/error restrictions have automated evidence; one MCP-authored real model can be inspected, measured, undone/redone and saved/reopened through GUI.

**Completion record (2026-10-22):** `solidcraft-cli 0.19.0` from the official Forge v0.27.0 Windows release, whose tag pins `33fdcdb3a08b2a8d2b52f2eb8bf990dfee6c21f7` as this branch does. The release archive SHA-256 was checked against its published checksum and GitHub asset digest. `FORGE_ENGINE` was set explicitly for the server suite. `e2e/mcp.mjs` verified live GUI sync, inspection, measurement, screenshot, fillet, undo/redo, GUI save/new/open and geometry/history preservation. `e2e/mcp-protocol.mjs` verified the nine established tools, parameter changes, measurement, screenshot bytes, undo/redo, unsafe-path command refusals, and unchanged geometry after refusal. See `TEST-PLAN.md` for complete results and Windows limitations.

## Phase 2 — Reproducible real-model acceptance corpus

**Status:** in progress. Added a pinned-engine plate workflow that checks analytic bounds/volume, sketch dimension rebuild, a real fillet, undo/redo, and save/reopen. Existing MCP and browser scenarios supply a drilled plate, face-attached sketch, mesh-converted bracket, shell, pattern, and multi-body workflows. Remaining work is to consolidate independent fixtures/tolerances and execute the Linux packaged workflow.

- Build a small set of independent parametric parts (drilled plate, shelled bracket, multi-body assembly component, sketch on a non-origin face) with known dimensions and expected volumes/topology.
- Exercise sketch/profile selection, feature creation, timeline edit, parameter recompute, save/reopen, undo/redo and exported geometry for each part.
- Record tolerances and distinguish exact analytic checks from tessellation/topology approximations.

**Completion:** Linux automated engine/browser workflow passes and artifacts have independent structural/measurement checks; Windows manual check sheet is ready and owner run is recorded separately. Windows local evidence does not substitute for Linux package execution or owner-run packaged Windows acceptance.

## Phase 3 — Selection, sketch and viewport reliability

**Native interaction checkpoint (2026-10-22):** added viewport drag-to-create for fresh line tools;
rectangle and circle drag were already supported. Automated egui pointer-event tests verify exact
rectangle width/height, circle diameter, line length/angle, live-field focus and Tab navigation,
Escape cancellation, and rectangle undo/redo. The existing dimension/snap, click-click, selection
drag and edit tests also pass on the pinned Windows build. See `PROTOTYPE-RESULTS.md`. This closes
the reported sketch-creation interaction gap, not the broader selection/camera reliability phase.

- Verify face-attached sketch creation, profiles on existing bodies, overlap selection, face/edge/body hit-testing, inference and rubber-band semantics.
- Verify orbit continuity, snapping, camera orientation, selection after feature creation and return from sketch to model.
- Fix only reproducible regressions, with a focused test for every fix.

**Completion:** representative sketch-on-face bracket workflow produces the expected solid and survives edits/reopen; no known selection or camera blocker remains.

## Phase 4 — History, parameters, recovery and error behavior

- Audit feature identity/dependencies, timeline edits, suppression, roll-to, failed rebuilds, parameter changes and undo grouping.
- Define and document autosave/recovery behavior; add crash/restart recovery only if Forge has no reliable equivalent.
- Confirm `.forge` format versioning and backup behavior before engine upgrades.

**Completion:** change an early parameter and rebuild downstream features, repair a failed feature, save/reopen, and recover interrupted work without corrupting the source design.

## Phase 5 — Solid operations and Solidcraft capability reuse

- Compare the actual v0.19.0 pinned engine and the read-only current reference by typed command schemas and representative test scripts.
- Add only high-value missing capabilities through Forge's command facade and adapter. First candidates: face/edge interaction gaps and broader direct geometry selection, then history editing and assemblies only if scope/UX warrants it.
- Pin candidate engine in a dedicated commit after the compatibility suite passes. Preserve the old engine pin/package as rollback.
- Never import Solidcraft UI assets. For any adapted code, satisfy GPL-3.0-or-later compatibility and preserve MIT/Apache notices and `ATTRIBUTION.md` attribution.

**Completion:** each enabled feature passes geometry, preview/refusal, history edit, undo/redo, save/reopen and MCP checks where applicable. Unsupported modes remain explicit.

## Phase 6 — Formats, precision and performance

- Test STEP and IGES import with multi-body/assembly samples, mesh import, STEP/STL/3MF/OBJ exports, DXF sketch/face/section, corrupted inputs and large-model limits.
- Measure command latency, snapshot transfer size, viewport frame rate and selection response using documented representative models.
- Optimize only measured hot paths; retain numerical accuracy and valid topology.

**Completion:** documented format matrix, bounded failure handling, reproducible performance numbers and no regression in model precision.

## Phase 7 — GUI familiar-workflow and platform audit

**Prototype checkpoint (2026-10-22):** The pinned native SolidCraft prototype built with the Windows
MSVC toolchain, launched with a saved three-body document, and passed the local GUI/MCP acceptance
scenario. This is evidence for Option B feasibility; it does not complete this phase's installed
package, Linux, display-matrix, or owner usability criteria. See `PROTOTYPE-RESULTS.md`.

- Validate tool discoverability at supported window widths, ribbon/context menus, keyboard and mouse conventions, dialogs/previews and high-contrast dark/light themes.
- Test Windows packaged install/update/rollback and Linux packaged startup/update behavior. Confirm browser startup and local-only service behavior.

**Completion:** clean-machine Windows/Linux checklists pass; known limitations and supported hardware/runtime assumptions are published.

## Phase 8 — Release readiness and final audit

- Update README, MCP docs, feature matrix, release notes and this roadmap against tested outcomes.
- Record commands/tests actually run and outstanding blockers; create a rollback checkpoint and development-branch commit.
- Do not merge into `main`, publish, or enable auto-merge.

**Completion:** every enabled feature in the release is backed by applicable automated and manual evidence; known unsupported behaviors are explicit; owner receives the final audit.

## Rollback points

- Keep changes as small, phase-labeled commits on `codex/fusion-parity`.
- Treat engine pin changes, `.forge` schema changes, and package/update changes as separately revertible commits.
- Retain the last known-good engine reference and release artifact until the candidate completes Linux and Windows acceptance.
- Never use reset, force-push, rebase, destructive cleanup or changes to `main` to recover a phase.

### Native usability follow-up — 2026-10-22

- [x] Add a real Origin plane dropdown to Create Sketch, including the three principal planes and a neutral unselected state; retain planar-face picking.
- [x] Keep rectangle, circle, and line geometry in an editable preview after a drag release so live dimensions can be typed; preserve click-click, Tab, Enter, Escape, and single-step undo/redo behavior.
- [x] Verify the plane picker, three drag tools, shared UI-kit guards, and complete release-profile UI library suite on Windows.
- [x] Rebuild and install `0.19.0-forge-b2b80238e377-engine-75261cd79733`; the prior release remains in `versions/` and `previous.txt`.
- [x] Rerun installed-app MCP and modeling acceptance against the updated executable: nine tools, security refusals, body/face selection, sketching, feature/history edits, exports, save/reopen, undo/redo and GUI synchronization passed.
- [x] Record the persistent launch path. The pre-existing process remains on the older executable until the owner saves and restarts it.

### Sketch annotation and grid follow-up — 2026-10-22

- [x] Verify that rectangle live width and height are retained as driving dimensions and their numeric labels render after Enter; add a viewport regression assertion for both.
- [x] Make the Sketch Grid toggle hide the sketch-plane grid while a sketch is open; verify hidden and shown grid geometry in a viewport test.
- [x] Run the complete release UI library tests with DX12 required: 1,855 passed, 0 failed, 6 ignored.
- [x] Rerun the icon audit after normalizing manifest line endings for Windows: 4 passed.
- [ ] Rebuild and install this follow-up on Windows, then verify the visible dimensions and grid toggle in the packaged app.
- [ ] Resolve or document the remaining legacy scenario assertions for old theme IDs and update the drag-to-confirm scenario to press Enter for both rectangle and circle before claiming the complete integration suite passes.
