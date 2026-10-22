// Real-browser check of a strip sketched along the edge of a face (its lines lie on top of the face outline), and of orbiting past the top view.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/strip.mjs
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 600) => p.waitForTimeout(ms);
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const height = async () => { const q = (await state()).bodies[0]?.positions ?? []; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return m; };

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
// a 40 x 30 x 5 block
await p.getByTestId('btn-sketch').click(); await settle();
let [px, py] = await proj([40, -40, 0]); await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 }); await settle(900);
await p.keyboard.press('r'); await click([0, 0]); await click([40, 30]); await settle(); await p.keyboard.press('Escape');
await p.getByTestId('btn-finish').click(); await settle(900);
[px, py] = await proj([20, 15, 0]); await p.mouse.move(px, py); await p.mouse.click(px, py); await settle();
await p.keyboard.press('e'); await settle(); await p.keyboard.type('5'); await p.keyboard.press('Enter'); await settle(1500);
check(Math.abs((await height()) - 5) < 0.01, 'the block is 5 mm high');

// a sketch on its top face, and a 40 x 4 strip along the back edge
await p.locator('[data-face=top]').click(); await settle(800);
await p.getByTestId('btn-sketch').click(); await settle();
[px, py] = await proj([20, 15, 5]); await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 }); await settle(900);
await p.keyboard.press('r'); await click([0, 26]); await settle(); await p.keyboard.type('40'); await p.keyboard.press('Tab'); await p.keyboard.type('4'); await p.keyboard.press('Enter'); await settle(); await p.keyboard.press('Escape');
await p.getByTestId('btn-finish').click(); await settle(900);
const sk = (await state()).sketches.at(-1);
check(sk.profiles.length === 2, 'the strip and the rest of the face are two profiles', String(sk.profiles.length));
await p.keyboard.press('e'); await settle();
[px, py] = await proj([20, 28, 5]); await p.mouse.move(px, py); await p.mouse.click(px, py); await settle();
check(/1 selected/.test(await p.locator('.dialog').first().innerText()), 'clicking the strip selects it');
await p.keyboard.type('5'); await p.keyboard.press('Enter'); await settle(1500);
check(Math.abs((await height()) - 10) < 0.01, 'the strip extrudes 5 mm up from the face', String(await height()));

// orbit: past the top view the camera keeps turning, and the view never gets stuck
await p.locator('[data-face=top]').click(); await settle(800);
const up0 = await p.evaluate(() => window.__forge.up());
await p.evaluate(() => { for (let i = 0; i < 40; i++) window.__forge.orbit(0, 12); }); await settle(300); // drag down past the top view
const up1 = await p.evaluate(() => window.__forge.up());
check(up1[2] < 0.99 && Math.abs(up1[2] - up0[2]) > 0.01 || up1[1] !== up0[1], 'orbiting from the top view turns the camera past it', JSON.stringify(up1));
await p.evaluate(() => { for (let i = 0; i < 40; i++) window.__forge.orbit(0, 12); }); await settle(300);
const again = await p.evaluate(() => window.__forge.up());
check(JSON.stringify(again) !== JSON.stringify(up1), 'and keeps turning (it is not stopped at a pole)');
// the real gesture: Shift + middle button, drag
await p.locator('[data-face=top]').dispatchEvent('click'); await settle(800);
await p.mouse.move(700, 400); await p.keyboard.down('Shift'); await p.mouse.down({ button: 'middle' });
for (let i = 1; i <= 20; i++) await p.mouse.move(700, 400 + i * 10);
await p.mouse.up({ button: 'middle' }); await p.keyboard.up('Shift'); await settle(300);
const drag = await p.evaluate(() => window.__forge.up());
check(Math.hypot(drag[0], drag[1] - 1, drag[2]) > 0.1, 'Shift + middle drag orbits from the top view', JSON.stringify(drag));
console.log(failed ? `== strip: ${failed} FAILED` : '== strip: all passed');
await b.close(); process.exit(failed ? 1 : 0);
