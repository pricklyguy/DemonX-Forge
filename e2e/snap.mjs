// Real-browser check of two help-you-aim features: while the sketch plane is being chosen the flat face under the pointer lights up (not only the
// origin planes), and Extrude / Press Pull can reach another face's height by clicking it (Alt + click in Press Pull).
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/snap.mjs
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


// the face under the pointer lights up while a plane is being chosen
await p.locator('[data-face=top]').click(); await settle(800);
await p.getByTestId('btn-sketch').click(); await settle();
const [fx, fy] = await proj([20, 10, 5]); await p.mouse.move(fx, fy - 3); await p.mouse.move(fx, fy); await settle(300);
check(await p.evaluate(() => !!window.__forge.litFace()), 'the flat face under the pointer is lit while choosing a plane');
await p.mouse.move(5, 500); await settle(300);
check(await p.evaluate(() => !window.__forge.litFace()), 'and it is not lit when the pointer leaves');
await p.mouse.click(fx, fy);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 }); await settle(900);
// a 10 x 10 square on the lower face, then Extrude and click the strip's top (z = 10): the distance becomes 5
await p.keyboard.press('r'); await click([5, 5]); await click([15, 15]); await settle(); await p.keyboard.press('Escape');
await p.getByTestId('btn-finish').click(); await settle(900);
await p.keyboard.press('e'); await settle();
[px, py] = await proj([10, 10, 5]); await p.mouse.move(px, py); await p.mouse.click(px, py); await settle();
[px, py] = await proj([20, 28, 10]); await p.mouse.move(px, py); await p.mouse.click(px, py); await settle(600);
const dist = await p.locator('input[data-main]').first().inputValue();
check(Math.abs(Number(dist) - 5) < 0.01, 'clicking the higher face sets the distance to reach it', dist);
await p.keyboard.press('Enter'); await settle(1500);
check(Math.abs((await height()) - 10) < 0.01, 'the square is now level with the strip', String(await height()));
// Press Pull: pick the lower face (not the square's, which now stands 5 above it), Alt + click the strip's top
await p.keyboard.press('Escape'); await settle(300);
[px, py] = await proj([30, 8, 5]); await p.mouse.move(px, py); await p.mouse.click(px, py); await settle(500);
await p.keyboard.press('q'); await settle(600);
[px, py] = await proj([20, 28, 10]); await p.mouse.move(px, py); await p.keyboard.down('Alt'); await p.mouse.click(px, py); await p.keyboard.up('Alt'); await settle(600);
const pull = await p.locator('input[data-main]').first().inputValue();
check(Math.abs(Number(pull) - 5) < 0.01, 'Press Pull: Alt + click on the strip sets the distance to level with it', pull);
console.log(failed ? `== snap: ${failed} FAILED` : '== snap: all passed');
await b.close(); process.exit(failed ? 1 : 0);
