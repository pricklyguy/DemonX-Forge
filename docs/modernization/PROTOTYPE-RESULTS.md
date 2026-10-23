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

## Sketch drag and live dimension validation (2026-10-22)

The existing native UI already supported drag creation for fixed two-point shapes, inline values,
Tab/Shift+Tab navigation, Enter, Escape, parametric dimensions, snapping, and click-click drawing.
The new mouse-event regression tests found line drawing was omitted from the two-point drag route:
the line command is a continuing polyline (`Kind::Draw(0)`) rather than a fixed two-point tool. The
Forge overlay now treats a fresh line tool as a drag start, while retaining short-movement and
click-click behavior and keeping the line tool available for the next segment.

On the isolated Windows source clone pinned to `75261cd79733fe47cf898b54f865e6bfaffa1129`:

```text
cargo test --locked -p solidcraft-ui-egui --lib sketch_dims::tests::mouse_drag_ -- --nocapture — 3 passed
cargo test --locked -p solidcraft-ui-egui --lib sketch_dims::tests:: — 16 passed
cargo test --locked -p solidcraft-ui-egui --lib sketch_moving_click_tests:: — 2 passed
cargo test --locked -p solidcraft-ui-egui --lib sketch_drag_ui_tests:: — 9 passed
cargo build --locked --release -p solidcraft -p solidcraft-cli — passed
node prototype/native-acceptance.mjs <isolated release executable> — passed
```

The GUI harness injects real egui pointer press/move/release events and keyboard text/key events.
It verifies typed rectangle width/height and circle diameter, line length/angle, live field focus
and Tab navigation during a held drag, cancellation without geometry/history changes, and one-step
rectangle undo/redo. The existing suites also recheck pointer snapping, short-movement/click-click
creation, selected-geometry dragging, and editing existing geometry. Aggregate: 27 passed, 0 failed.

The rebuilt executable passed the full native GUI/MCP scenario again. Result: bodies `Plate`, `Part
B`, `Part C`; eight history features; three separate 3MF objects; single-body STL 19,684 bytes;
all-body STL 20,884 bytes; nine Forge MCP tools. Screenshot: `%TEMP%\demonx-forge-native-acceptance-Tc0F1a\demonx-forge-three-body.png`.
The Rust test build reports one existing unused `brand_mark` warning because the Forge overlay uses
its own brand mark. Linux remains unverified locally.

For hands-on review, a second `DemonX Forge` window is running from the rebuilt executable at PID
`26564`, with the three-body sample and an isolated profile under
`%TEMP%\DemonX-Forge-Interaction-20261022`. The previously open prototype instance was left
untouched.

## Navigation cube and Forge wordmark UX checkpoint (2026-10-22)

The native app now defaults to SolidCraft's existing clickable, labeled view cube, including its
face picks, rotation arrows, and Home/fit control. The signed-axis compass remains available as an
explicit preference. New profiles and reset-to-defaults use the cube; saved navigator preferences
are preserved. The app bar now renders Forge's existing horizontal wordmark from
`web/public/forge-wordmark.png`, scaled for compact and full-width layouts. The Forge emblem remains
the native window icon. No SolidCraft source checkout or Forge `main` was changed.

Validation used a clean source clone pinned to `75261cd79733fe47cf898b54f865e6bfaffa1129`:

```text
node prototype/apply-overlay.mjs <clean clone> — passed
node prototype/verify-overlay.mjs <clean clone> — passed
node prototype/apply-overlay.mjs --check <clean clone> — passed (idempotent)
cargo test --locked --release -p solidcraft-ui-egui --lib — 1,851 passed, 6 ignored, 3 failed
cargo build --locked --release -p solidcraft — passed
node prototype/native-acceptance.mjs <release executable> — passed
```

