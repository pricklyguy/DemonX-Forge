# Native prototype validation results

**Date:** 2026-10-22
**Branch:** `codex/fusion-parity`
**Pinned SolidCraft source:** `75261cd79733fe47cf898b54f865e6bfaffa1129`

## Current status

| Gate | Result | Evidence |
|---|---|---|
| Reference repository remains unchanged | Pass (read-only inspection) | Original checkout was clean at the pinned commit before prototype setup. All prototype metadata and work are under this Forge checkout. |
| Reproducible source arrangement | Pass (source pin) | `prototype/solidcraft` submodule points to `pricklyguy/DemonX-Solidcraft` and records the exact local reference commit. |
| Overlay anchor validation | Pass | `node prototype/apply-overlay.mjs --check prototype/solidcraft` verifies the pinned SHA and expected source anchors. |
| Overlay application | Pass (isolated source clone) | Applied the overlay to a disposable local clone under the OS temporary directory, not the reference checkout or the checked-in submodule. |
| Branding/theme static validation | Pass | `node prototype/verify-overlay.mjs <overlay clone>` verified the app title/id, Forge emblem loader, built-in dark/light theme registration, theme token keys, and lockfile dependency. |
| Native Rust build and engine/UI suite | Unverified | `cargo`, `rustc`, and `rustup` are not installed locally. Actions run `39852404910` failed before build because the SolidCraft repository is private to the runner; the workflow now uses the required `SOLIDCRAFT_READ_TOKEN` repository secret to fetch the pinned source. |
| Native Windows startup, GUI scenario, screenshots | Unverified | No built desktop executable or interactive native run is available in this environment. |
| Three-body export/save/reopen scenario | Implemented as a Windows Actions harness; unverified | `prototype/native-acceptance.mjs` launches the app with isolated settings and a scoped authenticated control channel. It drives browser rename, body selection, context-menu hide/show/isolate, origin-plane and face selection, feature edit, geometry/history assertions, scoped STL, separated three-object 3MF, save/reopen and screenshots. The Windows job has not reached this scenario. |
| Forge MCP compatibility/security against native GUI | Adapter and real-session checks implemented; runtime unverified | `prototype/mcp-native.ts` reuses the existing Forge MCP schemas/handler and command allowlist, forwards only approved model/query operations through the token-authenticated loopback channel, and scopes its internally generated screenshot path. The Windows harness calls all nine tools, authors the initial sketch/extrude/bodies, verifies GUI state, tests parameter edits, inspection, discovery, measurement, screenshot, undo/redo, forbidden file commands and engine errors. The native MCP workflow has not reached this scenario. |
| Existing Forge React workflow comparison | Partial | The comparative source evidence is in `UX-ARCHITECTURE-DECISION.md`; no new three-body execution or screenshots were produced in this turn. |
| Existing Forge unit/service baseline | Pass with explicit skips | `npm.cmd test`: server 111 passed, 52 skipped across 11 files; web 68 passed. Engine-dependent server cases skipped because this checkout has no `FORGE_ENGINE` executable. This does not substitute for native prototype or real-engine acceptance. |

## Prototype design

The pinned upstream source is kept in a Git submodule. `prototype/apply-overlay.mjs` makes a narrow,
reviewable build-time overlay for the window title, isolated app-data ID, Forge-owned emblem, and
DemonX dark/light colors. It refuses a source commit change or an unexpected upstream anchor.
`prototype/verify-overlay.mjs` checks applied identity/theme dependencies and validates color token
names against SolidCraft's theme registry. SolidCraft source and license files stay in their own
submodule; Forge branding remains in Forge-owned assets.

`.github/workflows/native-prototype.yml` is scoped to this branch and manual dispatch. It builds and
tests the pinned native workspace on Windows and Linux, runs the Forge MCP contract tests, type-checks
and bundles the native MCP bridge, launches the app on the Windows runner with an isolated profile,
executes the real three-body GUI/MCP scenario, and uploads app/CLI binaries, license notices, and
the screenshot. Initial run `39852404910` failed at private SolidCraft source checkout before
build. Configure the documented read-only `SOLIDCRAFT_READ_TOKEN` secret before runner validation
can proceed; no native build/GUI evidence is available yet.

## Known blockers

- Install/provision Rust 1.95+ on the local Windows host or use the branch Actions workflow to get
  actual native build/test evidence. GitHub-hosted Windows startup may not present frames in all
  environments, so capture limitations explicitly and use the dedicated Windows desktop smoke path
  where required.
- Run and debug the Forge MCP bridge against the active native session. Confirm all nine existing
  tool names and contracts, command/path restrictions, screenshot transport and error reporting.
- Run and debug the scripted three-body real-engine scenario, including face selection/face sketch,
  feature edit, scoped STL, separated multi-body export, native save/reopen, and GUI synchronization.
- The current app title, native app-data identity, window icon and palette are the initial brand
  overlay. Other upstream-facing strings, package metadata and screenshots still require review
  before this can be called a professional DemonX product experience.
