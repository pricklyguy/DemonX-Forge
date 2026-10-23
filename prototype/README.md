# DemonX Forge native prototype

The owner approved the SolidCraft-based native application as DemonX Forge's primary product
direction on 2026-10-22. Keep the existing React/server implementation and `.forge` projects as a
rollback while native platform and MCP gates progress. Do not build new Fusion-style interaction
parity in React or discard the rollback implementation during this migration.

## Source arrangement

`solidcraft/` is a Git submodule pinned to SolidCraft commit
`75261cd79733fe47cf898b54f865e6bfaffa1129`. It points to
`https://github.com/pricklyguy/DemonX-Solidcraft.git`; the reference checkout at the developer's
separate `DemonX-Solidcraft` path is never edited. This keeps upstream attribution and licensing
with the source and makes the exact engine/UI revision reproducible. DemonX changes live in this
repository's `branding/`, `apply-overlay.mjs`, and tracked test patch, not in the reference repository.

The overlay adapts the app name/id, Forge-owned emblem and horizontal wordmark, DemonX dark/light
theme, a clickable navigation-cube default, and line drag creation. Existing explicit navigator
preferences remain respected. It applies focused UI regression tests for rectangle, circle and line drag
creation with live dimensions, focus, cancellation and history. It checks the pinned SHA and source
anchors. Always apply it to an isolated source clone, not the SolidCraft reference checkout or pinned
submodule.

SolidCraft is licensed MIT OR Apache-2.0. Preserve its `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`,
and third-party notices in prototype builds. The Forge-owned emblem is used only as the native app
window icon; no SolidCraft artwork is copied into Forge assets and no proprietary CAD artwork is
used.

## Build on Windows

For a repeatable package and persistent side-by-side installation, run from this checkout in
PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./prototype/package-windows.ps1
./prototype/install-windows.ps1 -PackageDirectory ./prototype/dist-windows/<release-id>
```

The build checks the pinned submodule, applies and verifies the Forge overlay in a separate
working clone under `%TEMP%\DemonXForgeBuild`, then compiles the native app and CLI with
the stable MSVC toolchain. It bundles the nine-tool MCP compatibility bridge and the SolidCraft,
third-party, and Forge license notices. Keep the generated package and `build-windows.log` as the
release checkpoint. The installer retains immutable binaries in `C:\DemonX-Forge-Native\versions`
and changes `current.txt` atomically. To restore the prior program version, close the app and run:

```powershell
./prototype/rollback-windows.ps1
```

The launcher is `C:\DemonX-Forge-Native\DemonX Forge.cmd`; the installer also creates a per-user
Start menu shortcut. Normal settings live in `%APPDATA%\DemonX Forge\data`; autosave/recovery and the
private MCP control token live in `%LOCALAPPDATA%\DemonX Forge`. These profile folders are outside
the versioned program folders and are never replaced by an update or rollback. Back up saved
`.solidcraft` files separately; the app's recovery folder is for unsaved work, not a project archive.
The installer does not replace the original Forge app or its associations.

For MCP, launch the installed app normally. Configure a client to run
`C:\DemonX-Forge-Native\forge-mcp.exe` with no arguments. The Windows package bundles Node and a
stable stdio launcher; no port, token, or separately installed Node runtime is needed. A
shell-friendly `forge-mcp.cmd` is also installed. The bridge still reads only Forge's authenticated
per-user control token files and keeps the existing nine-tool contracts, filesystem scopes, and
unsafe-command refusals. It does not add arbitrary file or script execution tools. See
`docs/modernization/RELEASE-PREP.md` for the client configuration and updater status.

Install the Rust toolchain required by the pinned workspace (`rust-version` in
`solidcraft/Cargo.toml`), then from the repository root:

```powershell
$source = Join-Path $env:TEMP 'DemonX-Forge-NativePrototype'
git clone --shared --no-checkout prototype/solidcraft $source
git -C $source checkout 75261cd79733fe47cf898b54f865e6bfaffa1129
node prototype/apply-overlay.mjs $source
node prototype/verify-overlay.mjs $source
cargo build --manifest-path "$source\Cargo.toml" --release -p solidcraft -p solidcraft-cli --locked
cargo test --manifest-path "$source\Cargo.toml" -p solidcraft-ui-egui --lib sketch_dims::tests::mouse_drag_ -- --nocapture
```

The Windows workflow launches the built app with isolated profile directories and an explicit
random control token, then runs `prototype/native-acceptance.mjs`. The scenario exercises a sketch
and extrude, separate bodies and renaming, face-attached sketch, feature redefine, fillet, browser
selection and visibility, measurement, undo/redo, save/reopen, body-scoped STL, three-object 3MF,
authentication refusal, and application screenshots. It also invokes modeling through the actual
Forge MCP tool contract, then checks the native browser/model state. The harness never uses or
deletes the developer's existing app-data folders.

## Build on Linux

Install the native build prerequisites listed in SolidCraft's `docs/building.md`, the pinned Rust
toolchain, and Node.js 22. Then use the same `node` and `cargo` commands above. The native
prototype workflow in `.github/workflows/native-prototype.yml` builds and tests both Windows and
Linux runners and uploads the native executables as branch artifacts.

The application control socket is loopback-only and uses SolidCraft's per-launch random token.
`prototype/mcp-native.ts` reuses Forge's existing MCP server, nine tool schemas, and command
allowlist; its transport speaks to the authenticated native control channel. It exposes no project
open/save/export/import or arbitrary filesystem tool. Its screenshot route creates a private
temporary folder and passes that exact folder as `allow_paths` to the app. The app reads the token
from SolidCraft's per-port private token file, so the token is not added to MCP client configuration.

For a local prototype MCP client, start the native application with a fixed loopback control port
(for example `--control 47831`), run `npm ci` once and build the adapter with
`node prototype/build-mcp-native.mjs`. Configure the MCP process to run
`node prototype/dist/mcp-native.mjs` with `SOLIDCRAFT_CONTROL_PORT=47831`. The bridge reads the
per-port private token file; do not copy the token into client configuration. Keep the port and app
profile local to this computer. The existing Forge app remains the rollback path.

The native GitHub Actions workflow checks out SolidCraft at the pinned commit from its separate
private repository. Configure a Forge repository Actions secret named `SOLIDCRAFT_READ_TOKEN` with
a fine-grained token that has read-only Contents access to `pricklyguy/DemonX-Solidcraft`; the
workflow intentionally does not reuse or store that token in the prototype. Without the secret,
CI stops at source checkout and supplies no build or GUI acceptance evidence.

## Validation status

Source-level checks can run with `node prototype/apply-overlay.mjs --check prototype/solidcraft`.
Native build, launch, screenshot, and three-body GUI/MCP acceptance require a Rust toolchain and a
visible desktop session. Do not mark those gates passed from source inspection or a successful
compile alone. Record the run artifacts and results in `docs/modernization/PROTOTYPE-RESULTS.md`.
