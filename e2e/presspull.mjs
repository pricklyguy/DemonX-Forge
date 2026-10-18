// Real-browser check of Press Pull (Q) against the real engine: pull a face out, push it in, Cancel, undo.
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
const text = (id) => p.getByTestId(id).innerText();
/** Highest Z of the first body, from the server's own state. */
const top = () => p.evaluate(async () => { const s = await (await fetch('/api/state')).json(); const q = s.bodies[0]?.positions ?? []; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return +m.toFixed(3); });
const waitTop = async (z) => { for (let i = 0; i < 60; i++) { if (Math.abs((await top()) - z) < 0.01) return; await settle(250); } };

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
check(await p.getByTestId('btn-presspull').isDisabled(), 'Press Pull is greyed out until there is a body');

// ---- a 40 x 30 plate, 10 thick
await p.getByTestId('btn-sketch').click();
const [px, py] = await proj([40, -40, 0]);
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(700);
await p.keyboard.press('r'); await click([0, 0]); await click([40, 30]); await settle();
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
check((await top()) === 10, 'the plate is 10 thick', `${await top()}`);

// ---- Q opens Press Pull; click the top face; a positive distance adds material
await p.keyboard.press('q');
await p.getByTestId('modify-dialog').waitFor();
check(/PRESS PULL/.test(await text('modify-dialog')) && /Select a face/.test(await text('edge-count')), 'Q opens Press Pull asking for a face');
check(/Click a face/.test(await text('hint')), 'and the status bar says what to do');
await clickWorld([20, 15, 10]); await settle(300);
check(/1 selected/.test(await text('edge-count')), 'clicking the top face selects it');
await waitTop(15);
check((await top()) === 15, 'the preview pulls the top face out by the default 5 mm: 15 high', `${await top()}`);
await p.getByLabel('Distance').fill('8');
await waitTop(18);
check((await top()) === 18, 'changing the distance replaces the preview: 18 high', `${await top()}`);
await p.screenshot({ path: `${shots}/p1-pull.png` });
await p.keyboard.press('Escape');
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(500);
check((await top()) === 10, 'Esc removes the preview: back to 10', `${await top()}`);
check((await p.getByTestId('timeline').locator('[data-name^=Press]').count()) === 0, 'and nothing is left in the timeline');

// ---- a negative distance pushes the face in (cuts)
await p.getByTestId('btn-presspull').click();
await p.getByTestId('modify-dialog').waitFor();
await clickWorld([20, 15, 10]); await settle(300);
await p.getByLabel('Distance').fill('-4');
await waitTop(6);
check((await top()) === 6, 'a negative distance pushes the face in: 6 high', `${await top()}`);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(600);
check((await top()) === 6, 'OK keeps it', `${await top()}`);
await p.keyboard.press('Control+z'); await waitTop(10);
check((await top()) === 10, 'one Ctrl+Z undoes it', `${await top()}`);
await p.keyboard.press('Control+y'); await waitTop(6);
check((await top()) === 6, 'and Ctrl+Y brings it back', `${await top()}`);

// ---- a face that is already selected is used when Press Pull starts
await p.keyboard.press('Control+z'); await waitTop(10); await settle(400);
await clickWorld([20, 15, 10]); await settle(300);
await p.keyboard.press('q');
await p.getByTestId('modify-dialog').waitFor();
check(/1 selected/.test(await text('edge-count')), 'a face selected before Q is taken as the face to pull');
await waitTop(15);
await p.getByLabel('Distance').fill('0');
await p.getByTestId('modify-ok').click(); await settle(500);
check(/not zero/.test(await text('hint')) || (await p.getByTestId('modify-dialog').count()) === 1, 'a distance of zero is not accepted', await text('hint'));
await p.keyboard.press('Escape'); await settle(500);
check((await top()) === 10, 'Cancel leaves the plate as it was', `${await top()}`);
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
