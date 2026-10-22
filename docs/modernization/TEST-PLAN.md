# Modernization test plan

## Test principles

- A visible control or command name is not proof of function.
- Verify actual geometry changes using analytic measures, topology checks and independent file readers where available. Set explicit tolerances and account for tessellation approximation.
- Test a complete workflow through both GUI and MCP for operations that Forge exposes in both places.
- Preserve the existing unit, service, browser and packaging checks. Add regression tests for requested work; report a skipped engine/platform check as skipped.
- Do not write acceptance claims for operating systems or devices that were not actually used.

## Unit and service tests

- Sketch geometry and constraints: construction flags, closed loops, profile area/centroid, overlapping regions, dimensional edits, inference/snap priority, units and finite input validation.
- Geometry mapping: stable face/edge identifiers, face normals/points, topology selection and hit-testing; tolerances for approximated tessellation data.
- History: feature creation/edit/suppress/delete/roll-to, dependencies, parameter propagation, undo grouping, failed transaction rollback and redo invalidation.
- Files: `.forge` metadata/version validation, malformed ZIP/content, size bounds, safe names, import-extension mismatch and atomic load (a bad open leaves the existing design intact).
- Server boundary: loopback binding; Host/Origin policy; request size bounds; allowlisted modeling/query commands; no MCP file-system access; actionable status/error mapping.
- MCP adapter: initialize/capability negotiation, tools/list, every established tool name and schema, valid calls, invalid args, engine timeout/exit, and JSON-RPC errors.

## Geometry integration scenarios

1. **Drilled plate:** create XY sketch, dimension a rectangular outline and hole(s), extrude, create hole/cut, fillet selected edges, inspect measures/topology, export STEP and STL.
2. **Face-attached bracket:** create/extrude base, create sketch on a selected non-origin face, draw wall profile, extrude/join, fillet/chamfer, measure selected faces/edges.
3. **Parametric edit:** edit an early sketch dimension/parameter; assert dependent features rebuild and changed volume/bounds match expected values; undo/redo and save/reopen.
4. **Multi-body component:** create separated bodies, combine or transform, import/export a multi-body STEP, ensure names/placement/history are retained or documented.
5. **Failure/cancel:** invalid fillet, too-deep hole, invalid profile, failed rebuild; verify error reason, no partial geometry, dialog remains actionable, one-step undo behavior.
6. **Mesh handling:** import STL/OBJ/3MF, inspect bounds, test supported Mesh-to-Solid geometry and a refused sculpted sample; verify refusal leaves design unchanged.

For each scenario verify the model before and after save/reopen, and after undo/redo. Use the real pinned engine binary. A fake adapter is useful for isolated route tests but cannot satisfy geometry acceptance.

## GUI and viewport checks

- Playwright tests in `e2e/` for drawing, typing, dimensions, snaps, selection, viewport navigation, commands, dialogs, timeline, files and menus.
- Verify at narrow, typical and wide viewport sizes; no unreachable ribbon commands, clipped dialogs, focus/shortcut conflicts or invisible selection feedback.
- Sketch acceptance includes click-place and press-drag-release, tool inference markers, left-to-right/right-to-left selection, overlapping profiles and editing a constrained dimension.
- Model acceptance includes faces, edges, bodies, face-attached sketches, preselection before command start, live preview during typing/drag and cancel without residual geometry.
- Test dark/light palette and accessible focus/contrast without altering DemonX identity.

## MCP regression workflow

Run against the packaged Forge server/engine process and preserve existing `forge_*` tool names:

1. Initialize and list tools; verify names, schemas and protocol errors for malformed requests.
2. Read an empty and populated design; confirm summary/full detail distinction.
3. Discover commands and execute a batch creating a dimensioned plate and hole.
4. Query timeline definition/dependencies; change a user parameter and inspect updated measures.
5. Measure body and selected items; capture screenshot and validate returned image data.
6. Undo and redo; confirm identical expected history state and geometry.
7. Attempt disallowed command, file operation, unsafe path, excessive batch and malformed input; verify refusal and no design mutation.
8. Save/reopen through supported Forge GUI routes (MCP cannot gain file tools by proxy); confirm history and measure.
9. Simulate engine failure/unavailable response; ensure actionable errors and no success-shaped empty result.

