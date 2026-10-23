# DemonX Forge Native Scripting Architecture

**Status:** Proposed for owner review; no new runtime implemented.
**Date:** 2026-10-23
**Scope:** Native application scripting, MCP attachment, and the first large-model usability gate.

## Recommendation

Build scripting around SolidCraft's existing command registry and structured JSON command format. Add a versioned Forge script document and an in-app script manager/runner that validates and dispatches commands through the same engine command path used by the UI. Run a script as a checked transaction with a checkpoint, per-stage model assertions, actionable failure output, and rollback when a command or required check fails.

Do not embed Python in the native process for the first scripting release. Provide a small external Python client/SDK later for parameter generation and reusable automation; it should emit the same JSON command representation and submit it through MCP (or a stable local client API). This keeps CAD operations in the existing Rust engine, avoids duplicating modeling logic, and avoids an embedded interpreter, FFI surface, GIL/thread coordination, and a second in-process security boundary.

Treat add-ins as a later extension point. Begin with reusable data-only scripts and a stable command API. Define an add-in manifest, lifecycle, UI extension hooks, signing/trust model, and capability permissions only after script execution and the MCP API have stabilized. Do not imply that JSON scripts themselves are equivalent to Fusion's long-lived add-ins.

## Evidence from current code

| Area | Evidence | What it establishes / does not establish |
|---|---|---|
| Modeling command source of truth | `prototype/solidcraft/crates/engine/src/cmd/mod.rs` defines `CommandSpec`; each feature is implemented in the engine command modules. The UI and automation use `Session::execute`. | Forge should reuse registered commands and their engine implementation. Some commands have only prose parameter documentation; typed contracts are not universal yet. |
| JSON script support | `prototype/solidcraft/docs/scripts.md`; `prototype/solidcraft/crates/engine/src/lib.rs` (`Session::run_script`); `prototype/solidcraft/apps/solidcraft-cli/src/main.rs` (`run`, `eval`, `script`). | JSON command scripts already work in the headless CLI and can replay modeling commands. CLI support is not an in-app script manager. |
| History export | `prototype/solidcraft/crates/engine/src/cmd/script.rs` implements `timeline.export_script` and `timeline.add`; `apps/solidcraft-cli/tests/script_roundtrip.rs` verifies replay for a design corpus. | Timeline-to-script round trips exist for supported designs. Export reports omissions and rejects some assembly/component cases; it is not a general backup of every document property. |
| Script failure behavior | `Session::run_script` stops at the first failed step and returns an indexed error, but does not create a transaction around the sequence. | Direct script replay alone does not meet the requested all-or-nothing/undo behavior. |
| Transactional batches | `prototype/solidcraft/crates/ui-egui/src/control.rs` implements `engine.batch` with checkpoint, first-error stop, rollback, timings/profile, and file-load refusals. `crates/mcp/src/tools.rs` exposes a batch tool with rollback semantics. | The native control layer has a better execution primitive for Forge scripts than direct `Session::run_script`; feature-result validation still needs explicit checks. |
| Native app-control authentication | `apps/solidcraft/src/control_server.rs` binds only `127.0.0.1`, creates a random 32-byte token, writes it under the user's data directory with owner-only permissions, and removes it at exit. Binding port `0` is supported by the server. | Secure random-port attachment is technically available; Forge's current bridge/config still requires a fixed `SOLIDCRAFT_CONTROL_PORT` and version-specific bridge path. |
| Forge MCP facade | `prototype/mcp-native.ts` adapts the live native app to the existing Forge MCP server. `server/src/mcp.ts` and `server/src/commands.ts` preserve the nine-tool contract and modeling allowlist; file operations are excluded from generic command batches. | The existing contract and safety checks are reusable. Current Windows setup needs a versioned bridge path and a manually matched port, as the installed package instructions and recent missing-token log demonstrate. |
| Large-model test foundation | `prototype/solidcraft/apps/solidcraft-cli/src/bench_agent.rs` generates a deterministic parametric bicycle with roughly 1,300 bodies at scale 1 and reports command/display timing and reopen phases. | There is a useful independent stress generator and timing format. It is not yet a Forge-owned 50+ body UI acceptance scenario and does not measure all requested selection/browser/export interactions. |

