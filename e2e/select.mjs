// Real-browser check of selecting and moving in an open sketch, of Shift for adding shapes, and of the Extrude dialog: starts at 0, the arrow has a live number.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/select.mjs      Screenshots go to $SHOTS (default /tmp).
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
const moveTo = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await settle(250); };
const clickAt = async (q, mods = []) => { const [x, y] = await at(q); await p.mouse.move(x, y); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(x, y); for (const m of mods) await p.keyboard.up(m); await settle(300); };
const waitTrue = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (await f()) return true; await settle(250); } return false; };
const near = (a, c, t = 0.01) => Math.abs(a - c) < t;
const lit = async () => (await p.evaluate(() => window.__forge.fills())).filter((f) => f.opacity >= 0.5).length;
const hovered = async () => (await p.evaluate(() => window.__forge.fills())).filter((f) => f.opacity > 0.3 && f.opacity < 0.5).length;
const topZ = async () => { const q = (await state()).bodies[0]?.positions ?? []; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return +m.toFixed(2); };

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
// an open sketch: a 100 x 60 plate with two circles and a slot (made through the API and left open)
await p.evaluate(async () => { await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps: [
  { command: 'sketch.create', params: { plane: 'XY', name: 'Face' } },
  { command: 'sketch.rectangle.two_point', params: { p0: [-50, -30], p1: [50, 30] } },
  { command: 'sketch.circle.center', params: { center: [-20, 5], diameter: 12 } },
  { command: 'sketch.circle.center', params: { center: [20, 5], diameter: 12 } },
] }) }); });
await p.reload(); await p.getByTestId('tab-sketch').waitFor({ timeout: 30000 }); await settle(1500);

// ---- hover lights a shape in an open sketch; a click selects it
await moveTo([-35, -15]);                      // inside the plate, away from any curve
check((await hovered()) === 1, 'moving over the plate lights it (one shape)', JSON.stringify(await p.evaluate(() => window.__forge.fills())));
await clickAt([-35, -15]);
check((await lit()) === 1, 'a click selects it: it stays lit', `${await lit()}`);
await clickAt([0, -15]);
check((await lit()) === 1, 'clicking another spot of the plate keeps one shape selected (no Shift: it replaces)');
await clickAt([-20, 5]);                       // inside the left circle
check((await lit()) === 1, 'clicking inside a circle selects the circle instead');
await clickAt([20, 5], ['Shift']);
check((await lit()) === 2, 'Shift adds the other circle: two selected', `${await lit()}`);
await clickAt([20, 5], ['Shift']);
check((await lit()) === 1, 'Shift on a selected shape takes it out again');
await p.screenshot({ path: `${shots}/se1-selected.png` });

// ---- a curve can be selected too, and dragged: the circle's centre moves it
await moveTo([-20, 5]);
const [cx0, cy0] = await at([-20, 5]), [cx1, cy1] = await at([-20, -20]);
await p.mouse.move(cx0, cy0); await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(cx0 + ((cx1 - cx0) * i) / 8, cy0 + ((cy1 - cy0) * i) / 8);
await p.mouse.up(); await settle(1500);
let sk = (await state()).sketches[0];
const circles = sk.curves.filter((c) => c.type === 'circle').map((c) => c.center);
check(circles.some((c) => near(c[0], -20, 0.6) && near(c[1], -20, 0.6)), 'dragging a circle\'s centre moves the circle (to -20, -20, on the grid)', JSON.stringify(circles));
await p.keyboard.press('Control+z'); await settle(1200);
sk = (await state()).sketches[0];
check(sk.curves.filter((c) => c.type === 'circle').some((c) => near(c.center[0], -20, 0.1) && near(c.center[1], 5, 0.1)), 'Ctrl+Z puts it back in one step', JSON.stringify(sk.curves.filter((c) => c.type === 'circle').map((c) => c.center)));

// ---- select both circles and the plate with Shift, then E
await clickAt([-35, -15]);
await clickAt([-20, 5], ['Shift']);
await clickAt([20, 5], ['Shift']);
check((await lit()) === 3, 'three shapes selected with Shift', `${await lit()}`);
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await settle(600);
check(/3 selected/.test(await text('profile-count')), 'E opens Extrude with those three shapes', await text('profile-count'));
check((await p.getByLabel('Distance', { exact: true }).inputValue()) === '0', 'the distance starts at 0, not at the last number', await p.getByLabel('Distance', { exact: true }).inputValue());
check((await p.getByLabel('Drag arrow value').count()) === 1 && (await p.getByLabel('Drag arrow value').inputValue()) === '0', 'the arrow has a number box beside it, showing 0');
check((await state()).bodies.length === 0, 'nothing is extruded at 0');
const tip = await p.evaluate(() => window.__forge.handleTip());
await p.mouse.move(tip.at[0], tip.at[1]); await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(tip.at[0], tip.at[1] - 6 * i);
await p.mouse.up(); await settle(500);
const v1 = Number(await p.getByLabel('Drag arrow value').inputValue());
check(v1 > 0 && Number(await p.getByLabel('Distance', { exact: true }).inputValue()) === v1, 'dragging the arrow changes the number beside it and in the dialog together', `${v1}`);
check(await waitTrue(async () => Math.abs((await topZ()) - v1) < 0.01), 'and the solid follows live', `${await topZ()} for ${v1}`);
await p.screenshot({ path: `${shots}/se2-extrude-arrow.png` });
await p.getByLabel('Drag arrow value').fill('12'); await settle(300);
check((await p.getByLabel('Distance', { exact: true }).inputValue()) === '12', 'typing in the arrow\'s box sets the distance (12)');
check(await waitTrue(async () => near(await topZ(), 12)), 'and the solid is 12 tall');
await p.getByLabel('Drag arrow value').press('Enter');
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached', timeout: 15000 });
await settle(600);
check((await state()).bodies.length >= 1 && near(await topZ(), 12), 'Enter in the arrow box accepts it', `${(await state()).bodies.length} bodies`);

// ---- M opens Move / Copy, set to Move
await p.keyboard.press('m');
await p.getByTestId('modify-dialog').waitFor({ timeout: 15000 });
check(/MOVE/.test(await text('modify-dialog')) && !(await p.getByLabel('Copy').isChecked()), 'M opens Move / Copy with Copy unticked');
await p.keyboard.press('Escape');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
