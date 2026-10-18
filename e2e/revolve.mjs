// Real-browser check of Revolve against the real engine: turn a profile about the sketch axis, a world axis and part way round, then Cancel, OK, undo.
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
await p.getByTestId('btn-finish').click(); await settle(700);
const box = () => p.evaluate(async () => { const s = await (await fetch('/api/state')).json(); const q = s.bodies[0]?.positions ?? []; if (!q.length) return null; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < q.length; i++) { lo[i % 3] = Math.min(lo[i % 3], q[i]); hi[i % 3] = Math.max(hi[i % 3], q[i]); } return [...lo, ...hi].map((v) => Math.round(v)).join(','); });
const waitBox = async (v) => { for (let i = 0; i < 60; i++) { if ((await box()) === v) return; await settle(250); } };

await p.getByTestId('btn-revolve').click();
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/REVOLVE/.test(await text('extrude-dialog')) && (await p.getByLabel('Axis').count()) === 1 && (await p.getByLabel('Angle').count()) === 1, 'Revolve opens a dialog with Axis and Angle');
check(/1 selected/.test(await text('profile-count')), 'the only profile is already selected');
await waitBox('-30,0,-30,30,10,30');
check((await box()) === '-30,0,-30,30,10,30', 'a full turn about the sketch Y axis: a ring 60 across and 10 high', `${await box()}`);
await p.screenshot({ path: `${shots}/r1-revolve.png` });
await p.getByLabel('Angle').fill('180');
await waitBox('-30,0,0,30,10,30');
const half = await box();
check(half === '-30,0,0,30,10,30' || half === '-30,0,-30,30,10,0', 'a half turn fills half of it', `${half}`);
await p.getByLabel('Angle').fill('400');
await settle(1200);
check((await box()) === null, 'an angle over 360 is not accepted and the preview goes away', `${await box()}`);
await p.getByLabel('Angle').fill('360');
await p.getByLabel('Axis').selectOption('world:X');
await waitBox('10,-10,-10,30,10,10');
check((await box()) === '10,-10,-10,30,10,10', 'about the world X axis it makes a tube 20 long and 20 across', `${await box()}`);
await p.keyboard.press('Escape');
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(600);
check((await box()) === null, 'Esc removes the preview');
await p.getByTestId('btn-revolve').click();
await p.getByTestId('extrude-dialog').waitFor();
await p.getByLabel('Axis').selectOption('axis:y');
await waitBox('-30,0,-30,30,10,30');
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(600);
check((await box()) === '-30,0,-30,30,10,30' && (await p.getByTestId('timeline').locator('[data-name^=Revolve]').count()) === 1, 'OK keeps it and there is a Revolve in the timeline', `${await box()}`);
await p.keyboard.press('Control+z'); await waitBox(null);
check((await box()) === null, 'one Ctrl+Z undoes it');
await p.keyboard.press('Control+y'); await waitBox('-30,0,-30,30,10,30');
check((await box()) === '-30,0,-30,30,10,30', 'and Ctrl+Y brings it back');
await p.getByTestId('timeline').locator('[data-name^=Revolve]').dblclick(); await settle(400);
check(/not available yet/.test(await text('error')), 'editing a revolve says plainly that it is not available yet', await text('error'));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
