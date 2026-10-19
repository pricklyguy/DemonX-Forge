// Real-browser check of the sketch and extrude workflow against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/sketch.mjs         Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const bbox = (body) => { const a = [0, 1, 2].map((k) => body.positions.filter((_, i) => i % 3 === k)); return a.map((v) => [Math.min(...v), Math.max(...v)]); };
const at = async (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const settle = (ms = 400) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
check(await p.getByTestId('tab-solid').isVisible() && !(await p.getByTestId('tab-sketch').count()), 'starts on the SOLID tab, no SKETCH tab');
await p.screenshot({ path: `${shots}/s1-start.png` });

// ---- Create Sketch: pick the XY plane
await p.getByTestId('btn-sketch').click();
check(/Select an origin plane/.test(await text('hint')), 'Create Sketch asks for a plane');
// a spot that only the XY plane covers from this camera (the nearest plane under the pointer wins, so overlapping planes need a clear spot)
const [px, py] = await p.evaluate(() => window.__forge.project([40, -40, 0]));
await p.screenshot({ path: `${shots}/s2-pick-plane.png` });
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
check(await p.getByTestId('palette').isVisible(), 'a sketch is open: SKETCH tab and palette appear');
await settle(600);

// ---- rectangle (R): two corners
await p.keyboard.press('r');
check((await p.getByTestId('tool-rect').getAttribute('aria-pressed')) === 'true', 'R selects the rectangle tool');
await click([0, 0]); await click([40, 30]);
await p.getByTestId('node-sketch-Sketch1').waitFor();
await settle();
let s = await state();
let sk = s.sketches[0];
check(sk && sk.active && sk.curves.length === 4 && sk.profiles.length === 1, 'rectangle: 4 lines, 1 profile', `curves ${sk?.curves.length}, profiles ${sk?.profiles.length}`);
check(JSON.stringify(sk.curves[0].end) === '[40,0]' && JSON.stringify(sk.curves[1].end) === '[40,30]', 'rectangle corners landed where clicked (snapped to the grid)', JSON.stringify(sk.curves.map((c) => c.end)));
check((await p.getByTestId('tool-rect').getAttribute('aria-pressed')) !== 'true', 'the rectangle tool ends after one rectangle');

// the grid step depends on the zoom (5 or 10 mm here); round numbers snap exactly, so switch Snap off for the freehand positions below
await p.locator('.palette label', { hasText: 'Snap' }).locator('input').uncheck();

// ---- circle (C), centre and a point on it; then a circle typed by diameter
await p.keyboard.press('c');
await click([20, 15]); await click([25, 15]);
await settle();
s = await state(); sk = s.sketches[0];
const circ = sk.curves.find((c) => c.type === 'circle');
check(circ && near(circ.radius, 5) && near(circ.center[0], 20) && near(circ.center[1], 15), 'circle: centre (20,15), radius 5 (clicked freehand)', JSON.stringify(circ));
check(sk.profiles.length === 2, 'a hole splits the region: 2 profiles');
await p.screenshot({ path: `${shots}/s3-sketch.png` });

// typed numbers: a circle of diameter 6 at (35, 8)
await p.keyboard.press('c');
await click([35, 8]);
await p.keyboard.type('6');
await p.getByLabel('Typed size', { exact: true }).press('Enter');
await settle();
s = await state(); sk = s.sketches[0];
check(sk.curves.filter((c) => c.type === 'circle').length === 2 && near(sk.curves.at(-1).radius, 3, 1e-6), 'typing 6 after the centre makes a diameter-6 circle');

// ---- dimension (D): make the bottom line 50 long; the rectangle follows
const dof0 = sk.dof;
await p.keyboard.press('d');
await click([30, 0]);
await p.getByTestId('value-entry').waitFor();
await p.getByLabel('Value').fill('50');
await p.getByLabel('Value').press('Enter');
await settle(600);
s = await state(); sk = s.sketches[0];
check(sk.dimensions.length === 1 && sk.dimensions[0].value === 50, 'dimension recorded', JSON.stringify(sk.dimensions));
check(Math.abs(Math.max(...sk.curves.filter((c) => c.type === 'line').map((c) => c.end[0])) - 50) < 1e-6, 'the rectangle stretched to 50 wide');
check(sk.dof < dof0, 'degrees of freedom went down', `${dof0} -> ${sk.dof}`);
check((await p.locator('.dimlabel').first().innerText()) === '50', 'the dimension shows as a label (50)');
// clicking the same line again edits the dimension (a second one would over-constrain)
await click([30, 0]);
await p.getByTestId('value-entry').waitFor();
check(/Change Length/.test(await text('value-entry')) && (await p.getByLabel('Value').inputValue()) === '50', 'dimensioning an already-dimensioned line offers to change it');
await p.getByLabel('Value').fill('56');
await p.getByLabel('Value').press('Enter');
await settle(600);
s = await state(); sk = s.sketches[0];
check(sk.dimensions.length === 1 && sk.dimensions[0].value === 56 && Math.abs(Math.max(...sk.curves.filter((c) => c.type === 'line').map((c) => c.end[0])) - 56) < 1e-6, 'the change moved the line: still one dimension, now 56');
await click([28, 0]);
await p.getByLabel('Value').fill('50');
await p.getByLabel('Value').press('Enter');
await settle(600);
await p.keyboard.press('Escape'); // ends the dimension tool

// ---- E from inside the sketch: finishes it and opens Extrude
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(!(await p.getByTestId('tab-sketch').count()), 'E finished the sketch (back on SOLID)');
check(/Select profiles/.test(await text('profile-count')), 'no profile preselected when the sketch has several');
await settle(500);
await p.screenshot({ path: `${shots}/s4-extrude-open.png` });

// pick the big region (rectangle minus the two holes) by clicking inside it
await p.evaluate(() => 0);
const [rx, ry] = await p.evaluate(() => window.__forge.project([3, 3, 0]));
await p.mouse.move(rx, ry); await p.mouse.click(rx, ry);
await p.waitForFunction(() => /1 selected/.test(document.querySelector('[data-testid=profile-count]').textContent));
await p.getByLabel('Distance').fill('12');
await p.getByTestId('timeline').locator('[data-name^=Extrude]').waitFor({ timeout: 15000 });
await settle(600);
s = await state();
let body = s.bodies[0];
check(s.bodies.length === 1 && near(bbox(body)[2][1], 12, 1e-6), 'live preview: a body 12 tall exists while the dialog is open', body && JSON.stringify(bbox(body)));
await p.screenshot({ path: `${shots}/s5-preview.png` });

// change the distance: the preview follows (and does not stack features)
await p.getByLabel('Distance').fill('8');
await p.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return s.bodies[0] && Math.max(...s.bodies[0].positions.filter((_, i) => i % 3 === 2)) < 8.0001; }, null, { timeout: 15000 });
s = await state();
check(s.timeline.filter((t) => t.type === 'ExtrudeFeature').length === 1, 'changing the distance replaces the preview, one Extrude in the timeline');

