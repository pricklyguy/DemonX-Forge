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

### Follow-up — MCP script-driven modeling (requested 2026-10-23)

**Status:** planned. Forge exposes structured modeling commands through `forge_run_commands`, but it does not provide a script import workflow. The intended use is a parameter-driven generator that turns inputs into Forge commands, submits bounded batches, and checks the resulting model.

- Validate a reusable parameter-to-command workflow over the existing MCP tools; prefer structured, allowlisted command batches over executing arbitrary source code inside Forge.
- Support staged batches with checks between stages using design inspection, queries, measurements, or screenshots, and return actionable errors when a stage fails.
- Preserve all nine MCP tool names and schemas, authentication, command/path restrictions, and the native GUI's live document synchronization. Do not add arbitrary filesystem access or client-selected file operations.
- Decide whether a script import/definition format is still needed after validating the external generator workflow; if so, specify parameter validation, failure/partial-run behavior, and compatibility before implementation.

**Completion:** a parameterized real-model workflow can create and modify representative geometry (including primitives, joins/cuts, patterns, and mirroring), verify each stage through MCP, and leave the active GUI model consistent. Save/reopen and undo/redo behavior, partial-failure reporting, and security refusals are verified; no script execution or import capability is claimed before its acceptance checks pass.

## Native scripting, first-class MCP, and large-model milestone (requested 2026-10-23)

**Status:** source assessment and proposed scripting architecture documented in
[`SCRIPTING-ARCHITECTURE.md`](SCRIPTING-ARCHITECTURE.md); owner review requested before building a
new in-app script runner/runtime. The installed application and project data were not changed.

1. **Scripting architecture:** approve or revise the proposed JSON in-app runner plus external
   Python generator/client, both using the existing SolidCraft command registry. Require checked
   batches, geometry/timeline postconditions, clear per-step errors, and verified undo/rollback.
   Add reusable user scripts now; design add-in lifecycle and permissions as a later decision.
2. **First-class MCP:** install a stable version-independent launcher, add secure live-app endpoint
   discovery with a private token, make normal connection setup discoverable in the app, and keep
   the fixed-port/version-path setup as a compatibility fallback. Preserve the nine Forge tools,
   their schemas, and all existing filesystem and unsafe-command restrictions.
3. **Large-model usability:** use an independent generated or copied test fixture with at least 50
   named bodies and substantial feature history. Measure load/save/rebuild, viewport, browser,
   selection, exports, and MCP latency; verify geometry, history, save/reopen, and GUI/MCP sync.
   Never run acceptance edits against the owner's working project.
4. **Branding and project files:** keep `.dxforge` associations as a lower-priority follow-up and
   retain `.solidcraft` compatibility without serialization changes for branding alone.

**Completion:** approved script workflow works in-app and through MCP against the same live model;
the stable MCP shim connects securely without version-specific paths or a manually selected port;
all nine tools and refusals have regression evidence; the 50+ body scenario meets recorded
performance and geometry criteria on Windows, with Linux results clearly separated; the prior
installed release and user documents remain available for rollback.

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

## Native scripting and large-model usability milestone (2026-10-23)

The owner approved the hybrid scripting architecture in [`SCRIPTING-ARCHITECTURE.md`](SCRIPTING-ARCHITECTURE.md).
Native JSON scripts reuse the pinned SolidCraft command registry; they do not introduce a second
modeling kernel. The existing nine Forge MCP tools and MCP command/path restrictions remain a
separate compatibility surface.

### Scripting checkpoint

- [x] Add a native Scripts & Add-Ins interface with library, JSON editing, import, save, Run, Stop,
  progress, completion/error reporting, and an explicit future-only Add-Ins label.
- [x] Validate script version/size, command names, Forge permissions, and typed parameters when
  present. Refuse file operations, import/export, UI/view control, nested scripting, undo/redo, and
  transaction-control commands.
- [x] Run on the UI thread one command per frame with a native session checkpoint. A failed command
  or Stop restores the pre-run document and history. Success groups all modeling changes as one
  undo/redo step.
- [x] Keep the user script library outside versioned app folders and separate from MCP permissions.
- [x] Verify all nine MCP tools against the newly installed application and complete stable
  endpoint discovery/launcher changes. The optional `single_undo: true` argument on the existing
  `forge_run_commands` tool submits through the native script runner while preserving the normal
  default batch behavior and all nine tool names.
- [x] Package and install `0.19.0-forge-bcbe72dcbc90-engine-75261cd79733` beside the prior release;
  verify the package overlay is repeatable and the stable MCP launcher still follows the active
  version.
- [x] Run save/reopen, real fillet-failure rollback, Stop, SDK failure/success, single undo/redo,
  and GUI interaction acceptance in the installed Windows application.
- [ ] Verify Linux build and package compatibility; no Linux runner was available in this local
  acceptance pass.
- [x] Implement the optional Python SDK after native runner and MCP acceptance pass. It generates
  schema v1 scripts and submits one MCP-validated native transaction using the existing
  `forge_run_commands` tool.

**Verified 2026-10-23:** native runner tests: 4 passed; Python SDK tests: 3 passed; server suite with
the installed CLI engine: 160 passed, 4 skipped; combined installed-app acceptance passed. Full
commands and evidence are in [`SCRIPTING-TEST-RESULTS.md`](SCRIPTING-TEST-RESULTS.md).

**Acceptance:** create a multi-body model from a reusable script; deliberately fail a later feature
and verify no partial geometry or history remains; run successfully and undo/redo once; save/reopen
and preserve parametric history; verify MCP tools and security refusals remain unchanged.

### Large-model GUI performance checkpoint (dependency: installed script runner and stable MCP)

- [x] Generate an isolated fixture with 50 independently named bodies and 60 history features;
  never open or save over the owner's 57-body project.
- [x] Measure browser scroll/selection/rename/hide/show/isolate latency, dense face/edge selection,
  face-attached sketch setup, standard camera navigation, sampled viewport timings, individual and
  multi-body exports, MCP inspection and parameter rebuild latency.
- [x] Record hardware available to the runtime, fixture method, model size, timings and screenshots
  in [`SCRIPTING-TEST-RESULTS.md`](SCRIPTING-TEST-RESULTS.md). These are baseline measurements, not
  performance budgets.
- [x] Save/reopen the fixture and verify body structure, rename, history, and an edited parametric
  volume.
- [ ] Measure sustained viewport frame rate and physical mouse orbit/pan latency; the current
  acceptance records a single frame/build sample and standard Front-view transition only.

### Product identity follow-up (after scripting and large-model acceptance)

- [ ] Adopt `.dxforge` as the native project extension while continuing to open `.solidcraft`.
- [ ] Update dialogs, recent files, project icons, Windows/Linux file associations, and Save/Open
  behavior without an unnecessary serialization change.

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
- [x] Build and install `0.19.0-forge-a92a977068ed-engine-75261cd79733` under `C:\DemonX-Forge-Native`; the prior release remains in `previous.txt` for rollback.
- [x] Rerun installed-app modeling and MCP acceptance: three independent bodies, history edits, save/reopen, STL and separated 3MF export, undo/redo, all nine Forge MCP tools, security refusals, and GUI screenshot passed.
- [x] Rerun the adjusted broader scenario target: 121 passed, 0 failed, 1 ignored.
