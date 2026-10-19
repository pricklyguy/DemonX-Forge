// Real-browser check of drawing the way Fusion does: live sizes while drawing, Tab between the size boxes, press-drag-release to draw,
// and clicking a finished sketch's shape in the model view, then E, to extrude it.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/drawing.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 500) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const moveTo = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await settle(300); };
const waitTrue = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (await f()) return true; await settle(250); } return false; };
const near = (a, c) => Math.abs(a - c) < 0.01;


await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.getByTestId('btn-sketch').click();
const [px, py] = await proj([40, -40, 0]);
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(800);

// ---- a rectangle: the sizes show while the pointer moves
await p.keyboard.press('r');
await click([0, 0]);
await moveTo([40, 30]);
check((await p.locator('input.dimin').count()) === 2, 'two size boxes sit on the rectangle while it is drawn', `${await p.locator('.dimlabel.live').count()}`);
const labels = await p.locator('input.dimin').evaluateAll((els) => els.map((e) => e.value));
check(labels.includes('40') && labels.includes('30'), 'they read the width and the height (40 and 30)', JSON.stringify(labels));
check((await p.getByLabel('Typed size', { exact: true }).inputValue()) === '40' && (await p.getByLabel('Second typed size').inputValue()) === '30', 'and the Width and Height boxes show them without any clicking', `${await p.getByLabel('Typed size', { exact: true }).inputValue()} x ${await p.getByLabel('Second typed size').inputValue()}`);
await p.screenshot({ path: `${shots}/dr1-live.png` });
await p.keyboard.press('Tab');
check(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Typed size'), 'Tab goes into the first box');
await p.keyboard.type('55');
const widthBox = await p.locator('input.dimin').first().boundingBox();
await settle(300);
const wide = await p.evaluate(() => { const ins = [...document.querySelectorAll('input.dimin')]; return ins.map((e) => e.value); });
check(wide[0] === '55', 'typing replaces the number in the box on the shape', JSON.stringify(wide));
await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
check((await p.getByLabel('Typed size', { exact: true }).inputValue()) === '', 'and Backspace can clear it completely', await p.getByLabel('Typed size', { exact: true }).inputValue());
await p.keyboard.type('44');
await settle(400);
await p.screenshot({ path: `${shots}/dr3-typed.png` });
await p.keyboard.press('Control+a'); await p.keyboard.type('30');
await p.keyboard.press('Tab');
check(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Second typed size'), 'Tab again goes to the second box');
await p.keyboard.type('20');
await p.keyboard.press('Enter');
await settle(800);
let s = await state(); let sk = s.sketches[0];
const lines = sk.curves.filter((c) => c.type === 'line' && !c.construction);
const xs = lines.flatMap((c) => [c.start[0], c.end[0]]), ys = lines.flatMap((c) => [c.start[1], c.end[1]]);
check(lines.length === 4 && near(Math.max(...xs) - Math.min(...xs), 30) && near(Math.max(...ys) - Math.min(...ys), 20), 'Enter places a rectangle of 30 x 20', `${lines.length} lines, ${Math.max(...xs) - Math.min(...xs)} x ${Math.max(...ys) - Math.min(...ys)}`);

// ---- only one box typed: the other follows the pointer
await p.keyboard.press('r');
await click([50, 0]);
await moveTo([80, 40]);
await p.keyboard.press('Tab'); await p.keyboard.type('25');
await p.keyboard.press('Enter');
await settle(800);
s = await state(); sk = s.sketches[0];
const l2 = sk.curves.filter((c) => c.type === 'line' && !c.construction).filter((c) => Math.min(c.start[0], c.end[0]) >= 49.9);
const x2 = l2.flatMap((c) => [c.start[0], c.end[0]]), y2 = l2.flatMap((c) => [c.start[1], c.end[1]]);
check(l2.length === 4 && near(Math.max(...x2) - Math.min(...x2), 25) && near(Math.max(...y2) - Math.min(...y2), 40), 'a typed width with the height left to the pointer: 25 x 40', `${Math.max(...x2) - Math.min(...x2)} x ${Math.max(...y2) - Math.min(...y2)}`);

// ---- a circle: the diameter shows and can be typed
await p.keyboard.press('c');
await click([-30, 20]);
await moveTo([-20, 20]);
check((await p.getByLabel('Typed size', { exact: true }).inputValue()) === '20' && (await p.locator('input.dimin').count()) === 1, 'a circle shows its diameter (20) in a box on the shape');
await p.keyboard.press('Tab'); await p.keyboard.type('12'); await p.keyboard.press('Enter'); await settle(800);
s = await state(); sk = s.sketches[0];
const circ = sk.curves.find((c) => c.type === 'circle');
check(circ && near(circ.radius, 6) && near(circ.center[0], -30), 'Enter places a circle of diameter 12', JSON.stringify(circ));

// ---- a 3-point arc: length and angle of the chord first, then the radius
await p.keyboard.press('a');
await click([-60, -10]);
await moveTo([-30, -10]);
check((await p.locator('input.dimin').count()) === 2 && (await p.getByLabel('Typed size', { exact: true }).inputValue()) === '30', 'an arc first shows Length and Angle boxes (30)', `${await p.locator('input.dimin').count()}`);
await p.keyboard.press('Tab'); await p.keyboard.type('40'); await p.keyboard.press('Tab'); await p.keyboard.type('0'); await p.keyboard.press('Enter'); await settle(500);
check((await p.locator('input.dimin').count()) === 1, 'after the chord is set one Radius box is left');
await moveTo([-40, 0]);
await p.keyboard.press('Tab'); await p.keyboard.type('30'); await p.keyboard.press('Enter'); await settle(900);
s = await state(); sk = s.sketches[0];
const arc = sk.curves.find((c) => c.type === 'arc');
check(arc && near(arc.radius, 30), 'Enter places an arc of radius 30', JSON.stringify(arc && { r: arc.radius, c: arc.center }));
check(arc && near(Math.hypot(arc.start[0] - arc.end[0], arc.start[1] - arc.end[1]), 40), 'on a chord of length 40');

// ---- a slot: centre-to-centre length and angle, then the width
await p.keyboard.press('Escape');
const nBefore = (await state()).sketches[0].curves.length;
await p.getByTestId('tool-slot').click();
await click([0, -40]);
await moveTo([30, -40]);
check((await p.locator('input.dimin').count()) === 2, 'a slot first shows Length and Angle');
await p.keyboard.press('Tab'); await p.keyboard.type('35'); await p.keyboard.press('Tab'); await p.keyboard.type('0'); await p.keyboard.press('Enter'); await settle(500);
await moveTo([17, -30]);
check((await p.locator('input.dimin').count()) === 1, 'then one Width box');
await p.keyboard.press('Tab'); await p.keyboard.type('12'); await p.keyboard.press('Enter'); await settle(900);
s = await state(); sk = s.sketches[0];
const slotCurves = sk.curves.slice(nBefore);
const sys = slotCurves.flatMap((c) => c.type === 'arc' ? [c.center[1] + c.radius, c.center[1] - c.radius] : [c.start[1], c.end[1]]);
check(slotCurves.length >= 4 && near(Math.max(...sys) - Math.min(...sys), 12), 'Enter places a slot 12 wide', `${slotCurves.length} curves, ${Math.max(...sys) - Math.min(...sys)}`);
const sxs = slotCurves.flatMap((c) => c.type === 'arc' ? [c.center[0] + c.radius, c.center[0] - c.radius] : [c.start[0], c.end[0]]);
check(near(Math.max(...sxs) - Math.min(...sxs), 35 + 12), 'with its two centres 35 apart (47 overall)', `${Math.max(...sxs) - Math.min(...sxs)}`);

// ---- press, drag, release draws a rectangle in one go
await p.keyboard.press('r');
const [ax, ay] = await at([-50, -30]), [bx, by] = await at([-20, -50]);
await p.mouse.move(ax, ay); await p.mouse.down();
for (let i = 1; i <= 6; i++) await p.mouse.move(ax + ((bx - ax) * i) / 6, ay + ((by - ay) * i) / 6);
await p.mouse.up(); await settle(800);
s = await state(); sk = s.sketches[0];
const l3 = sk.curves.filter((c) => c.type === 'line' && !c.construction).filter((c) => Math.max(c.start[0], c.end[0]) <= -19.9 && Math.min(c.start[1], c.end[1]) <= -29.9);
check(l3.length === 4, 'dragging corner to corner draws a rectangle', `${l3.length} lines`);
check((await p.getByTestId('entry').count()) === 0, 'and no size box is left open');
await p.mouse.move(ax, ay); await p.mouse.down();
for (let i = 1; i <= 6; i++) await p.mouse.move(ax + 40 * i, ay + 5 * i);
await p.mouse.up(); await settle(500);

// ---- finish the sketch; the shapes can be clicked in the model view, then E
await p.getByTestId('btn-finish').click(); await settle(1000);
const [rx, ry] = await proj([15, 10, 0]); // inside the first rectangle (30 x 20 from the origin)
await p.mouse.move(rx, ry); await p.mouse.click(rx, ry); await settle(500);
await p.screenshot({ path: `${shots}/dr2-picked.png` });
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/1 selected/.test(await text('profile-count')), 'clicking a shape and pressing E extrudes that shape: 1 profile chosen', await text('profile-count'));
await p.getByLabel('Distance').fill('8');
check(await waitTrue(async () => { const q = (await state()).bodies[0]?.positions ?? []; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return near(m, 8); }), 'the preview is a block 8 tall');
const bb = (() => 0)();
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(800);
const body = (await state()).bodies[0];
const lo = [1e9, 1e9], hi = [-1e9, -1e9]; for (let i = 0; i < body.positions.length; i += 3) for (const k of [0, 1]) { lo[k] = Math.min(lo[k], body.positions[i + k]); hi[k] = Math.max(hi[k], body.positions[i + k]); }
check(near(hi[0] - lo[0], 30) && near(hi[1] - lo[1], 20), 'and only that 30 x 20 shape became the block', `${hi[0] - lo[0]} x ${hi[1] - lo[1]}`);
// ---- two shapes that cross: each piece is its own shape, lit as the mouse passes, and can be extruded alone
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await p.evaluate(async () => { await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps: [{ command: 'sketch.create', params: { plane: 'XY', name: 'Cross' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [40, 15], diameter: 30 } }, { command: 'sketch.finish' }] }) }); });
await p.reload(); await p.getByTestId('timeline').waitFor({ timeout: 30000 }); await settle(1200);
const lens = await proj([33, 15, 0]);
await p.mouse.move(lens[0] - 30, lens[1]); await settle(200);
await p.mouse.move(lens[0], lens[1]); await settle(300);
check(await p.evaluate(() => document.querySelector('canvas').style.cursor === 'pointer'), 'moving over a shape lights it and shows a pointer');
await p.screenshot({ path: `${shots}/dr4-hover.png` });
await p.mouse.click(lens[0], lens[1]); await settle(400);
await p.keyboard.press('e'); await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/1 selected/.test(await text('profile-count')), 'clicking the overlap piece selects just that piece', await text('profile-count'));
await p.getByLabel('Distance').fill('5');
await waitTrue(async () => (await state()).bodies.length === 1);
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(800);
const lb = (await state()).bodies[0]; const lx = [1e9, -1e9]; for (let i = 0; i < lb.positions.length; i += 3) { lx[0] = Math.min(lx[0], lb.positions[i]); lx[1] = Math.max(lx[1], lb.positions[i]); }
check(near(lx[0], 25) && near(lx[1], 40), 'the block is only the piece inside the rectangle and the circle: x from 25 to 40', `${lx[0]}..${lx[1]}`);