The three failures at that checkpoint were: the static colour-literal guard (fixed afterward by
using egui's neutral white tint; the focused suite and full suite now pass), plus
`home::tests::cached_recent_uses_a_separate_png_without_reading_or_changing_design_json` and
`home::tests::imported_step_picture_is_cached_under_its_source_without_a_save_path`. Both cache
tests later passed individually and in the full suite when the test process used a writable
temporary `LOCALAPPDATA`; the failure cause and full rerun result are recorded below.
The test build also reports one unused upstream `brand_mark` warning because the Forge wordmark
replaces that app-bar glyph.

The final release executable launched in DX12 and passed the real GUI/MCP acceptance workflow:
three separately named bodies, history editing, face/origin-plane sketching, extrude/fillet,
save/reopen, undo/redo, independent STL and 3MF export, all nine Forge MCP tools, and the existing
authentication/path/unsafe-file restrictions. Result: 8 history features, 3 separate 3MF objects,
single-body STL 19,684 bytes, all-body STL 20,884 bytes. Screenshot:
`%TEMP%\demonx-forge-native-acceptance-Bji1LM\demonx-forge-three-body.png`.

A fresh-profile preview is running as PID `30392` from
`%TEMP%\DemonX-Forge-NativePrototype-cube-target\release\solidcraft.exe`; its isolated settings
are under `%TEMP%\DemonX-Forge-Cube-Logo-Preview-20261022`. Fresh-profile launch confirms the cube
and branded wordmark appear together. Existing prototype processes were not interrupted because
they held the previous release executable open.

## Permanent Windows installation and full-suite acceptance (2026-10-22)

The repeatable Windows package and install/update/rollback workflow were exercised using the
branch checkout at `d968a6840236d939629e12d5c07f83bc5222f390` and pinned engine
`75261cd79733fe47cf898b54f865e6bfaffa1129`. The package is x64 and includes the native GUI and
CLI, Forge MCP bridge, DemonX Forge `.ico` and wordmark, and the SolidCraft/Forge license notices.
The ZIP is `prototype/dist-windows/0.19.0-forge-d968a6840236-engine-75261cd79733.zip` and its
manifest records per-file SHA-256 hashes. The install scripts stage immutable version directories,
switch the active version pointer, retain the prior version for rollback, and leave per-user data
outside the installed version tree.

The package is installed separately at `C:\DemonX-Forge-Native`; the existing Forge application
was not changed. Launch it from Start Menu > DemonX Forge or run
`C:\DemonX-Forge-Native\DemonX Forge.cmd`. Current version:
`0.19.0-forge-d968a6840236-engine-75261cd79733`. Normal settings are stored in
`%APPDATA%\DemonX Forge\data`; recovery, thumbnails, and the private MCP control token use
`%LOCALAPPDATA%\DemonX Forge`. User-selected native `.solidcraft` projects remain wherever the
user saves them and are not stored inside a release directory.

The actual installed GUI and bundled MCP bridge passed `prototype/native-acceptance.mjs` against
a fresh temporary user profile. It created and independently named three bodies, selected each,
hid/showed/isolated them, picked a face and origin plane, sketched on a body face, extruded and
edited history, selected a face, filleted, undid/redid, saved and reopened with eight history
features, exported one body as a 19,684-byte STL and all three as a 3-object 3MF, and captured the
native GUI screenshot. The installed bundled bridge exposed all nine Forge tools. MCP inspection,
measurement, screenshot, parameter changes, undo/redo, modeling, actionable errors, and GUI sync
passed; invalid authentication, scoped path traversal, unsafe file operations, and forbidden file
commands were refused. Run result:

```json
{"status":"passed","root":"%TEMP%\\demonx-forge-native-acceptance-LqcFKP","screenshot":"%TEMP%\\demonx-forge-native-acceptance-LqcFKP\\demonx-forge-three-body.png","bodies":["Plate","Part B","Part C"],"historyFeatures":8,"threeMfObjects":3,"stlBytes":19684,"allBodiesStlBytes":20884,"forgeMcpTools":9,"mcpScreenshot":true}
```

The screenshot is `demonx-forge-three-body.png` in that acceptance directory. The installed GUI was
also launched from the persistent directory and remained open as PID `45376`. A separate package
script smoke test installed version 1, updated to version 2, and rolled back to version 1 while a
user-data marker survived both transitions. The test used synthetic packages to exercise installer
pointer/data behavior; the shipped native package itself was then installed and accepted as above.

### Rust UI test suite and cache failures

After correcting the Forge color-token check, the focused suite passed:

```text
cargo test --locked --release -p solidcraft-ui-egui --lib colour_tokens_tests -- --nocapture
5 passed, 0 failed
```

The complete UI library suite was rerun from the pinned isolated build with GPU rendering required
on DX12 and a writable temporary `LOCALAPPDATA`:

```text
1854 passed, 0 failed, 6 ignored; 0 measured, 0 filtered out
```

Both previously failing thumbnail-cache tests now pass with this profile. They had failed in the
Codex test process because Windows resolves `%LOCALAPPDATA%` to the owner's
`C:\Users\ogbul\AppData\Local`, where the sandbox identity only has read/execute access. The app
silently skips cache directory creation on that denied path. Setting the test process's
`LOCALAPPDATA` to a writable temporary directory makes both tests pass, matching normal execution
under the owner's interactive Windows account. The test run did not change SolidCraft source; only
the disposable build clone and temporary profile were used. The Forge color-token guard now passes
with the overlay's neutral tint. One upstream unused-brand-mark/dead-code compiler warning remains.

### Update, rollback, and outstanding platform work

Repeatable commands and prerequisites are in `prototype/README.md`. Build with
`prototype/package-windows.ps1`, install or update with `prototype/install-windows.ps1`, and restore
the previous release with `prototype/rollback-windows.ps1`. The installer verifies the package
manifest before switching versions. It does not migrate `.forge` projects or change project file
associations. `.dxforge` remains a deferred branding task; native `.solidcraft` remains the supported
format and existing `.solidcraft` projects keep their native serialization.

Windows package build, launch, install, update-pointer, rollback, installed-app modeling, save/reopen,
undo/redo, export, MCP compatibility, and security gates pass. Linux compilation/package launch,
Linux file associations, signed distribution, and broad hardware/display coverage remain unverified.
Linux work is outstanding but does not block use of the Windows installation. Keep independent
backups of important designs and save deliberately; a crash recovery file is best-effort recovery,
not a replacement for a saved project. The prior Forge installation remains available as a fallback.

### Sketch plane selection and drag-to-dimension follow-up (2026-10-22)

The installed-app report about an unavailable sketch plane and prematurely completed rectangle
draws was reproduced against the pinned native UI. The Create Sketch card now includes a native
UI-kit **Origin plane** dropdown with `XY · Top`, `XZ · Front`, and `YZ · Right`; it remains
unselected until the user chooses an option, so opening the card cannot silently start an XY
sketch. The existing planar-face selection chip is retained. A regression scenario starts the
card with all three origin planes individually hidden and verifies selecting `XZ · Front` starts
the sketch on that plane.

For rectangle, circle, and line tools, a real press-drag-release now leaves the second point as an
editable preview. Exact live dimensions can be entered after releasing the mouse, Tab moves between
fields, Enter commits the shape, and Escape cancels. A short movement still behaves as a click and
the click-click workflow remains available. Tests verify the typed profile dimensions, line length
and angle, release-without-commit, cancel without partial geometry, and single-step undo/redo.

Verification against the pinned upstream checkout, using a writable temporary Windows test
profile and DX12 with GPU rendering required:

```text
Sketch dropdown acceptance: 1 passed
Mouse-drag rectangle/circle/line acceptance: 3 passed
Shared UI-kit guard tests: 15 passed
Complete release UI library suite: 1855 passed, 0 failed, 6 ignored
```

The complete **debug** test profile still triggers seven epaint `Dropped TexturesDelta` assertions
in unrelated existing gallery, browser, thread-dialog, and preview tests, even when serialized;
the release-profile suite (the native packaging profile) passes. The upstream unused `brand_mark`
warning remains. The fixes are Forge-owned overlay patches applied to the pinned SolidCraft commit;
the read-only upstream checkout remains unchanged.

The fixes were packaged and installed as
`0.19.0-forge-b2b80238e377-engine-75261cd79733` under
`C:\DemonX-Forge-Native\versions\`; `current.txt` points to this version and
`previous.txt` retains `0.19.0-forge-d968a6840236-engine-75261cd79733` for rollback. The package
was accepted using its installed executable and bundled MCP bridge, with a fresh temporary profile:

```json
{"status":"passed","bodies":["Plate","Part B","Part C"],"historyFeatures":8,"threeMfObjects":3,"stlBytes":19684,"allBodiesStlBytes":20884,"forgeMcpTools":9,"mcpScreenshot":true}
```

This reverified the nine-tool contract, security refusals, GUI/MCP synchronization, three separate
bodies, face selection, modeling/history edits, save/reopen, undo/redo, one-body STL export, and
multi-body 3MF separation from the installed build. Screenshot:
`%TEMP%\demonx-forge-native-acceptance-n0bPxi\demonx-forge-three-body.png`. The previously running
native app process (PID `45376`) was left open on its prior executable; save any open design, close
that window, and relaunch with `C:\DemonX-Forge-Native\DemonX Forge.cmd` to use the patched build.

### Sketch dimension labels and Sketch Grid toggle (2026-10-22)

The report about numeric rectangle dimensions was checked against the actual drawing path. Typed
rectangle width and height already reach the engine as parameter-backed constraints; the missing
evidence was a post-confirmation render check. The drag regression now verifies both persistent
driving values (24 mm and 12 mm) and two visible dimension annotations after Enter. This keeps the
H/V constraint markers and adds the width and height labels users expect.

The Sketch Grid control was wired to a preference that the open-sketch viewport intentionally
overrode. The Forge overlay now applies the same grid visibility switch while a sketch is open.
Its viewport test checks the grid is absent with the switch off and restored when it is on.

Verified on the pinned Windows source using DX12 with GPU tests required:

```text
Post-confirmation rectangle dimensions and rendered labels: 1 passed
Sketch Grid viewport toggle: 1 passed
UI library unit tests: 1855 passed, 0 failed, 6 ignored
Windows icon audit after CRLF normalization in its test copy: 4 passed
```

The broader scenario integration target was also run. Its first run had five old expectations for
the previous SolidCraft axes default, theme ID, and immediate commit-on-release behavior. The Forge
overlay was updated to account for the cube default, branded theme ID, and Enter-to-confirm drag
workflow. At the last completed scenario run, three assertions still failed (two preferences
expectations and the circle drag confirmation); those scenario adjustments have not yet been
rerun. The installed package build and installed acceptance for this follow-up are also pending.
