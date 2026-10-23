# Native release preparation status

**Branch:** `codex/fusion-parity`  
**Status:** Windows native build, persistent install acceptance, stable MCP launcher, and local staged-update/rollback scenarios passed. Public native updates and preview release remain blocked on release signing/provenance setup and Linux package validation.

## Stable MCP entry point

Windows packages contain a private Node runtime, native `forge-mcp.exe`, and `forge-mcp.cmd`. The stable launcher lives at the install root and resolves the current version's bridge through `current.txt`; it does not require Node on `PATH`, a version-specific client path, a configured port, or a copied token. The bridge discovers only per-user control token files, connects only to loopback, and authenticates with the session token. It retries discovery after stale sessions and rejects ambiguous multiple-instance discovery unless an explicit supported session choice is provided.

Recommended client configuration:

```json
{
  "mcpServers": {
    "forge": {
      "command": "C:\\DemonX-Forge-Native\\forge-mcp.exe"
    }
  }
}
```

The batch wrapper is available for clients that require a shell. Do not put control ports or authentication tokens in the MCP client config.

## Update architecture and security

The native updater lists Forge repository releases and accepts only the native `native-v*` tag channel; it does not resolve GitHub's generic `latest` release, which may be the old React app. It selects the highest valid native semantic version. The updater UI is disabled in managed packages that do not embed a configured minisign public key.

For enabled managed builds, native update metadata and package signatures are checked against the compile-time pinned minisign public key before download/use. The helper then checks the expected package SHA-256 again, rejects unsafe archive paths, links, excessive extraction, and incomplete or hash-mismatched manifest contents. It stages into a new immutable version directory, preserves `previous.txt`, atomically switches `current.txt`, starts the candidate, and checks its authenticated loopback control channel. Failed startup terminates the candidate and restores both pointers. User data and the stable root MCP launchers are outside the version directory and are not replaced. The application checks all open documents for dirty state before starting an update; the existing close flow also prompts if a document becomes dirty while an update is in progress. Automatic installation is not enabled.

No release signing key was available for this checkpoint. The tested package was built without a public update key, so it correctly suppresses public update checks and installation. Do not publish a native release or claim remotely verified update acceptance until the owner supplies the long-lived signing key/public key arrangement, a signed test release is verified through the in-app download path, and a dedicated native release workflow is exercised. Existing React Forge and upstream SolidCraft releases are not native update sources.

## Reproducible Windows package

`prototype/package-windows.ps1` builds the pinned SolidCraft engine and overlays Forge branding/bridge code. The build retains the pinned official Node 24.19.0 archive SHA-256:

`57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`

The archive was obtained from the local temporary build cache and verified against that checksum; checksum verification was not relaxed. The isolated source checkout used SolidCraft commit `75261cd79733fe47cf898b54f865e6bfaffa1129`. The successful package was produced under `%TEMP%\DemonXForgeBuild\source-75261cd79733fe47cf898b54f865e6bfaffa1129\prototype\dist-windows\release-prep-20261023-9\0.19.0-forge-1161ec567bc9-engine-75261cd79733`. It is now installed at `C:\DemonX-Forge-Native`. `current.txt` selects `0.19.0-forge-1161ec567bc9-engine-75261cd79733`; `previous.txt` still selects the present rollback release `0.19.0-forge-437c4651a50b-engine-75261cd79733`. The root contains stable `forge-mcp.exe`, `forge-mcp.cmd`, and bundled `runtime\node.exe`.

## Verification record — 2026-10-23

### Native app and MCP

- Fresh MSVC release build and package succeeded, including `solidcraft.exe`, CLI tools, bundled Node 24.19.0, `forge-mcp.exe`, and `.cmd` wrapper.
- Full acceptance ran against the persistent version's `solidcraft.exe` and root-level `C:\\DemonX-Forge-Native\\forge-mcp.exe`, using disposable app-data folders so no user documents or settings were opened. Three independent bodies and eight history features passed sketch/extrude/fillet and history edit, undo/redo, `.dxforge` save/reopen, individual and all-body STL, and three separate 3MF objects.
- The installed launcher exposed all nine tools (`forge_get_design`, `forge_list_commands`, `forge_run_commands`, `forge_query`, `forge_measure`, `forge_screenshot`, `forge_set_parameter`, `forge_undo`, `forge_redo`) and read the active design.
- MCP acceptance covered authentication failure, invalid command/error reporting, save outside scoped `allow_paths` refusal, restart discovery, multiple-instance ambiguity refusal/recovery, and screenshots.

### Update scenarios

- A locally generated update archive was installed into a unique temporary version directory. The helper verified the supplied expected SHA-256, manifest contents and package file set; `current.txt` switched to the new immutable version and `previous.txt` retained the original.
- After that update, the stable MCP launcher still exposed all nine tools. Hashes for root `forge-mcp.exe` and bundled Node remained identical; scripts/settings sentinel data outside version folders remained present.
- A wrong archive digest was refused without changing pointers.
- A test candidate with valid archive/hash metadata but an intentionally unhealthy process failed the authenticated startup health check; the helper restored `current.txt` and `previous.txt`, retained the failed version for diagnosis, and reported rollback. This is local helper-level acceptance, not a signed remote in-app release test.
- Focused native channel tests passed: React-only release lists are rejected and the highest valid `native-v*` release is selected (2 passed, 0 failed; 1,866 filtered out). The test target emitted one existing upstream `brand_mark` dead-code warning.

### Header and responsive checks

The acceptance harness captured dark/light themes at 1280×800, a narrow 720×560 layout, Forge UI scale at 125%, and maximized/restored layouts. Window controls remained accessible. At 720×560 the tab strip compresses and truncates secondary tab labels. These checks exercised app-level scale/layout behavior; Windows OS-level DPI was not changed or independently verified. This run's screenshots are under `%TEMP%\demonx-forge-native-acceptance-VlORkP`.

### Tooling checks

- PowerShell parser accepted all prototype `.ps1` scripts. An installer upgrade test also verified atomic stable-launcher replacement, preservation of the old launcher as `.previous`, and retention of the old version in `previous.txt`.
- `node --check` passed for overlay, smoke harness, acceptance harness, and verifier JavaScript.
- `git diff --check` passed (Git emits environment-specific warnings about an unreadable global ignore file and LF-to-CRLF normalization).

## Remaining blockers

- Provide and protect a stable minisign release key; configure its public verification key in release builds.
- Create a native-only GitHub release/package workflow and signed test release; verify the complete updater path from UI release discovery through download, staged install, startup health, rollback, and MCP reconnection.
- Verify dirty-document update deferral in the live UI, including a document becoming dirty during download. The guard is implemented across open documents and the close flow, but not interactively exercised in this checkpoint.
- Verify actual Windows system DPI scaling, beyond the app's 125% UI scale control.
- Build and test a Linux native package/update path. Linux remains unverified and blocks a native preview release.

The previous installed working release remains available as the user's rollback version. No merge to `main` was performed.