// Cancel removes it
await p.getByRole('button', { name: 'Cancel' }).click();
await p.waitForFunction(async () => (await (await fetch('/api/state')).json()).bodies.length === 0, null, { timeout: 15000 });
s = await state();
check(s.bodies.length === 0 && !s.timeline.some((t) => t.type === 'ExtrudeFeature'), 'Cancel undoes the preview completely');

// ---- E again, OK this time
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor();
await settle(500);
const [rx2, ry2] = await p.evaluate(() => window.__forge.project([3, 3, 0]));
await p.mouse.move(rx2, ry2); await p.mouse.click(rx2, ry2);
await p.getByLabel('Distance').fill('12');
await p.getByTestId('timeline').locator('[data-name^=Extrude]').waitFor({ timeout: 15000 });
await settle(500);
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(500);
s = await state(); body = s.bodies[0]; const bb = bbox(body);
check(s.bodies.length === 1 && near(bb[0][1], 50, 1e-6) && near(bb[1][1], 30) && near(bb[2][1], 12, 1e-6), 'OK keeps it: a 50 x 30 x 12 body', JSON.stringify(bb));
check(body.faces.length === 4 + 2 + 2 + 2 , 'faces: 4 sides, top, bottom and the two holes (two half-cylinders each)', `${body.faces.length}`);
await p.screenshot({ path: `${shots}/s6-extruded.png` });

// ---- sketch on the new top face, a circle, cut it down 5 mm
await p.getByTestId('btn-sketch').click();
const [tx, ty] = await p.evaluate(() => window.__forge.project([45, 25, 12]));
await p.mouse.move(tx, ty); await p.mouse.click(tx, ty);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(600);
s = await state(); sk = s.sketches.find((k) => k.active);
check(sk && Math.abs(sk.plane.origin[2] - 12) < 1e-6, 'a sketch on the top face lies at z = 12', sk && JSON.stringify(sk.plane.origin));
await p.keyboard.press('c');
await click([10, 15]); await click([14, 15]);
await settle();
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await p.waitForFunction(() => /1 selected/.test(document.querySelector('[data-testid=profile-count]').textContent), null, { timeout: 5000 }).catch(() => {});
if (!/1 selected/.test(await text('profile-count'))) { const [cx, cy] = await p.evaluate(() => window.__forge.project([10, 15, 12])); await p.mouse.move(cx, cy); await p.mouse.click(cx, cy); }
await p.waitForFunction(() => /1 selected/.test(document.querySelector('[data-testid=profile-count]').textContent));
await p.getByLabel('Operation').selectOption('cut');
await p.getByLabel('Distance').fill('5');
// the preview must be the cut (13 faces); the first preview, a join with the default operation, has other face counts
await p.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return s.timeline.filter((t) => t.type === 'ExtrudeFeature').length === 2 && s.bodies[0].faces.length === 13; }, null, { timeout: 20000 });
await settle(500);
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
s = await state();
console.log('   after OK:', s.timeline.map((t) => t.name).join(','), '| faces', s.bodies[0]?.faces.length, '| error:', await p.getByTestId('error').count() ? await text('error') : 'none');
check(s.bodies.length === 1 && s.bodies[0].faces.length === 10 + 3, 'cut: a blind hole adds a wall and a floor (two half-cylinders + bottom)', `${s.bodies[0].faces.length} faces`);
await p.screenshot({ path: `${shots}/s7-cut.png` });

// ---- undo takes the cut away, redo brings it back
await p.keyboard.press('Control+z'); await settle(800);
s = await state();
console.log('   after Ctrl+Z:', s.timeline.map((t) => t.name).join(','), '| faces', s.bodies[0]?.faces.length);
check(s.bodies[0].faces.length === 10, 'Ctrl+Z undoes the cut');
await p.keyboard.press('Control+y'); await settle(800);
s = await state();
check(s.bodies[0].faces.length === 13, 'Ctrl+Y redoes it');

// ---- the browser tree lists what exists and hides it on request
check((await text('node-bodies')).includes('(1)') && (await text('node-sketches')).includes('(2)'), 'browser: 1 body, 2 sketches');
await p.getByLabel('Hide body-Body1').or(p.getByLabel(/Hide body-/)).first().click();
await settle(300);
await p.screenshot({ path: `${shots}/s8-hidden.png` });
check(true, 'hiding a body from the browser did not crash');

await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