## Comparison of scripting options

| Option | Strengths | Costs and risks | Recommendation |
|---|---|---|---|
| Embedded Python directly calling Rust/engine APIs | Familiar for CAD automation; expressive; could support long-running add-ins. | Interpreter packaging on Windows/Linux; Python ABI and Rust FFI; GIL and UI-thread constraints; duplicated API surface; arbitrary code has the native process's privileges; substantially larger support and security burden. | Do not use as the initial runtime. Reconsider only with a mature permissions and add-in model. |
| JSON command scripts only | Native to MCP and the engine command registry; portable and reviewable; easy to validate, test, log, diff, and replay; no extra runtime. | Less expressive for loops, calculations, external data, and interactive add-ins; schema/versioning and rollback must be designed; file-picker/UI work is needed for an in-app experience. | Use as the in-app execution format and stable interchange contract. |
| Hybrid: JSON in-app + external Python generator/client | Keeps modeling in Rust while making parameterized generators convenient; scripts can be produced outside Forge and run inside it; the same commands can be sent in MCP batches. | Requires a stable, documented JSON/API contract and a small maintained client package; Python generator errors occur outside the CAD transaction unless staged results/checks are used. | **Recommended.** Sequence the Python helper after the JSON runner and stable MCP connection are in place. |

## Proposed script contract and execution

Introduce a Forge-owned versioned format (working name: `.dxscript`, JSON `format: "demonx-forge-script/1"`) with:

- Human-readable metadata and named input parameters with type, unit, default, and validation bounds.
- Ordered stages containing registered command IDs and JSON parameters. A parameter may refer to validated script inputs; the runner resolves these into ordinary engine command values before execution.
- Optional post-stage checks using bounded inspection, measurement, and timeline predicates (for example: expected body names/count, nonzero volume, or no failed feature results).
- A report containing the stage and step that failed, command result/error, checks performed, timings, and whether rollback was confirmed.

For each stage, validate the document version, size/count limits, parameter types/units/ranges, command existence and capability allowlist before changing the design. Execute via `engine.batch` or a shared transactional engine service, not a second modeling implementation. After commands, inspect timeline/body results and run requested checks. If execution or a required check fails, restore the checkpoint and report whether rollback succeeded. Keep separate checkpoints between stages when the script explicitly requests staged commits; make the partial-commit policy visible before Run. A script with file operations must use separately authorized, scoped capabilities and an explicit user prompt; do not smuggle paths through modeling commands.

The app UI should provide Scripts (browse/import, inspect, edit inputs, preview command summary, run, cancel where safely possible, and view results). The first release can use a simple native JSON editor or parameter form; it should not wait for a Python editor. A later Python SDK should only construct/validate this format and communicate through the stable MCP/local transport. The Rust command registry remains authoritative for available commands and schemas.

### Undo and history policy

- Successful script stages must be undoable as a single meaningful operation, or have explicit named checkpoints if engine history cannot safely collapse them.
- Failed commands and failed required checks must restore the pre-stage model before claiming rollback. Report any failure to restore rather than claiming no changes.
- Reject unknown command IDs, malformed params, over-limit scripts, and disallowed file or process operations before execution.
- Preserve engine errors and step indices. Never return success merely because a command returned JSON if the recomputed timeline contains failed features.

## First-class MCP attachment recommendation

Keep the nine existing Forge tools and their schemas as the compatibility facade. Make MCP an opt-in native app capability with a visible connection status and one-click setup/help. When enabled, the app should bind to `127.0.0.1` on an OS-assigned port, generate a fresh random token, and publish a private, atomic discovery record in the existing per-user control directory. The record should contain endpoint metadata (port, process identity, protocol version), but not the secret. The existing protected token file remains the credential.

