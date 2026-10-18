// Real-browser check of editing against the real engine: change an extrude (live preview, Cancel, OK, one undo step), reopen a sketch from
// the timeline and from the browser, suppress, rename, roll the history back, delete with the warning, undo a delete.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/edit.mjs           Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const ranges = (s) => { const body = s.bodies[0]; if (!body) return null; return [0, 1, 2].map((k) => { const v = body.positions.filter((_, i) => i % 3 === k); return [Math.min(...v), Math.max(...v)]; }); };
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const settle = (ms = 500) => p.waitForTimeout(ms);
const item = (name) => p.locator(`[data-testid=timeline-item][data-name="${name}"]`);
const names = async () => (await state()).timeline.map((t) => t.name);

// ---- build: a 40 x 30 rectangle extruded 10
await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.getByTestId('btn-sketch').click();
const [px, py] = await p.evaluate(() => window.__forge.project([40, -40, 0]));
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(700);
await p.keyboard.press('r'); await click([0, 0]); await click([40, 30]); await settle();
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await settle(400);
check(/1 selected/.test(await p.getByTestId('profile-count').innerText()), 'a sketch with one region preselects it');
await p.getByLabel('Distance').fill('10');
await p.getByTestId('timeline').locator('[data-name^=Extrude]').waitFor({ timeout: 15000 });
await settle(500);
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle();
let s = await state();
check(JSON.stringify(await names()) === '["Sketch1","Extrude1"]' && near(ranges(s)[2][1], 10), 'built: Sketch1, Extrude1, 10 tall');

// ---- edit the extrude: double-click it
await item('Extrude1').dblclick();
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/EDIT EXTRUDE1/.test(await p.getByTestId('extrude-dialog').innerText()), 'double-click opens the extrude for editing');
check((await p.getByLabel('Distance').inputValue()) === '10' && /1 selected/.test(await p.getByTestId('profile-count').innerText()), 'it shows the current distance and region');
check((await p.getByLabel('Operation').inputValue()) === 'new', 'and its operation (New Body)');
await settle(600);
s = await state();
check(near(ranges(s)[2][1], 10), 'opening it changed nothing');
await p.screenshot({ path: `${shots}/e1-edit-open.png` });
await p.getByLabel('Distance').fill('25');
await p.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return Math.max(...s.bodies[0].positions.filter((_, i) => i % 3 === 2)) > 24.9; }, null, { timeout: 15000 });
check(true, 'the preview follows the new distance (25)');
await p.getByRole('button', { name: 'Cancel' }).click();
await p.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return s.bodies[0] && Math.max(...s.bodies[0].positions.filter((_, i) => i % 3 === 2)) < 10.1; }, null, { timeout: 15000 });
s = await state();
check(JSON.stringify(await names()) === '["Sketch1","Extrude1"]' && near(ranges(s)[2][1], 10), 'Cancel puts it back to 10, nothing else changed');

await item('Extrude1').dblclick();
await p.getByTestId('extrude-dialog').waitFor();
await settle(400);
await p.getByLabel('Distance').fill('25');
await p.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return Math.max(...s.bodies[0].positions.filter((_, i) => i % 3 === 2)) > 24.9; }, null, { timeout: 15000 });
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
s = await state();
check(JSON.stringify(await names()) === '["Sketch1","Extrude1"]' && near(ranges(s)[2][1], 25), 'OK keeps 25, still one Extrude1');
await p.keyboard.press('Control+z');
for (let i = 0; i < 20; i++) { await settle(250); s = await state(); if (near(ranges(s)[2][1], 10)) break; } // polled: the undo goes through the same queue as the OK
check(near(ranges(s)[2][1], 10) && s.timeline.length === 2, 'one Ctrl+Z undoes the whole edit', `z ${ranges(s)[2][1]}, ${s.timeline.length} steps, ${JSON.stringify(s.timeline.map((t) => t.name))}`);
await p.keyboard.press('Control+y'); await settle(800);
s = await state();
check(near(ranges(s)[2][1], 25), 'and Ctrl+Y redoes it');