`e2e/mcp-protocol.mjs` is the headless packaged integration check for initialize, tool contract, real drilled geometry, measurement, full inspection, discovery, parameter changes, screenshot bytes, undo/redo, unsafe path command refusal and unchanged geometry. The Linux package workflow invokes it against the packaged Node and engine. The existing `e2e/mcp.mjs` additionally verifies the browser reflects MCP-authored geometry.

## Cross-platform and packaging

### Linux automation

- CI: typecheck, unit/service tests, production build, engine compile/smoke test, full e2e against real engine, package smoke test, MCP acceptance.
- Verify launcher, port binding, desktop entry/start-at-login and package path rules in a clean user environment.

### Windows acceptance

- Install/unzip package on a clean supported Windows machine; launch via shortcut and direct batch file; verify local browser opens and server listens only on loopback.
- Run same modeling/export/MCP acceptance subset; inspect user-visible file dialogs and path validation.
- Exercise update with valid and invalid package/checksum/startup; verify rollback to the prior install and unsaved-design refusal.
- Record Windows build/package artifact and exact version. Do not substitute CI compilation for an actual Windows install test.

## Precision and performance measurements

- Analytic dimensions and volumes for boxes, cylinders, plates, holes and simple blends.
- STEP re-import topology and volume check; STL watertightness and documented tessellation tolerance; DXF units/closed loops/section orientation.
- Record model complexity (features, faces, edges, triangles), command latency, snapshot/export size, and viewport interaction response. Establish baseline before optimization.

## Completion record

For each roadmap phase record commit, environment, engine version, exact commands run, pass/fail/skip result, artifacts, and known limitations. A phase is complete only when its stated acceptance criteria pass; owner test feedback is reported separately from automated evidence.

## Assessment baseline run (2026-10-22)

Environment: Windows sandbox, Node v24.19.0 / npm 11.17.0. The initial dependency restore used `npm install --ignore-scripts --package-lock=false`; then `npm ci --ignore-scripts` completed from the baseline lockfile and the baseline test/typecheck/build run used that install.

- `npm run typecheck`: passed for server and web.
- `npm run build`: passed. Vite reports the current main JS bundle is 872.22 kB minified (242.44 kB gzip), above its 500 kB advisory threshold.
- `npm test -w web`: passed, 68 tests.
- `npm test -w server`: passed, 111 tests; 51 tests skipped. Skips include real-engine cases because `FORGE_ENGINE` and `data/engine/solidcraft-cli(.exe)` are unavailable, and Linux-only launcher tests on Windows.
- `server/test/updateWindows.test.ts` and `server/test/launcher.test.ts`: passed after removing the Unix-only external `zip` dependency from fixtures and making the path assertion platform-neutral (37 tests).
- `npm audit --json` reported six development-tool dependency advisories (3 moderate, 1 high, 2 critical); `npm audit --omit=dev --json` reported zero production dependency advisories at baseline.
- `git diff --check`: passed at the time of the baseline check.
- Not run: real-engine tests, Playwright browser workflows including `e2e/mcp.mjs`, actual MCP client setup, Linux package execution, or Windows packaged application acceptance.

## Toolchain maintenance checkpoint (2026-10-22)

Updated web build/test tooling from Vite 5 / Vitest 2 to Vite 8.3.5 / Vitest 5.0.5, updated `@vitejs/plugin-react` to 6.1.2, and raised the package's Node minimum to 22.12.0. This satisfies both tools' runtime requirements; no application runtime or engine dependencies changed. The `package-lock.json` was regenerated.

