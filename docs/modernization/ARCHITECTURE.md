# DemonX Forge modernization: architecture assessment

**Assessment date:** 2026-10-22
**Forge baseline:** v0.27.0, `codex/fusion-parity` in this checkout
**Reference:** local Solidcraft `main` checkout, read-only. The separately named `DemonX-Forge` checkout was also checked read-only and is on `main`; all work stays in this writable checkout.

## Recommendation

Keep Forge's React + TypeScript + Three.js interface and its Node service. Keep `server/src/engine/Engine.ts` as the only modeling boundary and its Solidcraft CLI/MCP process as the current implementation. Do not replace the interface or move Forge's product behavior into a fork of the reference application. Evolve the adapter into a versioned, capability-aware boundary, and upgrade its pinned engine only after Forge's command, geometry, persistence, and MCP regression corpus passes against that engine.

The existing process boundary is valuable: it keeps the frontend independent of kernel command names, keeps the server's local-only and path restrictions in charge, and allows the reference engine to be upgraded or replaced. The Solidcraft tree offers a much larger set of mature command implementations than Forge exposes today, so investigate and adopt capabilities through this boundary where compatible. Port or reimplement product-facing orchestration in Forge; do not copy reference UI, icons, assets, or protected material. Keep attribution and third-party license notices with any adapted code.

This recommendation preserves existing application work. It does not require owner approval under the request's major-replacement gate. Any future proposal that removes the adapter boundary, replaces the frontend, changes Forge's document format incompatibly, or discards existing user workflows needs a separate migration and rollback proposal before implementation.

## Current systems

| Area | Forge at baseline | Solidcraft reference | Consequence |
|---|---|---|---|
| UI | React, TypeScript, Three.js (`web/`); browser UI and its interaction state live in Forge | Rust desktop app (`apps/solidcraft`, egui/wgpu), separate browser/WASM app (`apps/solidcraft-web`) | Solidcraft's application UI is not a drop-in React component library. Forge owns the brand and workflow. |
| Service | Node server (`server/`) with loopback/Host/Origin checks, input validation and file handling | Rust CLI/app and JSON command engine | Keep Forge's service security and compatibility contract; do not expose engine file commands indiscriminately. |
| Modeling | `server/src/engine/Engine.ts` interface; `server/src/engine/solidcraft.ts` talks stdio MCP; engine pin in `engine/SOLIDCRAFT_REF` | Rust workspace; engine command registry in `crates/engine/src/cmd/`; kernel behind `crates/kernel/` | Current boundary is the least risky reuse path. The pin is v0.19.0 while the local reference has since advanced substantially. |
| Geometry | Engine produces tessellated bodies/topology; Forge's `Snapshot` maps faces, edges, sketches, profiles, history and parameters | Solidcraft geometry kernel uses `truck` crates, scoped to `crates/kernel`; its own blend implementations and patched vendor crates are attributed | Prefer kernel-owned geometry operations over duplicate mesh-based modeling. Treat topology identity and tolerance as explicit integration contracts. |
| Persistence | `.forge` ZIP with Forge metadata and engine-native `design.solidcraft`; strict reader and engine save/open | Native `.solidcraft` design/history and format import/export in `crates/io` | Keep `.forge` stable. Engine format migration must include explicit compatibility tests and a rollback path. |
| Commands | Forge HTTP JSON command routes and MCP bridge; command allowlist; browser tools and AI tools share engine commands | `CommandSpec` registry powers UI, CLI/scripts, MCP and control channel | Preserve existing Forge tool names/schemas. Add typed command metadata and structured errors incrementally. |
| MCP | `server/src/mcp.ts` exposes Forge-namespaced design, command, query, measure, screenshot, parameter, undo and redo tools | `crates/mcp` / CLI expose a broader MCP interface including topology, diagnostics, file tools, joints and more | Forge must not simply proxy the full upstream tool set: retain its own policy and established client contract. |

## Build and test runtime

Forge's web build and tests use Vite 8.3.5 and Vitest 5.0.5, with the React 6 plugin. The root package declares Node 20.19.0 or newer, matching Vite 8's documented runtime floor; CI already uses Node 22. This updates development tooling only and leaves the Forge service and engine process architecture unchanged. Windows validation passed for the current toolchain, while Linux CI and package validation remain required.

## Options considered

### 1. Expand the current adapter and selectively use engine capabilities — recommended

**Advantages:** preserves the working UI, `.forge` wrapper, localhost server, security controls, release tooling and MCP contract; gives one modeling implementation; keeps engine swaps possible; avoids duplicating B-rep algorithms. Solidcraft's CLI has a real command registry, parameterized features, timeline, import/export, measurement, topology and tests that can be evaluated as capabilities rather than product UI.

