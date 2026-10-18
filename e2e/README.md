# Browser checks

Each script says in its header how to run it. They need the real engine, a built app (`npm run build`) and a **fresh** server on port 8120 (each leaves a model in the engine).

| Script | What it checks |
|---|---|
| `viewport.mjs` | the demo part: face picking, parameter edit, hole (H), undo, errors, theme, view cube, middle-drag pan, wheel zoom |
| `sketch2.mjs` | centre rectangle, 3-point arc, slot, 2-point circle, select / X / Delete, Trim, Offset, Fillet, Horizontal, Parallel, Fix, a refused constraint |
| `edit.mjs` | double-click edit of an extrude (preview, Cancel, OK, one undo step) and of a sketch (from the timeline and the browser), the right-click menu, Suppress, Rename, history marker, Delete with the dependents warning, Undo of a delete, the read-only query route |
| `sketch.mjs` | Create Sketch on a plane and on a face, rectangle / circle / typed circle, Sketch Dimension, E for extrude with live preview, Cancel, OK, Cut direction, undo and redo, the browser tree |

Playwright's Chromium must be installed (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH`).
