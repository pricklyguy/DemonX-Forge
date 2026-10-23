# Native scripting and large-model acceptance results

**Run date:** 2026-10-23  
**Platform:** Windows build 22631, x64 MSVC; 32 logical processors and a 31.8 GiB .NET GC memory budget. CPU model was not available to the test process.  
**Forge source:** `bcbe72dcbc900fbf97baa6227582e1c30cd64113` (`codex/fusion-parity`)  
**SolidCraft engine:** `75261cd79733fe47cf898b54f865e6bfaffa1129`  
**Installed release:** `0.19.0-forge-bcbe72dcbc90-engine-75261cd79733`  
**Rollback release:** `0.19.0-forge-b620664fe8c7-engine-75261cd79733`

## Results

| Check | Result |
|---|---|
| Native script runner UI, validation, real fillet-failure rollback, Stop rollback, one-step undo/redo | 4 Rust tests passed |
| Forge server test suite with installed CLI engine | 160 passed, 4 skipped; 24 files passed, 1 platform-specific file skipped |
| Python SDK unit tests | 3 passed |
| Installed native/MCP acceptance | Passed: all nine tools, authentication, scoped filesystem refusal, unsafe/unknown command refusal, sketch/extrude/fillet/history, save/reopen, STL/3MF, undo/redo, screenshot |
| Installed Python SDK transaction | Passed: failed fillet restored the prior model; a successful two-body script was removed by one undo and restored by one redo |
| Isolated large-model fixture | Passed: 50 independently named test bodies and 60 history features; the screenshot shows 55 total bodies because the three-body MCP fixture and two SDK bodies remain in the same test document |
| Save/reopen after a parametric edit | Passed: body names, edited volume, and timeline history were retained |
| Multi-body export | Passed: 3MF contains 50 separate model objects |

The large model was generated in a fresh temporary acceptance profile. The user's 57-body project and the persistent application profile were not opened or changed.

## Large-model timings

These values are single-run wall-clock measurements from the installed app and its authenticated local MCP channel. They are baselines, not performance budgets.

| Operation | Time |
|---|---:|
| Generate 50-body fixture | 9,432 ms |
| MCP model inspection | 2,732 ms |
| Scroll browser to final body | 729 ms |
| Select browser row | 751 ms |
| Rename body | 373 ms |
| Hide and show body | 1,554 ms |
| Isolate body | 774 ms |
| Select dense-model face | 364 ms |
| Select dense-model edge | 373 ms |
| Create sketch on a model face in the representative plate workflow | 781 ms |
| Redefine an early feature and rebuild the populated model | 3,154 ms |
| Standard front-view camera navigation | 237 ms |
| Save and reopen large model | 878 ms |
| Export one body to STL | 194 ms |
| Export 50 bodies to separated 3MF objects | 23 ms |

The app reported a 1 ms frame and 0 ms geometry-build time at the final sample. These are single
`ui.inspect` readings, not a sustained frame-rate measurement. The camera test changed to the
standard Front view; it did not measure physical mouse orbit or pan. Linux packaging and runtime
remain unverified in this Windows-only run.

## Screenshots

- [Installed three-body MCP workflow](evidence/2026-10-23/installed-three-body.png)
- [Installed 50-body browser and viewport](evidence/2026-10-23/installed-50-body.png)

## Commands and environment

- `cargo test --release -p solidcraft-ui-egui --lib forge_scripts::tests::` — 4 passed.
- `npm run typecheck -w server` — passed.
- `FORGE_ENGINE=<installed solidcraft-cli.exe> npm test -w server` — 160 passed, 4 skipped.
- `PYTHONPATH=prototype/python-sdk python -m unittest discover -s prototype/python-sdk/tests -v` — 3 passed.
- `FORGE_TEST_PYTHON_SDK=1 FORGE_TEST_LARGE_MODEL=1 node prototype/native-acceptance.mjs <installed solidcraft.exe> C:\DemonX-Forge-Native\forge-mcp-native.mjs` — passed against the installed release with the bundled Python runtime selected as `FORGE_PYTHON`.

The first broad server-suite attempt passed the GUI executable instead of the CLI executable and
timed out its engine-start hooks. Re-running with the packaged `solidcraft-cli.exe` passed. One
initial combined acceptance attempt left the completed SDK progress window open, covering the
browser during its scroll test; the harness now dismisses that modal with Escape before testing
large-model interactions. The native app itself passed the combined run.
