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
| `patterns.mjs` | Mirror (three planes, deselect, Esc, OK, undo), Rectangular Pattern (one and two directions, zero and negative spacing), Circular Pattern (counts, angle, refused count) (needs a fresh server) |
| `sweeploft.mjs` | Sweep (path choice, preview, Esc, OK, undo/redo) and Loft (profiles from two sketches, deselect, OK, undo); the sketches are made through the API (needs a fresh server) |
| `modify2.mjs` | Offset Face (out, in, Esc, OK, undo), Draft (angle sign, neutral plane, zero refused) and Combine (join, cut, keep tools, intersect, deselect, undo); the blocks are made through the API (needs a fresh server) |
| `facedxf.mjs` | File > Export > Selected face as DXF: the menu state, the downloaded file (4 lines and the hole), the design left untouched (needs a fresh server) |
| `tools3.mjs` | Move / Copy, Split Body, Hole (create, edit from the timeline, counterbore), Thread (flat face refused, size refused, OK, undo) and Rib (depth needed, thickness, OK, undo); the parts are made through the API (needs a fresh server) |
| `importsection.mjs` | File > Import STEP (round trip, junk file, wrong extension) and File > Export > Section through a body (download, lines, Z up, design untouched); uses the file chooser fallback (needs a fresh server) |
| `valueedit.mjs` | Editing Fillet, Offset Face, Chamfer, Shell and the extrude behind a Press Pull from the timeline: preview, Esc, OK, undo, refusal (needs a fresh server) |
| `shapes.mjs` | Scale (factor, about, uneven, zero refused), Coil (no body needed, exactly two of three, axis), Pipe (solid, hollow, zero refused) and Emboss / Deboss (profile, depth, zero refused); OK and undo for each (needs a fresh server) |
| `drag.mjs` | The drag arrow in Press Pull (up, down, past the face, typing, Esc) and in Extrude (the distance and the solid follow) (needs a fresh server) |
| `drawing.mjs` | The size boxes on a shape being drawn (typing, Backspace, Tab, Enter, circle), press-drag-release drawing, clicking a finished sketch's shape then E, a rectangle crossing a circle (hover, pick the overlap, extrude it alone), the right-click menu and the shortcuts list (needs a fresh server) |
| `select.mjs` | Open sketch: shapes light up and select (replace, Shift adds), dragging a circle's centre and one Ctrl+Z, E with three shapes, Extrude starts at 0 with a live number on the arrow, typing in it, Enter, and M for Move (needs a fresh server) |
| `dimensions2.mjs` | Angle and point-to-point dimensions with the Dimension tool (needs a fresh server) |
| `dimensions.mjs` | The sizes on an open sketch (measured and driving), the Dimensions check box, double-click to change a size in place, Esc, Ctrl+Z (needs a fresh server) |
| `usability.mjs` | E on a body face (Press Pull), the compact Move / Copy dialog (typing, step buttons, arrows, Copy, undo), the ribbon in a 1000 px window, the right-click Modify section, snap hints (end, middle, crossing, alignment) and the rubber band (needs a fresh server) |
| `updates.mjs` | The update check and window: the header badge, the available version and notes, Check now, Skip this version / Stop skipping, the check boxes kept in settings.json (starts its own server on port 8121 with a stand-in release list; Update now itself is covered by the unit tests) |
| `meshimport.mjs` | File > Import STL (a mesh body named after the file, 40 x 30 x 10 mm), Mesh to Solid (zero tolerance refused, OK, real faces and edges, undo / redo, a fillet on the result), the demo bracket refused with the engine's reason, a junk STL refused (needs a fresh server) |
| `offset.mjs` | Offset on a five-sided outline: click one side, the pointer inside, click: all five sides offset; Ctrl+Z; a typed distance with the pointer outside (needs a fresh server) |
| `mcp.mjs` | The MCP server as a real process against a running Forge, with the page open: initialize, nine tools, an AI-built block with a hole appears in the window by itself, faces and edges, commands, measure, PNG screenshot, fillet and undo, a file command refused (needs a fresh server) |
| `files.mjs` | New, Open, Save (write back to the same file, fallback when writing back is refused), Save As, the unsaved marker and the close-tab warning, Export STEP / STL / 3MF / OBJ / DXF, a refused bad file, a file saved mid-sketch, and the whole thing again without the native file windows (downloads and a file chooser) |
| `sketch.mjs` | Create Sketch on a plane and on a face, rectangle / circle / typed circle, Sketch Dimension, E for extrude with live preview, Cancel, OK, Cut direction, undo and redo, the browser tree |

Playwright's Chromium must be installed (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH`).

The browser checks are slow under load (software rendering): a rare timeout on a busy machine that does not repeat is not a failure of the app; re-run it.
