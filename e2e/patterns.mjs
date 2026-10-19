// Real-browser check of Mirror, Rectangular Pattern and Circular Pattern against the real engine: copy a body across a plane, along one and two directions and round an axis, then deselect, Esc, OK, undo.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/presspull.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const clickWorld = async (w) => { const [x, y] = await proj(w); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const settle = (ms = 500) => p.waitForTimeout(ms);
const faces = () => p.evaluate(async () => (await (await fetch('/api/state')).json()).bodies[0]?.faces.length ?? 0);
const waitFaces = async (n) => { for (let i = 0; i < 60; i++) { if ((await faces()) === n) return; await settle(250); } };
const text = (id) => p.getByTestId(id).innerText();
/** Highest Z of the first body, from the server's own state. */
const top = () => p.evaluate(async () => { const s = await (await fetch('/api/state')).json(); const q = s.bodies[0]?.positions ?? []; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return +m.toFixed(3); });
const waitTop = async (z) => { for (let i = 0; i < 60; i++) { if (Math.abs((await top()) - z) < 0.01) return; await settle(250); } };

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });

// ---- a sketch: a 20 x 10 rectangle standing 10 mm from the sketch's Y axis
await p.getByTestId('btn-sketch').click();
const [px, py] = await proj([40, -40, 0]);
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(700);
await p.keyboard.press('r'); await click([10, 0]); await click([30, 10]); await settle();
await p.keyboard.press('Escape');
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await settle(400);
await p.getByLabel('Distance').fill('10');
await p.getByTestId('timeline').locator('[data-name^=Extrude]').waitFor({ timeout: 15000 });
await settle(500);
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(700);
const boxes = () => p.evaluate(async () => (await (await fetch('/api/state')).json()).bodies.map((b) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < b.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.positions[i]); hi[i % 3] = Math.max(hi[i % 3], b.positions[i]); } return [...lo, ...hi].map((v) => Math.round(v)).join(','); }).sort());
const waitN = async (n) => { for (let i = 0; i < 60; i++) { if ((await boxes()).length === n) return; await settle(250); } };
const have = async (list) => { const got = await boxes(); return list.every((x) => got.includes(x)); };
const ORIG = '10,0,0,30,10,10';
check(JSON.stringify(await boxes()) === JSON.stringify([ORIG]), 'one body: a 20 x 10 x 10 block', JSON.stringify(await boxes()));
check(await p.getByTestId('btn-mirror').isEnabled() && await p.getByTestId('btn-rpattern').isEnabled() && await p.getByTestId('btn-cpattern').isEnabled(), 'Mirror and the two patterns are available');

// ---- Mirror
await p.getByTestId('btn-mirror').click();
await p.getByTestId('modify-dialog').waitFor();
check(/MIRROR/.test(await text('modify-dialog')) && /Body1/.test(await text('edge-count')), 'Mirror opens with the only body already chosen');
await waitN(2);
check(await have([ORIG, '-30,0,0,-10,10,10']), 'the preview is a copy across the YZ plane', JSON.stringify(await boxes()));
await p.getByLabel('Plane').selectOption('XZ');
await waitN(2); await settle(800);
check(await have([ORIG, '10,-10,0,30,0,10']), 'across the XZ plane instead (replaces the preview)', JSON.stringify(await boxes()));
await p.getByLabel('Plane').selectOption('XY');
await settle(1200);
check(await have([ORIG, '10,0,-10,30,10,0']), 'and across the XY plane', JSON.stringify(await boxes()));
await p.screenshot({ path: `${shots}/m1-mirror.png` });
await clickWorld([20, 0, 5]); await settle(1000);
check(/Select a body/.test(await text('edge-count')) && (await boxes()).length === 1, 'clicking the body deselects it and the preview goes away', await text('edge-count'));
await clickWorld([20, 0, 5]); await waitN(2);
check(/Body1/.test(await text('edge-count')) && (await boxes()).length === 2, 'clicking it again selects it');
await p.keyboard.press('Escape');
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(600);
check((await boxes()).length === 1, 'Esc removes the preview');
await p.getByTestId('btn-mirror').click(); await p.getByTestId('modify-dialog').waitFor();
await waitN(2);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(700);
check((await boxes()).length === 2 && (await p.getByTestId('timeline').locator('[data-name^=Mirror]').count()) === 1, 'OK keeps it and there is a Mirror in the timeline', JSON.stringify(await boxes()));
await p.keyboard.press('Control+z'); await waitN(1);
check((await boxes()).length === 1, 'one Ctrl+Z undoes it');
await p.keyboard.press('Control+y'); await waitN(2);
check((await boxes()).length === 2, 'and Ctrl+Y brings it back');
await p.keyboard.press('Control+z'); await waitN(1); await settle(500);

// ---- Rectangular Pattern
await p.getByTestId('btn-rpattern').click();
await p.getByTestId('modify-dialog').waitFor();
check(/RECTANGULAR/.test(await text('modify-dialog')), 'Rectangular Pattern opens its dialog');
await p.getByLabel('Spacing', { exact: true }).fill('30');
await waitN(3);
check(await have([ORIG, '40,0,0,60,10,10', '70,0,0,90,10,10']), 'three copies along X, 30 apart', JSON.stringify(await boxes()));
await p.getByLabel('Direction 2').selectOption('Y');
await p.getByLabel('Spacing 2').fill('20');
await waitN(6);
check((await boxes()).length === 6 && (await have(['10,20,0,30,30,10', '70,20,0,90,30,10'])), 'a second direction makes a 3 x 2 grid', JSON.stringify(await boxes()));
await p.getByLabel('Spacing', { exact: true }).fill('0');
await settle(1500);
check((await boxes()).length === 1, 'a spacing of zero is not accepted and the preview goes away', `${(await boxes()).length}`);
await p.getByLabel('Spacing', { exact: true }).fill('-30');
await waitN(6);
check(await have(['-50,0,0,-30,10,10']), 'a negative spacing goes the other way', JSON.stringify(await boxes()));
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(700);
check((await boxes()).length === 6 && (await p.getByTestId('timeline').locator('[data-name^=RectangularPattern]').count()) === 1, 'OK keeps the grid and there is a pattern in the timeline');
await p.keyboard.press('Control+z'); await waitN(1); await settle(500);

// ---- Circular Pattern
await p.getByTestId('btn-cpattern').click();
await p.getByTestId('modify-dialog').waitFor();
check(/CIRCULAR/.test(await text('modify-dialog')), 'Circular Pattern opens its dialog');
await waitN(4);
check((await boxes()).length === 4, 'four copies evenly round the Z axis', `${(await boxes()).length}`);
await p.getByLabel('Count').fill('3'); await p.getByLabel('Angle').fill('180');
await waitN(3); await settle(1000);
check((await boxes()).length === 3, 'three copies over 180 degrees', `${(await boxes()).length}`);
await p.getByLabel('Count').fill('1');
await settle(1500);
check((await boxes()).length === 1, 'a count of 1 is not accepted');
await p.keyboard.press('Escape'); await settle(600);
check((await boxes()).length === 1, 'Esc leaves the one body');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