- `npm install --ignore-scripts`: passed; 37 packages added, 77 removed; npm reported zero vulnerabilities.
- `npm audit --json`: passed, zero vulnerabilities (12 production, 117 development packages in audit metadata).
- `npm test`: passed, 111 server tests and 68 web tests; 51 server tests remain skipped for unavailable real-engine cases and Linux-only tests.
- `npm run typecheck`: passed for server and web.
- `npm run build`: passed with Vite 8.3.5. The main JS bundle is 873.78 kB minified (239.23 kB gzip), above the 500 kB advisory threshold.
- MCP command-boundary regression coverage now includes path-taking commands outside `file.*`: parameter import/export, timeline script export, and linked component file reads.
- The real-engine MCP scripts are not counted as passed in this assessment; `e2e/mcp-protocol.mjs` received a syntax check only, and `e2e/mcp.mjs` was not run.
- Not run: real-engine, browser E2E, or packaged app workflows; the engine binary remains unavailable.

## Real-engine Phase 1 acceptance (2026-10-22)

**Host:** Windows 11, Node v24.19.0, npm 11.17.0. **Engine:** `solidcraft-cli 0.19.0`, matching `engine/SOLIDCRAFT_REF` commit `33fdcdb3a08b2a8d2b52f2eb8bf990dfee6c21f7`. Rust was not installed locally, so the engine was obtained from the official Forge v0.27.0 Windows release. The release tag pins the same SolidCraft commit. Archive SHA-256 `5ddc3fa66d15fdd2fbc7c6c12c0c2742b164a0b6361e9c071a24b36f871fae48` matched both the published checksum file and GitHub asset digest; the executable reported version 0.19.0. The archive and executable were kept under the OS temp directory, and `FORGE_ENGINE` was set explicitly. Neither source checkout was modified.

- `npm test -w server -- --reporter=verbose` with `FORGE_ENGINE`: all engine-dependent tests ran. The only skips were four Linux launcher tests on Windows. The suite included real engine sketch/extrude, fillet/chamfer, history edit, save/open/export, mesh conversion, and command error/rollback coverage.
- `npm test -w web`: passed, 68 tests.
- `npm run typecheck`: passed for server and web.
- `npm run build`: passed with Vite 8.3.5. The main JS bundle is 873.78 kB minified (239.23 kB gzip), above the advisory threshold.
- All 32 browser E2E scripts documented in `e2e/README.md` were validated against the live pinned engine. The initial full run passed all workflows except `drawing.mjs`; it exposed a live slot-width field overlapping the pointer. The field was moved clear of the slot outline. Drawing, patterns, revolve, and the extended sketch-tool checks passed individually after that focused fix. A later sequential run under software-rendering load had three transient click misses; the same three passed when rerun individually from fresh designs. `menu.mjs` is a helper module, not a test. Screenshot/download artifacts were written under temp.
- `e2e/mcp.mjs`: passed with a real MCP child process and browser open. It verified the established nine tools, live UI sync, full design inspection, command discovery, analytic measurement, PNG screenshot, fillet, undo/redo, GUI Save/New/Open, and geometry plus feature-history preservation across reopen. Unsafe file access, unknown tools and a refused model command were checked.
- `e2e/mcp-protocol.mjs`: passed against the live server and real engine from a locally bundled MCP entrypoint. It checked the protocol/tool contract, solid and hole geometry, analytic volume, parameters, screenshot bytes, undo/redo, six path-capable command refusals, and unchanged geometry after refusal.
- `server/test/acceptance.test.ts`: added a real-engine parametric plate workflow: sketch/extrude to analytic dimensions and volume, sketch dimension edit/rebuild, real-edge fillet, undo/redo, and save/reopen with geometry/history checks. Its initial exact-bound comparison caught harmless floating point roundoff (`50` vs `49.999999999975344`); it now uses an explicit 1e-6 bound tolerance.
- Windows limitation: no packaged Forge installation/update run was performed. Linux package compilation/execution is available through `.github/workflows/package.yml` and builds the pinned engine, but that GitHub workflow was not run during this local acceptance. The four Linux-only launcher tests therefore remain unverified locally.

Phase 1 MCP/service acceptance passes on this Windows host. This does not complete later roadmap phases or Linux/packaged-application validation. Phase 2 is in progress; the new parametric plate is its first independently checked real-engine model.