Install a stable `forge-mcp` shim beside the active-release pointer, outside versioned release directories. The shim resolves the current bundled bridge; the bridge discovers and verifies the live endpoint, reads the corresponding owner-only token, then authenticates to loopback. Keep `SOLIDCRAFT_CONTROL_PORT` as an explicit compatibility override while removing the need to configure it for normal use. On shutdown/release changes, remove or invalidate discovery state; on connection failure, show which stage failed (bridge launch, discovery, authentication, app response) without logging token contents.

Retain command/query allowlists, bounded payloads, loopback binding, host/origin validation where applicable, and separate explicit file APIs. Add tests for stale discovery records, multiple candidate app processes, missing/invalid token, wrong-user ACLs, no app running, app restart, and native release switching. Preserve the current client config as a rollback path until the stable shim is accepted by Claude, Codex, and at least one generic stdio MCP client.

## Large-model verification strategy

Do not open or edit the owner's 57-body project. Generate a separate fixture with at least 57 independently named bodies and a substantial history, or make a byte-for-byte working copy into a test-only directory before any test edits. SolidCraft's `bench-agent` is a starting point, but record the actual body/feature counts and choose a repeatable Forge-owned script/fixture.

Capture baseline and post-change numbers on the same host and build: cold open, save, reopen, representative parameter rebuild, command/MCP latency, viewport frame-time p50/p95, browser scroll and rename response, body/face/edge selection latency, export duration/file sizes, and process memory. Verify structure and geometry before/after: body names/counts, feature/timeline count, selected body identity, volume/bounds where applicable, separated multi-body export semantics, and save/reopen equality. Exercise MCP while the large document is already open and compare the visible GUI to the inspected state. Treat visual smoothness without measured numbers as insufficient evidence.

## Public Fusion workflow comparison

Autodesk publicly documents a **Scripts and Add-Ins** manager for creating, importing/linking, editing, running, stopping, and debugging scripts/add-ins. Its documented API supports Python and C++ (and current API pages also expose TypeScript for some methods), exposes design objects and UI customization, and distinguishes one-shot scripts from persistent add-ins that may run at startup. Forge should reproduce the user-facing capability pattern independently, not copy API code, UI assets, or proprietary implementation details. A staged JSON runner plus external Python generator is a narrower first milestone; a true long-lived add-in API is explicitly later work.

Sources: [Fusion API User's Manual](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/UserManualIndex_UM.htm), [Creating a Script or Add-In](https://help.autodesk.com/view/fusion360/ENU/?guid=GUID-9701BBA7-EC0E-4016-A9C8-964AA4838954), [Scripts Object](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/core_Scripts.htm), [Script.run](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/core_Script_run.htm).

## Migration and rollback

1. Keep native command execution and MCP tool names stable; add script parsing/validation and tests without removing the current bridge.
2. Add the opt-in dynamic endpoint and stable MCP shim as an additive installer update. Keep fixed-port and versioned-path startup supported during rollout.
3. Add the in-app JSON script runner behind a feature setting; use the same command registry and transaction service as MCP.
4. Add parameterized templates and an external Python client only after runner, validation, and reports pass Windows and Linux tests.
5. Evaluate add-in manifests and extension permissions separately; do not permit arbitrary in-process code as a shortcut.

Preserve immutable prior release folders, the active/previous release pointers, app preferences/projects, and the old Forge MCP configuration. Rollback consists of switching the package pointer to the previous release and disabling the new opt-in features; no project serialization change is required. `.dxforge` remains a separate low-priority file-association task and does not change this scripting format.

## Decision requested

Approve or revise the **hybrid architecture** before implementation of the native script runner or any scripting runtime. The no-regret interim work is to maintain the nine-tool contract, design the stable MCP attachment, and prepare an independent large-model fixture. No application code or installed user data was changed for this proposal.
