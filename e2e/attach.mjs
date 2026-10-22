// Real-browser check that a sketch on a face still opens when the engine says the face cannot keep an attachment (its history cannot tell it apart
// from other faces): Forge retries on the same plane, not attached. The engine's refusal is simulated by answering the first face request with that error.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/attach.mjs
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

let refused = 0;
await p.route('**/api/batch', async (route) => {
  const post = route.request().postData() ?? '';
  if (post.includes('"face"') && !refused++) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: "Step 1 (sketch.create): invalid parameters for `sketch.create`: this face can't keep an attachment: its history can't tell it apart from other faces" }) });
  return route.continue();
});
await p.locator('[data-face=top]').click(); await settle(800);
await p.getByTestId('btn-sketch').click(); await settle();
[px, py] = await proj([20, 15, 5]); await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 }); await settle(900);
check(refused === 1, 'the engine refused the face once');
const sk = (await state()).sketches.at(-1);
check(Math.abs(sk.plane.origin[2] - 5) < 0.01 && Math.abs(sk.plane.xDir[0] - 1) < 0.01 && Math.abs(sk.plane.yDir[1] - 1) < 0.01, 'the sketch is on the top face plane (z = 5, X right, Y back)', JSON.stringify(sk.plane));
console.log(failed ? `== attach: ${failed} FAILED` : '== attach: all passed');
await b.close(); process.exit(failed ? 1 : 0);
