# Browser checks

Each script says in its header how to run it. They need the real engine, a built app (`npm run build`) and a **fresh** server on port 8120 (each leaves a model in the engine).

| Script | What it checks |
|---|---|
| `viewport.mjs` | the demo part: face picking, parameter edit, hole (H), undo, errors, theme, view cube, middle-drag pan, wheel zoom |
| `sketch2.mjs` | centre rectangle, 3-point arc, slot, 2-point circle, select / X / Delete, Trim, Offset, Fillet, Horizontal, Parallel, Fix, a refused constraint |
| `edit.mjs` | double-click edit of an extrude (preview, Cancel, OK, one undo step) and of a sketch (from the timeline and the browser), the right-click menu, Suppress, Rename, history marker, Delete with the dependents warning, Undo of a delete, the read-only query route |
| `edges.mjs` | Picking edges, Fillet and Chamfer on a body: preview, a too-big radius refused, Cancel, OK, undo/redo, a hidden edge not pickable (needs a fresh server) |
| `presspull.mjs` | Press Pull (Q): pull a face out, push it in, change the distance, Esc, OK, undo/redo, a face selected beforehand, zero refused (needs a fresh server) |
| `shell.mjs` | Shell: pick a face, preview, deselect, a too-thick wall refused, OK, undo/redo (needs a fresh server) |
| `revolve.mjs` | Revolve: full turn, half turn, angle over 360 refused, a world axis, Esc, OK, undo/redo, editing refused plainly (needs a fresh server) |
| `files.mjs` | New, Open, Save (write back to the same file, fallback when writing back is refused), Save As, the unsaved marker and the close-tab warning, Export STEP / STL / 3MF / OBJ / DXF, a refused bad file, a file saved mid-sketch, and the whole thing again without the native file windows (downloads and a file chooser) |
| `sketch.mjs` | Create Sketch on a plane and on a face, rectangle / circle / typed circle, Sketch Dimension, E for extrude with live preview, Cancel, OK, Cut direction, undo and redo, the browser tree |

Playwright's Chromium must be installed (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH`).

The browser checks are slow under load (software rendering): a rare timeout on a busy machine that does not repeat is not a failure of the app; re-run it.
