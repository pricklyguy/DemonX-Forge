# Browser checks

Each script says in its header how to run it. They need the real engine, a built app (`npm run build`) and a **fresh** server on port 8120 (each leaves a model in the engine).

| Script | What it checks |
|---|---|
| `viewport.mjs` | the demo part: face picking, parameter edit, hole (H), undo, errors, theme, view cube, middle-drag pan, wheel zoom |
| `sketch.mjs` | Create Sketch on a plane and on a face, rectangle / circle / typed circle, Sketch Dimension, E for extrude with live preview, Cancel, OK, Cut direction, undo and redo, the browser tree |

Playwright's Chromium must be installed (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH`).
