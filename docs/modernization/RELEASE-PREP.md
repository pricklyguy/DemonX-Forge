# Native release preparation status

**Branch:** `codex/fusion-parity`  
**Status:** Windows MCP launcher and header work in progress; native update installation and release acceptance remain blocked.

## MCP launcher design

Windows packages include a private Node runtime, a small native `forge-mcp.exe` stdio launcher, and a shell-friendly `forge-mcp.cmd` wrapper. The launcher stays at `C:\DemonX-Forge-Native`; its JS entry point resolves `current.txt` at request startup and loads the current version's already-built Forge bridge. MCP clients therefore do not need a versioned path, Node on `PATH`, a port, or a copied authentication token. The bridge still enumerates only the per-user `%LOCALAPPDATA%\DemonX Forge\control\<port>.token` files, connects only to `127.0.0.1`, and authenticates with the random token. It skips stale listeners and clears its cached endpoint after connection loss, allowing the next distinct request to rediscover a restarted app.

The native `.exe` is the recommended stdio command because Windows MCP clients differ in their handling of batch files. The `.cmd` exists for shells and clients that support batch launch. Client configuration examples:

```json
{
  "mcpServers": {
    "forge": {
      "command": "C:\\DemonX-Forge-Native\\forge-mcp.exe"
    }
  }
}
```

If a client requires an explicit shell for batch files, configure `C:\Windows\System32\cmd.exe` with args `/d`, `/c`, and `C:\DemonX-Forge-Native\forge-mcp.cmd`. Keep authentication tokens and control ports out of client configuration.

## Update findings and safety boundary

The SolidCraft source contains a mature update dialog, but its installer swaps the running executable in place. Forge's installed layout is an immutable version directory selected by an atomic `current.txt` pointer, with application data stored outside those version folders. Reusing the SolidCraft replacement path could mutate the rollback version and bypass Forge's package manifest. Existing Forge GitHub releases are the old React application (latest observed: `v0.27.0`), so they are not valid update candidates for the native product.

The overlay points release metadata at the DemonX Forge repository and suppresses the inherited updater for the managed native installation. This prevents accidentally offering SolidCraft or React releases and prevents unsafe in-place replacement. The check also means the requested in-app installation experience is **not implemented yet**.

Before enabling native updates, the release pipeline must publish a distinct native channel (separate version/tag scheme from React and SolidCraft), package format and asset names, trusted digest or signing provenance, and release notes. The updater must validate repository, channel, version and archive digest; extract to a new immutable version folder; validate the package manifest; preserve the last-good pointer; refuse while a document is dirty (or while the application is running until a native dirty-state handshake exists); switch pointers atomically; and verify startup before finalizing. Failed startup must restore the old pointer. No automatic install should occur.

The current package's local manifest hashes protect the copy/install path from accidental corruption, but they are not a signature over a remotely downloaded release. Do not represent them as release provenance.

## Branding work

The Forge wordmark remains the existing Forge-owned asset. The application bar reservation increases from 34 to 42 logical points, with a modestly larger wordmark. Existing caption controls retain their full bar-height hit targets; the layout, menus, tabs and toolbar are unchanged. Tests and Windows visual checks are still required at normal and high DPI, restored/maximized sizes, narrow widths, and both themes before calling this accepted.

## Release blockers

- Build and install a package containing the new bundled runtime and stable launcher, then test all nine MCP tools and security refusals through `forge-mcp.exe` after app launch and restart.
- Finish native-only updater channel, signing/provenance, staged install, unsaved-state guard, startup health check, rollback, and GUI acceptance.
- Run the Windows title-bar matrix and installed-app modeling regression scenario.
- Linux native package and update behavior remain unverified; native distribution remains preview until that acceptance passes.

## Windows validation — 2026-10-23

- The pinned MSVC release build completed for `solidcraft.exe`, both CLI binaries, and the native `forge-mcp.exe` launcher (358,400 bytes). The isolated build checkout was at SolidCraft commit `75261cd79733fe47cf898b54f865e6bfaffa1129`.
- The native acceptance harness passed against that newly built executable: three named bodies, 8 history features, fillet/edit/undo/redo, `.dxforge` save/reopen, individual and all-body STL, separate 3MF objects (3), all nine MCP tools, screenshot, and rejection of a save outside the scoped `allow_paths` directory.
- A 1600×1000 dark-mode screenshot confirmed the larger Forge wordmark/header and preserved modeling layout. High DPI, maximize/restore, narrow-window, and light-mode visual checks were not run.
- The optional Python SDK test path was not enabled in this run (`pythonSdkVerified: false`); it passed in the earlier scripting acceptance documented in `SCRIPTING-TEST-RESULTS.md`.
- The complete package/install leg did not finish. Fetching pinned Node 24.19.0 from `nodejs.org` was denied by the shell network sandbox. The build recipe pins the official archive SHA-256 (`57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`) and fails closed when it cannot obtain and verify the runtime. The stable launcher has therefore not been installed or tested through Codex/Claude stdio clients in this checkpoint.
