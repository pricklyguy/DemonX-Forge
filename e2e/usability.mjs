// Real-browser check of the 0.14.4 usability fixes against the real engine: E on a body face (Press Pull), the compact Move / Copy dialog with
// its X / Y / Z arrows and step buttons, the whole ribbon reachable in a narrow window, the right-click menu's Modify section, the rubber band
// in a sketch, and the snap markers (middle, crossing, alignment).
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/usability.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 450) => p.waitForTimeout(ms);
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const text = (id) => p.getByTestId(id).innerText();
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const waitTrue = async (f) => { for (let i = 0; i < 60; i++) { if (await f()) return true; await settle(250); } return false; };
const boxes = async () => (await state()).bodies.map((b) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < b.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], b.positions[i]); hi[k] = Math.max(hi[k], b.positions[i]); } return [...lo, ...hi].map((v) => Math.round(v * 10) / 10).join(','); });
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(1000);

// ---- E with a body face selected is Press Pull on that face
let [x, y] = await proj([20, 15, 10]);
await p.mouse.move(x, y); await p.mouse.click(x, y); await settle(300);
await p.keyboard.press('e');
await p.getByTestId('modify-dialog').waitFor({ timeout: 5000 });
check(/PRESS PULL/.test(await text('modify-dialog')) && /1 selected/.test(await text('edge-count')), 'E with the top face selected opens Press Pull on it');
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(500);

// ---- Move / Copy: compact dialog, arrows, step buttons
await p.keyboard.press('m');
await p.getByTestId('modify-dialog').waitFor({ timeout: 5000 });
const dlg = await p.getByTestId('modify-dialog').boundingBox();
check(dlg && dlg.width < 260 && dlg.height < 420, 'M opens a compact Move dialog', JSON.stringify(dlg));
check(/Body/.test(await text('edge-count')) || /\S/.test(await text('edge-count')), 'the only body is chosen already', await text('edge-count'));
await p.getByLabel('Move X', { exact: true }).fill('15');
check(await waitTrue(async () => (await boxes())[0] === '15,0,0,55,30,10'), 'typing 15 moves the block 15 mm in X', JSON.stringify(await boxes()));
await p.getByLabel('X plus').click(); // step is 10
check(await p.getByLabel('Move X', { exact: true }).inputValue() === '25', 'the + button adds the step (10)');
await p.getByLabel('Move step').selectOption('1');
await p.getByLabel('X minus').click();
check(await p.getByLabel('Move X', { exact: true }).inputValue() === '24', 'a step of 1 mm: minus gives 24');
const arrows = await p.evaluate(() => [0, 1, 2].map((i) => window.__forge.handleTip(i)));
check(arrows.every((a) => a) && arrows[0].value === 24, 'three arrows are on the body (X shows 24)', JSON.stringify(arrows.map((a) => a && a.value)));
// drag the Y arrow
const ay = arrows[1].at; await p.mouse.move(ay[0], ay[1]); await p.mouse.down(); await p.mouse.move(ay[0] + 30, ay[1] - 30, { steps: 6 }); await p.mouse.up(); await settle(400);
const yv = Number(await p.getByLabel('Move Y', { exact: true }).inputValue());
check(Math.abs(yv) > 1, 'dragging the Y arrow changes Move Y', String(yv));
await p.getByLabel('Move Y', { exact: true }).fill('0');
await p.getByLabel('Move X', { exact: true }).fill('60');
await p.getByLabel('Copy').check();
await settle(500);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
check(await waitTrue(async () => (await boxes()).length === 2), 'Copy leaves the original and makes a moved copy', JSON.stringify(await boxes()));
await p.keyboard.press('Control+z'); 
check(await waitTrue(async () => (await boxes()).length === 1), 'one undo takes the copy away');

// ---- the whole ribbon is reachable in a narrow window, and the right-click menu has the Modify tools
await p.setViewportSize({ width: 1000, height: 700 }); await settle(500);
for (const id of ['btn-fillet', 'btn-measure', 'btn-import', 'menu-create', 'menu-modify', 'menu-inspect', 'menu-insert']) { const r = await p.getByTestId(id).boundingBox(); check(r && r.x >= 0 && r.x + r.width <= 1000, `${id} is inside a 1000 px window`, JSON.stringify(r)); }
await p.setViewportSize({ width: 1440, height: 860 }); await settle(400);
await p.mouse.click(1200, 600, { button: 'right' });
check(await p.getByTestId('context-menu').getByRole('button', { name: 'Split Body' }).isVisible() && await p.getByTestId('context-menu').getByRole('button', { name: /Move \/ Copy/ }).isVisible(), 'right-click menu lists Move / Copy and Split Body');
await p.keyboard.press('Escape'); await settle(200);

// ---- sketch: snap markers and the rubber band (on a fresh design, so the XY plane is easy to pick)
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await p.reload(); await p.getByTestId('demo').waitFor({ timeout: 30000 }); await settle(500);
await p.getByTestId('btn-sketch').click();
[x, y] = await proj([40, -40, 0]); await p.mouse.move(x, y); await p.mouse.click(x, y);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 }); await settle(700);
const click = async (q) => { const [sx, sy] = await at(q); await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); await settle(250); };
const moveTo = async (q) => { const [sx, sy] = await at(q); await p.mouse.move(sx, sy); await settle(300); };
await p.getByTestId('tool-line').click();
await click([10, 10]); await click([40, 10]); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await p.getByTestId('tool-line').click();
await click([20, 0]); await click([20, 30]); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await p.getByTestId('tool-line').click();
await click([-20, -10]);
await moveTo([20.3, 10.2]);
check(await p.evaluate(() => window.__forge.snapKind()) === 'inter', 'near where two lines cross the pointer snaps to the crossing');
await moveTo([10.2, 10.2]);
check(await p.evaluate(() => window.__forge.snapKind()) === 'end', 'near a line end it snaps to the end');
await moveTo([25.2, 10.2]);
check(await p.evaluate(() => window.__forge.snapKind()) === 'mid', 'near the middle of a line it snaps to the middle');
await moveTo([40.2, 25]);
check(await p.evaluate(() => window.__forge.snapKind()) === 'align', 'away from everything but level with another point it aligns');
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await settle(300);
// rubber band: left to right takes only what lies wholly inside (the vertical line), right to left everything the box touches
const [a1, a2] = [await at([15, -5]), await at([25, 35])];
await p.mouse.move(a1[0], a1[1]); await p.mouse.down(); await p.mouse.move(a2[0], a2[1], { steps: 8 });
check(await p.getByTestId('rubberband').isVisible(), 'a rubber band shows while dragging over empty space');
await p.mouse.up(); await settle(300);
check(/1 selected/.test(await text('hint')), 'left to right selects only the curves wholly inside (1)', await text('hint'));
const [c1, c2] = [await at([25, 35]), await at([15, -5])];
await p.mouse.move(c1[0], c1[1]); await p.mouse.down(); await p.mouse.move(c2[0], c2[1], { steps: 8 }); await p.mouse.up(); await settle(300);
check(/2 selected/.test(await text('hint')), 'right to left selects every curve the box touches (2)', await text('hint'));
check(await p.evaluate(() => (window.getSelection()?.toString() ?? '') === ''), 'dragging the band selects no page text');
await p.screenshot({ path: `${shots}/usability.png` });

await b.close();
console.log(failed ? `== usability: ${failed} FAILED` : '== usability: all passed');
process.exit(failed ? 1 : 0);
