# DemonX Forge native prototype

This is a reversible Option B proof, not the replacement Forge application. The existing React
frontend, Node server, engine adapter, and `.forge` projects remain in place.

## Source arrangement

`solidcraft/` is a Git submodule pinned to SolidCraft commit
`75261cd79733fe47cf898b54f865e6bfaffa1129`. It points to
`https://github.com/pricklyguy/DemonX-Solidcraft.git`; the reference checkout at the developer's
separate `DemonX-Solidcraft` path is never edited. This keeps upstream attribution and licensing
with the source and makes the exact engine/UI revision reproducible. DemonX changes live in this
repository's `branding/` and `apply-overlay.mjs`, not in the reference repository.

The overlay is deliberately limited to the app name/id, a Forge-owned window icon, and the DemonX dark/light theme. It never
rewrites upstream source silently: it checks the pinned SHA, verifies each expected source anchor,
and aborts if upstream moves those anchors. Review overlay changes with the source pin together.

SolidCraft is licensed MIT OR Apache-2.0. Preserve its `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`,
and third-party notices in prototype builds. The Forge-owned emblem is used only as the native app
window icon; no SolidCraft artwork is copied into Forge assets and no proprietary CAD artwork is
used.

## Build on Windows

Install the Rust toolchain required by the pinned workspace (`rust-version` in
`solidcraft/Cargo.toml`), then from the repository root:

```powershell
node prototype/apply-overlay.mjs prototype/solidcraft
node prototype/verify-overlay.mjs prototype/solidcraft
cargo build --manifest-path prototype/solidcraft/Cargo.toml --release -p solidcraft -p solidcraft-cli
cargo test --manifest-path prototype/solidcraft/Cargo.toml --workspace --locked
cargo run --manifest-path prototype/solidcraft/Cargo.toml --release -p solidcraft -- --control 47831
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
