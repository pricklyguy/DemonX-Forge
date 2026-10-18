# Spike: a DemonX-styled Three.js viewport on SolidCraft's engine (2026-10-18)

Question: can DemonX CAD have its own React/Three.js interface, with SolidCraft's engine doing the modelling underneath as a hidden process? Code: `docs/cad/spike/` (throw-away, about 200 lines; not the product).

## What it does

`server.mjs` starts `solidcraft-cli mcp --in part.json` (the engine, headless, MCP over stdio) and talks to it. `index.html` is a page in the DemonX colours (the same CSS variables as DemonX CNC, dark and light) with a Fusion-style layout: browser tree on the left, viewport in the middle, selection panel on the right, a parameter slider and an action button.

1. The engine exports the body as **3MF with face tags** (every triangle carries its B-rep face number) and `body_topology` gives each face's area, plane normal, a point on the face, and cylinder data. The server turns that into arrays for Three.js.
2. Clicking in the viewport raycasts the mesh, reads the face number from the triangle, and highlights that whole face and its row in the browser tree (and the other way round).
3. The slider calls the engine's `set_parameter` (width 60 to 100 mm); the model is rebuilt and the viewport redrawn.
4. "Drill Ø5 hole" sends `solid.hole` at the clicked 3D point on the clicked face; the part is rebuilt, and Undo works.

## Result (real Chromium, software rendering, Linux, 4 cores; `docs/cad/spike/check.mjs`)

| Step | Result |
|---|---|
| First mesh | 13 faces, 2090 triangles, engine export + topology 48 to 59 ms |
| Click a face | The right face (11) was picked and highlighted, area and normal shown correctly |
| Width 60 to 100 | Rebuilt and redrawn in about 430 ms from slider to pixels (engine part about 30 to 45 ms) |
| Drill a hole at a click | Rebuilt in about 400 ms; faces 13 to 15; the hole is visible |

So **the idea works**: the engine can sit behind our own interface, and face picking, parameter editing and click-to-command all run in well under a second on a small part. The DemonX look carries over unchanged because the page is ordinary HTML and CSS.

## What the spike does not prove

- **Speed on a big model.** The part has about 15 features. SolidCraft's own notes show multi-second rebuilds for large models; the first open of a script also took seconds in the earlier CLI runs (not timed here).
- **The mesh path is crude.** Every change writes a 3MF file and re-reads it as text. Fine for a spike; a product needs a direct binary mesh call, and per-body updates for large assemblies.
- **Edges and sketches.** The black lines are guessed from the mesh angles, not the real B-rep edges. Picking edges (for fillet), sketching on a face with constraints, dragging a dimension and the timeline would each need more engine commands than I used; the engine has them (`body_topology` edges, `sketch.*`, `timeline.*`), but none of this was tried through the viewport.
- **How the engine ships.** I used the CLI's MCP mode because it needs no Rust code of ours. For a product we either (a) bundle `solidcraft-cli` and talk MCP / JSON (simple, but we depend on its command names, which change, and it silently ignores unknown parameters), or (b) write a small Rust sidecar of our own around its `engine` crate (cleaner mesh and picking API, but Rust code that tracks a fast-moving project). Not decided.
- **Windows.** Not tried. SolidCraft publishes Windows installers and a portable build; whether we bundle those or build the CLI ourselves (the debug-info CLI I built is 384 MB; a stripped release is not measured) is open.
- Only one engine session, one user, local only (the spike server answers only 127.0.0.1).

## Verdict

Positive for the direction "own interface + SolidCraft engine in a separate repo". The decision that most needs the owner's eyes is not technical: we would depend on someone else's kernel (patched truck, own fillets), so the new repo should keep the engine behind a small interface of our own, with OpenCascade as the fallback.
