// Real-browser check of Shell against the real engine: open the top of a plate, change the thickness, Cancel, OK, undo.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/presspull.mjs      Screenshots go to $SHOTS (default /tmp).
import { pick, enabled } from './menu.mjs';
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
check(!(await enabled(p, 'btn-shell')), 'Shell is greyed out until there is a body');

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

// ---- Shell: click the top face, 2 mm walls
await pick(p, 'btn-shell');
await p.getByTestId('modify-dialog').waitFor();
check(/SHELL/.test(await text('modify-dialog')) && /Select faces/.test(await text('edge-count')), 'Shell opens its dialog asking for faces');
check(/leave open/.test(await text('hint')), 'and the status bar says what to do');
check((await faces()) === 6, 'a plain plate has 6 faces', `${await faces()}`);
await clickWorld([20, 15, 10]); await settle(300);
check(/1 selected/.test(await text('edge-count')), 'clicking the top face selects it');
await waitFaces(11);
check((await faces()) === 11, 'the preview hollows it: 5 outer walls, 5 inner walls and the rim = 11 faces', `${await faces()}`);
await p.screenshot({ path: `${shots}/h1-shell.png` });
await clickWorld([20, 15, 10]); await settle(500);
check(/Select faces/.test(await text('edge-count')), 'clicking the face again deselects it');
check((await faces()) === 6, 'and the preview goes away', `${await faces()}`);
await clickWorld([20, 15, 10]); await settle(300);
await p.getByLabel('Thickness').fill('100');
await settle(1500);
const err = await text('error').catch(() => '');
check((await faces()) === 6 && err.length > 10 && /Step 1/.test(err), 'a wall too thick to fit is refused with the engine\'s reason and nothing changes', err);
await p.getByLabel('Thickness').fill('2');
await waitFaces(11);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(600);
check((await faces()) === 11 && (await p.getByTestId('timeline').locator('[data-name^=Shell]').count()) === 1, 'OK keeps it and there is a Shell in the timeline', `${await faces()}`);
await p.keyboard.press('Control+z'); await waitFaces(6);
check((await faces()) === 6, 'one Ctrl+Z undoes it', `${await faces()}`);
await p.keyboard.press('Control+y'); await waitFaces(11);
check((await faces()) === 11, 'and Ctrl+Y brings it back', `${await faces()}`);
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