// ---- the right-click menu and the shortcut list
await p.mouse.click(300, 300, { button: 'right' }); await p.getByTestId('context-menu').waitFor();
const items = await p.getByTestId('context-menu').locator('button').allInnerTexts();
check(items.some((t) => /Create Sketch/.test(t)) && items.some((t) => /Undo/.test(t)) && items.some((t) => /Keyboard shortcuts/.test(t)), 'right click opens an actions menu', JSON.stringify(items.slice(0, 6)));
await p.getByTestId('context-menu').getByRole('button', { name: /Keyboard shortcuts/ }).click();
await p.getByTestId('shortcuts-dialog').waitFor();
check(/Extrude/.test(await text('shortcuts-dialog')) && /Press Pull/.test(await text('shortcuts-dialog')) && /Tab/.test(await text('shortcuts-dialog')), 'the shortcuts list opens from the menu');
await p.keyboard.press('Escape'); await p.getByTestId('shortcuts-dialog').waitFor({ state: 'detached' });
await p.keyboard.press('?'); await p.getByTestId('shortcuts-dialog').waitFor();
check(true, 'and with the ? key');
await p.keyboard.press('Escape'); await p.getByTestId('shortcuts-dialog').waitFor({ state: 'detached' });
await p.getByTestId('help-btn').click(); await p.getByTestId('shortcuts-dialog').waitFor();
check(true, 'and from the ? button in the header');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
