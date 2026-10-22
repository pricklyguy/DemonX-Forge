# DemonX Forge modernization roadmap

**Baseline:** Forge v0.27.0, branch `codex/fusion-parity`.
**Strategy:** retain the current UI/service/adapter boundaries and validate workflows before expanding features. Phases may overlap only where they have no dependency; each phase must leave a rollback point and update this roadmap and feature matrix.

## Phase 0 — Assessment and baseline contracts

**Status:** complete for the available baseline. The five assessment documents and requirement traceability are drafted; branch safety is recorded; Windows typecheck, build, unit/service tests and package-script portability checks were run. The toolchain was updated to supported Vite 8 / Vitest 5 releases and the full npm audit now reports zero vulnerabilities. The engine-dependent tests and real-browser suites could not run because this checkout has no engine binary. Results are recorded in `TEST-PLAN.md`.

## Phase 1 — MCP, service security and adapter contract

**Status:** in progress. The established tool names/schema, namespace and file-operation boundary now have stronger regression tests. Real-engine/browser MCP execution remains pending an engine binary.

**Priority:** critical; all GUI features and any engine upgrade depend on it.

- Freeze the existing Forge MCP tool names, input schemas, output shapes, protocol behavior and documented configuration as compatibility fixtures.
- Add end-to-end MCP regression cases for read-only design inspection, command discovery, a sketch/extrude model, measure, screenshot, parameter change, undo/redo, refusal/error and filesystem/unsafe command restrictions.
- Review loopback/Host/Origin validation, command allowlist, query allowlist, payload bounds and path ownership as part of the regression suite.
- Add adapter capability/version diagnostics; unknown commands and parameters must fail or warn clearly, never silently produce a misleading success.

**Completion:** old clients remain compatible; all read/write/error restrictions have automated evidence; one MCP-authored real model can be inspected, measured, undone/redone and saved/reopened through GUI.

**Foundation checkpoint:** unit coverage pins existing tool contracts and command path restrictions; Vite/Vitest maintenance and npm audit are complete. Real-engine MCP acceptance remains open.

## Phase 2 — Reproducible real-model acceptance corpus

- Build a small set of independent parametric parts (drilled plate, shelled bracket, multi-body assembly component, sketch on a non-origin face) with known dimensions and expected volumes/topology.
- Exercise sketch/profile selection, feature creation, timeline edit, parameter recompute, save/reopen, undo/redo and exported geometry for each part.
- Record tolerances and distinguish exact analytic checks from tessellation/topology approximations.

**Completion:** Linux automated engine/browser workflow passes and artifacts have independent structural/measurement checks; Windows manual check sheet is ready and owner run is recorded separately.

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