// ---- edit the sketch from the timeline: make the bottom edge 60 long; the extrude follows
await item('Sketch1').dblclick();
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
check(true, 'double-clicking the sketch reopens it (SKETCH tab)');
await settle(700);
await p.keyboard.press('d');
await click([20, 0]);
await p.getByTestId('value-entry').waitFor();
await p.getByLabel('Value').fill('60'); await p.getByLabel('Value').press('Enter'); await settle(700);
await p.keyboard.press('Escape');
await p.getByTestId('btn-finish').click();
await p.getByTestId('tab-sketch').waitFor({ state: 'detached', timeout: 15000 });
await settle(700);
s = await state();
check(near(ranges(s)[0][1], 60) && near(ranges(s)[2][1], 25), 'finishing rebuilt the extrude: now 60 wide and still 25 tall', JSON.stringify(ranges(s)));
await p.screenshot({ path: `${shots}/e2-sketch-edited.png` });

// ---- and from the browser tree
await p.getByTestId('node-sketch-Sketch1').dblclick();
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
check(true, 'double-clicking the sketch in the browser reopens it too');
await p.getByTestId('btn-finish').click();
await p.getByTestId('tab-sketch').waitFor({ state: 'detached' });

// ---- suppress and unsuppress
await item('Extrude1').click({ button: 'right' });
await p.getByTestId('context-menu').waitFor();
check((await p.getByTestId('context-menu').innerText()).split('\n').length === 5, 'right-click opens the menu (Edit, Rename, Suppress, Roll, Delete)');
await p.getByRole('button', { name: 'Suppress', exact: true }).click(); await settle(700);
s = await state();
check(s.bodies.length === 0 && s.timeline[1].suppressed && /off/.test(await item('Extrude1').getAttribute('class')), 'Suppress removes the body and greys the step');
await item('Extrude1').click({ button: 'right' });
await p.getByRole('button', { name: 'Unsuppress' }).click(); await settle(700);
s = await state();
check(s.bodies.length === 1 && !s.timeline[1].suppressed, 'Unsuppress brings it back');

// ---- rename
await item('Extrude1').click({ button: 'right' });
await p.getByRole('button', { name: 'Rename…' }).click();
await p.getByLabel('Value').fill('Base'); await p.getByLabel('Value').press('Enter'); await settle(600);
check(JSON.stringify(await names()) === '["Sketch1","Base"]', 'Rename changes the step name');

// ---- roll the history back and forward
await item('Sketch1').click({ button: 'right' });
await p.getByRole('button', { name: 'Roll history to here' }).click(); await settle(700);
s = await state();
check(s.marker === 1 && s.bodies.length === 0 && (await p.getByTestId('timeline-marker').count()) === 1, 'Roll history to here: the marker moves, the body goes');
check(/future/.test(await item('Base').getAttribute('class')), 'steps after the marker are dimmed');
await p.screenshot({ path: `${shots}/e3-rolled.png` });
await p.getByTestId('roll-end').click(); await settle(700);
s = await state();
check(s.marker === 2 && s.bodies.length === 1 && (await p.getByTestId('timeline-marker').count()) === 0, 'Roll to end brings everything back');

// ---- delete: the sketch takes the extrude with it, after a warning
await item('Sketch1').click();
await p.keyboard.press('Delete');
await p.getByTestId('confirm').waitFor();
check(/also deletes: Base/.test(await p.getByTestId('confirm').innerText()), 'Delete on a sketch warns what goes with it');
await p.getByRole('button', { name: 'Cancel' }).click();
check((await names()).length === 2 && (await p.getByTestId('confirm').count()) === 0, 'Cancel leaves everything');
await item('Sketch1').click();
await p.keyboard.press('Delete');
await p.getByTestId('confirm-ok').click(); await settle(700);
s = await state();
check(s.timeline.length === 0 && s.bodies.length === 0, 'confirming deletes both');
await p.keyboard.press('Control+z'); await settle(800);
s = await state();
check(s.timeline.length === 2 && s.bodies.length === 1, 'Ctrl+Z brings them back');

// delete the extrude alone: no dependents, no warning
await item('Base').click({ button: 'right' });
await p.getByRole('button', { name: 'Delete' }).click(); await settle(700);
s = await state();
check(s.timeline.length === 1 && s.bodies.length === 0 && (await p.getByTestId('confirm').count()) === 0, 'deleting a step nothing depends on needs no confirmation');
await p.screenshot({ path: `${shots}/e4-end.png` });

// the read-only question route refuses anything else
const bad = await p.evaluate(async () => (await fetch('/api/query', { method: 'POST', body: JSON.stringify({ command: 'file.save', params: {} }) })).status);
check(bad === 400, 'the query route refuses a command that is not a read-only question');

await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
