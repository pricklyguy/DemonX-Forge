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
| Native Windows toolchain | Pass | Rust/Cargo 1.99.1 stable MSVC target; MSVC `cl.exe`/`link.exe` 14.44.35207 and Windows SDK 10.0.26100.0 headers/resource compiler verified through `VsDevCmd.bat`. |
| Native Rust build | Pass | `cargo build --release --locked -p solidcraft -p solidcraft-cli` built the pinned source on Windows. The crate cache needed network access; after it was available the release build completed. One unused upstream brand-mark warning remains because the overlay replaces that mark. |
| Native Windows startup and screenshot | Pass | The actual release executable launched in normal DX12 mode under the Windows GUI session with title `DemonX Forge`. The screenshot is in the acceptance artifact directory. Interactive launch uses the same binary and a copied sample document. |
| Three-body export/save/reopen scenario | Pass | `prototype/native-acceptance.mjs` drove three independently named bodies, selection, hide/show/isolate, origin-plane sketch, face-attached sketch, extrusion redefine, face selection, fillet, save/reopen, one-body STL, all-body STL and a three-object 3MF. The reopened document retained names and eight history features. Latest run result is recorded below. |
| Forge MCP compatibility/security against native GUI | Pass | `prototype/mcp-native.ts` reused Forge's nine tools and existing command/query allowlists through the token-authenticated loopback channel. The native run checked discovery, MCP-authored geometry visible in the GUI, inspection, measurement, screenshot, parameter change and undo/redo, error reporting, refused `file.save`, invalid token and scoped-path traversal. |
| Existing Forge React workflow comparison | Partial | Source comparison remains in `UX-ARCHITECTURE-DECISION.md`. The actual three-body workflow has been executed on the native prototype; a same-run instrumented React comparison was not part of this local acceptance. |
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
the screenshot. The private checkout token is still needed for CI; local Windows native build and
acceptance no longer depend on it.

## Known blockers

- Linux packaged build and interactive startup remain unverified locally. The branch Actions
  workflow needs the read-only `SOLIDCRAFT_READ_TOKEN` to check out its private pinned source.
- The current app title, native app-data identity, window icon and palette are the initial brand
  overlay. Other upstream-facing strings, package metadata and screenshots still require review
  before this can be called a professional DemonX product experience.

## Windows native run (2026-10-22)

The source was cloned to a disposable directory under `%TEMP%` at the exact pinned commit, then the
idempotent Forge overlay was applied there. The original SolidCraft checkout stayed on `main` at the
pinned clean revision. Release outputs and acceptance files are outside both repositories.

```text
Toolchain: rustc 1.99.1 stable-x86_64-pc-windows-msvc
MSVC:      cl.exe/link.exe 14.44.35207 (Hostx64/x64)
Windows SDK: 10.0.26100.0 (headers and rc.exe)
Build:     cargo build --release --locked -p solidcraft -p solidcraft-cli — passed
Acceptance: node prototype/native-acceptance.mjs <release executable> — passed
```

The final branded build was recompiled after adjusting the app-bar spacing. The successful acceptance
JSON was:

```json
{"status":"passed","root":"%TEMP%\\demonx-forge-native-acceptance-Qwkr0R","screenshot":"demonx-forge-three-body.png","bodies":["Plate","Part B","Part C"],"historyFeatures":8,"threeMfObjects":3,"stlBytes":19684,"allBodiesStlBytes":20884,"forgeMcpTools":9,"mcpScreenshot":true}
```

The GUI was then left open as PID `35116` with title `DemonX Forge`, showing the copied sample at
`%TEMP%\DemonX-Forge-Interactive-20261022\three-body.solidcraft`; settings and data are isolated
under the same temporary profile directory. The built executable is under
`%TEMP%\DemonX-Forge-NativePrototype-f63196bf3769419d991d6e3cad0e0518\target\release\solidcraft.exe`.
To relaunch the sample, run the executable with that `.solidcraft` file as its argument. The app
remains available for interactive testing until it is closed.

The scenario exercised GUI-origin and face sketch picking, extrusion redefine,
fillet undo/redo, browser context actions, independent face selection, save/reopen, MCP parameter
undo/redo, invalid-token refusal, path-scope refusal, and unsafe MCP file-command refusal. This is
local Windows prototype evidence; it does not establish Linux packaging or owner usability approval.
