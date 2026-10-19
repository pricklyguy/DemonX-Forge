// Real-browser check of the drag arrow in Press Pull and Extrude against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/drag.mjs      Screenshots go to $SHOTS (default /tmp).
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
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
const waitTrue = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (await f()) return true; await settle(250); } return false; };
const reload = async () => { await p.reload(); await p.getByTestId('timeline').waitFor({ timeout: 30000 }); await settle(1000); };
const topZ = async () => { const q = (await state()).bodies[0]?.positions ?? []; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return +m.toFixed(2); };
const tip = () => p.evaluate(() => window.__forge.handleTip());
/** Press on the arrow's tip, drag it by (dx, dy) pixels in steps, release. */
const dragTip = async (dx, dy) => {
  const t = await tip(); const [x, y] = t.at;
  await p.mouse.move(x, y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await p.mouse.up();
};

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
await reload();

// ---------------- Press Pull: drag the arrow up
await p.keyboard.press('q'); await p.getByTestId('modify-dialog').waitFor();
await settle(500);
check((await tip()) === null, 'no arrow before a face is chosen');
const [fx, fy] = await p.evaluate(() => window.__forge.project([30, 5, 10]));
await p.mouse.move(fx, fy); await p.mouse.click(fx, fy); await settle(600);
const t0 = await tip();
check(t0 && t0.value === 0, 'an arrow appears on the face with the distance 0', JSON.stringify(t0));
await p.screenshot({ path: `${shots}/d1-arrow.png` });
await dragTip(0, -100);
const v1 = (await tip()).value;
check(v1 > 0, 'dragging the tip up makes the distance bigger', `${v1}`);
check(Number(await p.getByLabel('Distance').inputValue()) === v1, 'the Distance box follows the arrow', await p.getByLabel('Distance').inputValue());
check(await waitTrue(async () => Math.abs((await topZ()) - (10 + v1)) < 0.01), 'and the part follows: the preview is that tall', `${await topZ()} for ${v1}`);
await dragTip(0, 60);
const v2 = (await tip()).value;
check(v2 < v1, 'dragging down shortens it again', `${v2}`);
await dragTip(0, 100);
const v3 = (await tip()).value;
check(v3 < 0 && v3 > -9, 'dragging past the face pushes it in (a small negative distance)', `${v3}`);
check(await waitTrue(async () => Math.abs((await topZ()) - (10 + v3)) < 0.01), 'and the top comes down by that much (the face is pushed in)', `${await topZ()} for ${v3}`);
await p.getByLabel('Distance').fill('7');
await settle(600);
check((await tip()).value === 7, 'typing a distance moves the arrow');
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(600);
check((await topZ()) === 10 && (await tip()) === null, 'Esc removes the preview and the arrow');

// ---------------- Extrude: drag the arrow of a sketch profile
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await api([{ command: 'sketch.create', params: { plane: 'XY', name: 'Base' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.finish' }]);
await reload();
await p.keyboard.press('e'); await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await settle(1500);
const e0 = await tip();
check(e0 && e0.value === 0, 'the extrude dialog shows an arrow at the profile with distance 0', JSON.stringify(e0));
await dragTip(0, -50);
const w1 = (await tip()).value;
check(w1 > 0, 'dragging up lengthens the extrude', `${w1}`);
check(Number(await p.getByLabel('Distance').inputValue()) === w1, 'the Distance box follows');
check(await waitTrue(async () => Math.abs((await topZ()) - w1) < 0.01), 'and the solid is that tall', `${await topZ()} for ${w1}`);
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(700);
check(Math.abs((await topZ()) - w1) < 0.01 && (await tip()) === null, 'OK keeps it and the arrow goes away', `${await topZ()}`);
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