**Costs and risks:** the engine pin is old relative to the reference checkout; command schemas and behavior can change; stdio JSON/MCP transport adds serialization and process-management overhead; the frontend currently has product-specific assumptions about features and topology; snapshots export/display tessellation and query topology separately; large geometry transfers and repeated inspection may affect responsiveness. Engine upgrades need contract tests and measured representative designs.

**Migration:** inventory current Forge dependencies on command IDs and response shapes; add adapter capability/version reporting; build golden end-to-end command scenarios; upgrade the pin on a controlled branch; adapt response mapping only in `solidcraft.ts`; keep old engine binary/pin and package artifact as rollback; switch only after Windows/Linux and MCP acceptance.

### 2. Link Rust engine crates directly into Forge

**Advantages:** could avoid an extra process and MCP protocol overhead, and offer a tighter typed interface.

**Costs and risks:** Forge is TypeScript and Solidcraft is Rust; a direct link requires a stable C ABI, N-API addon, WASM boundary, or rewriting the service. This couples Forge releases to kernel internals, increases platform packaging and crash/debug complexity, risks copying far more reference internals than needed, and could bypass current isolation safeguards. No evidence from the inspected code justifies this migration now.

**Migration if later justified:** benchmark stdio and geometry-transfer cost first; define an adapter-neutral schema; build the Rust bridge as an optional backend; run identical replay and MCP suites against both; retain CLI backend until native parity and package rollback are proven.

### 3. Replace Forge frontend with Solidcraft desktop or web UI

**Advantages:** gains the reference's broader native workflows, control surface and interaction implementations faster.

**Costs and risks:** drops the existing Forge interface, brand, browser deployment, UI conventions and established app workflows; requires a product rewrite and does not preserve the requested identity. The web app is a Solidcraft application, not a React widget library. Rejected for this modernization.

### 4. Replace the modeling engine (for example OpenCascade WASM)

**Advantages:** potentially a mature kernel and browser-local execution.

**Costs and risks:** a new geometry backend would require command, timeline, persistence, topology, selection, import/export and MCP parity work; WASM packaging/performance and licensing would need verification. Solidcraft's current kernel is `truck`, not OpenCascade, and its CLI is already used by Forge. No evidence currently outweighs migration cost. Keep alternative kernels as a documented contingency, not the next implementation step.

## Reference findings and evidence limits

- Solidcraft root has both MIT and Apache-2.0 license texts; Cargo manifests identify workspace packages and dependencies. `truck` is the geometry kernel dependency and is scoped to `crates/kernel`; the workspace documents Apache-2.0-licensed kernel use and its own blend work. Review `ATTRIBUTION.md`, vendored notices, and the exact source file before any code reuse.
- The reference has a distinct Rust desktop app and Rust/WASM web app. Its UI code is tightly coupled to egui/eframe/wgpu, not React. Web build configuration is in `apps/solidcraft-web/Cargo.toml` and `Trunk.toml`; artifact size and startup performance have not been benchmarked in this assessment.
- Solidcraft's command model is `CommandSpec` in `crates/engine/src/cmd/*`. Its CLI/MCP docs describe command discovery, JSON execute/batch, design inspection, topology, measurement, parameters, undo/redo, screenshot, file operations, recovery, and assemblies. Forge currently exposes a deliberately narrower, namespaced MCP contract.
- The Solidcraft checkout has no tracked `docs/architecture.md` or `plan/architecture.md` file (its `plan/` is ignored and absent here). Architecture was assessed from `Cargo.toml`, `crates/engine/src/cmd/mod.rs`, kernel and UI crate layout, and `docs/building.md`, `docs/web-runtime.md`, and `docs/native-brep.md` instead.
- Forge's pinned engine is documented as Solidcraft v0.19.0 in `engine/SOLIDCRAFT_REF`; the local reference tree is newer. The exact CLI binary from that pin is not available as a part of this checkout by default, and this assessment did not build the newer Rust tree or run comparative sample models. Therefore the reference's commands are reuse candidates, not verified Forge features.
- The two local repositories were inspected without changes. The named Forge checkout is `main`; this writable `DemonX-Forge-Codex` checkout is `codex/fusion-parity`, clean at assessment start, and points to the Forge upstream. No changes were made to the separate Forge or Solidcraft checkouts.

## Rollback and release gates

1. Preserve the starting branch/commit and record each engine pin and package artifact.
2. Implement adapters and tests before changing the engine pin.
3. For every pin upgrade, test `.forge` open/save/reopen, undo/redo, representative parametric rebuilds, geometry measures and exports, command errors, MCP schemas and current clients.
4. Package the old and candidate engine builds separately; do not overwrite the only known-good binary.
5. Revert the adapter/pin commit if any compatibility gate fails. Do not rewrite shared history or merge into `main` as part of this work.
