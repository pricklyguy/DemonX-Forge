# DemonX Forge modernization roadmap

**Baseline:** Forge v0.27.0, branch `codex/fusion-parity`.
**Strategy (updated 2026-10-22):** owner approved a reversible Option B native prototype, not a product cutover. The SolidCraft app is the prototype foundation; the existing React app, server, engine adapter, and saved projects remain untouched as rollback. Native usability gates now lead the active work. Forge MCP names and security remain required compatibility gates. Legacy `.forge` migration is low priority; keep the originals and their STL backups unchanged.

## Approved native prototype track

**Cutover status:** not approved. Do not replace the existing application until all native acceptance gates pass and the owner approves the migration plan.

### Prototype 1 — Source pin, branding, and reproducible build

**Status:** implementation in progress; local source checks pass; native build is unverified. Added `prototype/solidcraft` as a submodule pinned to `75261cd79733fe47cf898b54f865e6bfaffa1129`, a build-time overlay for DemonX app identity, window icon, and dark/light theme, and a Windows/Linux native build-and-test workflow. No source in the reference checkout was changed. This host has no Rust toolchain or built native executable, so desktop launch and the native test suite have not run locally.

**Completion:** overlay validation passes, pinned workspace builds and its engine/UI tests pass on Windows and Linux, and a branded native window starts on Windows with a captured screenshot. Attach build logs/artifacts and document dependencies and license notices.

### Prototype 2 — Three-body usability acceptance

**Status:** pending real native GUI execution.

- Create three spatially separate bodies and rename them from the browser.
- Select each independently; verify hide/show/isolate, face and edge selection, and selection persistence across tool changes.
- Create a sketch on an existing body face and on an origin plane; extrude it and edit the resulting feature in history.
- Export one body as STL; export several bodies as separate STL files and as 3MF, then verify object/body counts and independent geometry.
- Save and reopen the native project; verify body names, feature history, parameters, and geometry. Exercise undo/redo around modeling and history edits.

**Completion:** automated real-engine assertions plus a Windows UI/control run, screenshots, and a comparison against the existing Forge workflow are recorded in `PROTOTYPE-RESULTS.md`. The upstream UI test suite by itself does not satisfy this product scenario.

### Prototype 3 — Forge MCP compatibility and security

**Status:** design and implementation pending.

- Keep the existing nine Forge tool names, schemas, units, errors, and response shapes.
- Route calls to the same active native GUI document through SolidCraft's token-authenticated loopback control channel.
- Retain Forge's modeling/query allowlists, loopback and Host/Origin checks, and restricted file handling. Never pass client-selected paths through the modeling batch.
- Demonstrate an MCP-authored sketch/extrude/modify workflow reflected in the GUI, then inspect, measure, screenshot, undo/redo, and save/reopen it.
- Add MCP compatibility and security regressions before changing the default product route.

**Completion:** existing Forge MCP integration tests pass against the active native session, including forbidden command/path and unauthenticated control refusals.

### Prototype 4 — Packaging and migration recommendation

**Status:** pending.

- Build and launch Windows/Linux packages with Forge-owned identity and isolated app-data paths; preserve SolidCraft license and third-party notices.
- Document native `.solidcraft` project handling. Do not spend significant work on `.forge` import unless a concrete acceptance blocker appears; preserve the old application, project files, and STL backups.
- Compare the three-body scenario against the current Forge UI, publish screenshots, verified behaviors, limitations, and rollback steps.
- Present a migration plan and wait for separate owner approval before replacing the existing application.

**Completion:** platform build/launch and native usability/MCP gates pass, prototype is reversible, and the owner receives a cutover decision package. No merge into `main`.

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
