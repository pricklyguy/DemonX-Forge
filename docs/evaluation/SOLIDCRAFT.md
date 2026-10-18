# SolidCraft evaluation (part 1: read from the source; nothing run yet)

Date: 2026-10-18. Repository read: `tangency-labs/solidcraft`, `main` at `f498d23` (a shallow clone of 50 commits, taken today).
Everything below was read from the code, `Cargo.toml`, the LICENSE/NOTICE files and its own docs. **Nothing was built or run yet**
(the build was blocked by the session's permission check; see "What is still to do"). Claims copied from SolidCraft's own docs are
marked *(their claim)* and are not verified by us.

## Verified from the repository

| Question | Answer |
|---|---|
| Licence | `MIT OR Apache-2.0`, our choice (`LICENSE-MIT`, `LICENSE-APACHE`, `Cargo.toml` `license`). Compatible with GPL-3.0-or-later; we would take it under MIT or Apache and keep their notices. |
| Third-party licences | `NOTICE` and `THIRD-PARTY-LICENSES.txt`. The kernel crates (truck) are Apache-2.0 (RICOS). Bundled fonts are SIL OFL 1.1. FreeCAD/Rhino import goes through the Apache-2.0 `cadmpeg` crates, native builds only. `deny.toml` bans unknown registries and git sources and is run in CI. |
| Geometry kernel | Not OpenCascade. The **truck** B-rep crates (`truck-modeling`, `truck-shapeops`, `truck-meshalgo`, `truck-stepio`, `truck-topology`). `crates/kernel` is the only crate allowed to call truck, and every call goes through a guard. truck-shapeops 0.4.0 is **vendored with patches** (`vendor/README.md`, a long list of boolean fixes), and truck has no fillet, so **fillets, chamfers, shell, blends are SolidCraft's own code** (CONTRIBUTING.md). The booleans are therefore a patched fork we would have to track. |
| Size of the code | About 380,000 lines (counted with wc) of Rust in `crates/` (kernel 85k, UI 98k, engine 88k, doc 44k, sketch 22k, geometry 14k). One person cannot take this over; we would be a user of it. |
| Activity | Last commit today; 50 commits since 1 September; nightly tags (`v0.15.0-nightly.20261018.*`); version 0.15.0. Very active. The workspace `repository` field and the README still point at `bherbruck/solidcraft`, while the code lives under `tangency-labs`: the project has moved owner, which matters for who we depend on. I could not read its issues (the repo is outside this session's GitHub scope), so the "730 open issues" in the earlier note is still unverified. |
| Web build | `apps/solidcraft-web`, built with **Trunk** to `wasm32-unknown-unknown` (egui + wgpu, WebGPU or WebGL2). `cargo xtask wasm` type-checks all library crates for wasm in CI, so the engine is meant to run in the browser. **The wasm size is not stated anywhere in the repo**, so it must be measured. |
| Library or app? | **App only today.** The browser build is a whole egui application. There is no `wasm-bindgen` API for a React app to call; the only browser interface is `window.solidcraft.execute/request/commands/inspect` inside that app's own page (`docs/browser-api.md`). The Rust crates (`engine`, `kernel`, `io`) are separate and layered, so a thin wasm wrapper of our own around `engine` is possible, but it does not exist and is our work. The viewport and the UI are egui, not React, so they would not take our DemonX look or components. |
| Command / JSON interface | Strong. A script is `{"commands":[{"command":"sketch.create","params":{...}}]}`; `solidcraft-cli commands` lists the registry; `solidcraft-cli mcp` is a stdio MCP server (`list_commands`, `execute`, `batch` with rollback, `inspect_design`, `measure`, `body_topology`, `set_parameter`, `screenshot`, `export` to step/3mf/stl/stla/obj/urdf, `undo`, `redo`, `open`, `save`); the desktop app has a JSON-lines control port. Same idea as `design/src/core/commands.ts`. Parameters are unit-aware expressions (`"width"`, `"2 * width + 5 mm"`). `examples/bracket.json` is a plate-and-holes style part in exactly this form. |
| Export / import | STEP AP242 (names, colours, assemblies), IGES, 3MF, STL (binary and ASCII), OBJ, URDF; STEP/IGES import as a base feature; DXF of the current view; sheet-metal flat-pattern DXF. *(their claim)* |
| Accuracy checks | Its `docs/oracle.md` lists 83 reference parts, all passing: 62 against closed-form volume/area/centre, 21 against FreeCAD (OpenCASCADE) built from the same recipe, surface distance about 0.01 to 0.03 mm. *(their claim; the README text still says 75 of 76, so the docs are not kept in step.)* Its own README says "early but usable for simple parts". |
| CAM | None. `ROADMAP.md` lists Manufacture/CAM as a future workspace. Nothing to reuse for toolpaths; that stays with DemonX Design. |
| Performance | Their `docs/perf.md` reports 3 to 9 s to open a 21-feature part or a bicycle frame and about 2 GB for a 3,300-feature rover, on a 16-core box. For parts of our size this is a worry only if the booleans are slow; we have not measured it. |

## What this means so far (provisional, before any test)

- Licence is not a problem.
- It is a **finished application, not a kernel to embed.** Building DemonX CAD "on" it means either (a) using SolidCraft as it is, the DemonX CAD app being SolidCraft plus a bridge, or (b) writing our own wasm wrapper around its `engine` crate and our own React viewport. (b) is a large piece of Rust work in a codebase that changes daily.
- The part of it we most want is its **JSON command layer and MCP server**, which already match our "every action is a command" rule.
- The risk is the kernel: patched truck booleans plus home-made fillets, not OpenCascade.

## Part 2: built and tried (2026-10-18, Linux sandbox, 4 cores)

Built from source with Rust 1.97. `solidcraft-cli` (release): **6 min 43 s** the first time (the build crossed a 10-minute tool limit once and was resumed). The web app for `wasm32-unknown-unknown` (release): **9 min 27 s**.
Parts were made through the JSON interface (`solidcraft-cli run script.json --out x.step --out x.stl`), then **checked outside SolidCraft**: the STEP files were read by OpenCascade (cadquery-ocp from PyPI, in a throw-away venv), the STL files were checked for watertightness and volume by a small script, and volumes were compared with hand calculations. Scripts and outputs are not committed; they live in the session scratchpad.

| Part (script) | Result | Check |
|---|---|---|
| Plate 100x60x12, four d6 holes, 40x30x6 pocket | Works. 15 faces. | Volume 63443.06 (their mesh) vs 63442.83 hand calculation; the STEP read by OpenCascade gives 63442.832. Valid solid. |
| Bracket with inner and outer fillets and two base holes | Works. | Their volume 39010.683, hand calculation 39010.620, OpenCascade on the STEP 39010.620. STL watertight (0 open edges), STL volume 39010.85. |
| Plate, rounded-corner pocket, fillet along the pocket floor | Works. | Hand calculation (Pappus) 60373.315; OpenCascade on the STEP 60373.315 (exact); their own mesh figure 60373.46. |
| Rounded box, shelled open at the top, 2 mm walls | Works. | 24049.133 vs 24049.133 (STEP). |
| Counterbored holes (`type: counterbore`) | Works. | 23136.06 vs 23136.06 (STEP). |
| Plate, four holes, fillet round each hole top (r1) then the outer top edges (r2) | Works, 3 s for the script. | Same part built in OpenCascade: 70353.82; SolidCraft STEP read back 70353.82. |
| Two cylinders joined as a tee | Works. | OpenCascade 50544.74, SolidCraft 50538.88: **5.9 mm3 (0.012 %) apart**, probably the approximated intersection curve. |
| Same tee, fillet r3 along the junction | Works, 5 s. | OpenCascade 50605.56, SolidCraft 50603.34; the exported STEP read by OpenCascade 50605.32. |
| Fillet radius 9 on a 5 mm slab | Refused with a clear message ("the largest radius that fits is 5 mm"), nothing written. | Good behaviour. |

All the STEP files were valid solids when OpenCascade read them back, and the exported STEP volumes agree with hand calculation to 0.01 mm3 or better. STEP is the format to use between the programs; the STL volumes are a few hundredths of a percent off by tessellation.

**Things that went wrong or need care**

- **Unknown parameters are silently ignored.** I typed `counterbore_diameter` instead of `cb_diameter` and got a plain hole with no warning. A script or AI tool needs the exact names (`solidcraft-cli commands` lists them) and a check of the result.
- **The shipped `examples/bracket.json` cuts nothing.** Its hole sketch lies on the wrong side (positive Y, while the bracket extends to negative Y), so the "holes" miss the body (volume 22988 = no holes). Not a kernel bug, but it shows that the sign conventions (XZ sketch maps sketch y to minus z, extrusion direction) are easy to get wrong and need checking by measurement.
- **Slow for what it is:** 3 to 5 s to rebuild a script with 10 to 13 steps on 4 cores. Fine for a part, not for dragging a dimension on a big model. Their own `perf.md` shows many seconds for large models.
- **Size.** The CLI binary is 384 MB (debug line tables included). The web build's raw `.wasm` is 277 MB with debug sections, **54 MB without them, about 15 MB gzipped**, before `wasm-opt` and `wasm-bindgen`, which were not run (trunk and wasm-bindgen are not installed here). The shipped site will be smaller than that, but it is a tens-of-megabytes download, not a small library.
- **Not tried:** the desktop GUI and the browser app (no display or `trunk` here), the MCP server, assemblies, sheet metal, threads, lofts, sweeps, and anything with free-form surfaces. The kernel's own list of known limits (ROADMAP.md "Known limitations") is long; the cases above are ordinary prismatic parts, which is what a CNC or laser part usually is.

**Hand-off to DemonX Design (tried).** A projected sketch of the plate's top face, `sketch.export_dxf`, gave a DXF of 8 lines and 8 arcs. DemonX Design's own `importDxf` read it as six closed shapes (the outline, the pocket and four holes) with no warnings. So the 2.5D route works today: model in SolidCraft, export a face or section as DXF (`sketch.project`, `inspect.section`, `sketch.export_dxf`), open it in Design, and use profile / pocket / drill. What is missing is the automatic step: picking the pocket depths and hole depths from the 3D part (they are not in the DXF), which would be our own code reading the STEP or a SolidCraft JSON measurement.

## Compared with OpenCascade in WebAssembly (only as far as needed)

- OpenCascade is the more mature kernel. Here it read every SolidCraft STEP and agreed with it, and built the same parts, so it is not a better kernel for the parts tried; it is a safer one for hard parts (fillets across many faces, thin shells, sweeps).
- Compiled to WebAssembly it is also tens of megabytes (not measured here) and gives no application: no sketcher with constraints, no feature timeline, no parameters, no command layer, no UI. We would write all of that (roughly what SolidCraft's other 300,000 lines are). Chili3D is an open-source example of that route; I did not evaluate it beyond knowing it exists.
- OpenCascade in Python (cadquery-ocp) is handy as a **checker** for our own tests, as used above.

## Recommendation (provisional, for the owner to decide)

1. **Do not rebuild a modeller.** The kernel, sketcher and timeline in SolidCraft already produce correct parts for the kind of work DemonX does (plates, brackets, pockets, holes, fillets, enclosures).
2. **Do not embed it in our React app either.** It is an egui application with a very large wasm and no JavaScript library interface.
3. **Use it as a separate program** (desktop, or its web build) that the DemonX launcher starts, plus a thin **DemonX CAD bridge** of our own: DXF / STEP / STL in and out, the JSON command idea shared with Design, an MCP entry next to ours, and the CAM step (faces to Design's profile / pocket / drill, then G-code to DemonX CNC). That keeps our code small and keeps the 3D part replaceable if SolidCraft stops, or changes owner (it moved from `bherbruck` to `tangency-labs`), or its kernel proves too weak. OpenCascade stays as the fallback and as our test oracle.
4. Before committing: try the desktop or browser app by hand on a real part of the owner's, and watch the issues list for kernel bugs on the owner's kinds of parts (I could not read it from this session).
