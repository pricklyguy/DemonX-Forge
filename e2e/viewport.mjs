// Real-browser check of the viewport on the demo part: face picking, parameter edit, hole, undo, errors, theme, view cube and the mouse.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/viewport.mjs        Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const text = (id) => p.getByTestId(id).innerText();
await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
check(/Ready/.test(await text('status')), 'empty design starts ready');
check((await text('timeline')).includes('Timeline is empty'), 'empty timeline');

await p.getByTestId('demo').click();
await p.getByTestId('timeline').locator('[data-name=Fillet1]').waitFor({ timeout: 60000 });
check((await p.getByTestId('timeline-item').count()) === 5, 'demo builds a 5-step timeline');
check((await p.locator('#p-width').inputValue()) === '60 mm', 'the width parameter is listed in the browser');
await p.screenshot({ path: `${shots}/forge-1-demo.png` });

// click the top face
const [x, y] = await proj([40, -30, 0]);
await p.mouse.click(x, y);
await p.getByTestId('selection').waitFor({ timeout: 5000 });
const info = await text('selection');
check(/plane/.test(info) && /area ≈ 29\d\d/.test(info), 'click selects the top face', info);

// a drag with the left button does not clear the selection
await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(700, 330, { steps: 5 }); await p.mouse.up();
check(await p.getByTestId('selection').count() === 1, 'a left drag does not clear the selection');

// edit the parameter (in the browser tree)
await p.locator('#p-width').fill('100 mm'); await p.locator('#p-width').press('Enter');
await p.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return Math.min(...s.bodies[0].positions.filter((_, i) => i % 3 === 1)) < -99.9; }, null, { timeout: 60000 });
check(true, 'width 100 mm rebuilt the part');
await p.screenshot({ path: `${shots}/forge-2-width100.png` });

// H drills a hole at the clicked point
const f0 = (await state()).bodies[0].faces.length;
const [hx, hy] = await proj([40, -50, 0]);
await p.mouse.click(hx, hy);
await p.keyboard.press('h');
await p.waitForFunction(async (n) => (await (await fetch('/api/state')).json()).bodies[0].faces.length > n, f0, { timeout: 60000 });
check(true, 'H drills a hole at the clicked point', `${f0} -> ${(await state()).bodies[0].faces.length} faces`);
await p.getByLabel('Undo').click();
await p.waitForFunction(async (n) => (await (await fetch('/api/state')).json()).bodies[0].faces.length === n, f0, { timeout: 60000 });
check(true, 'Undo removes the hole');

// a refused edit shows the engine's reason and the field goes back
await p.locator('#p-width').fill('banana'); await p.locator('#p-width').press('Enter');
await p.getByTestId('error').waitFor({ timeout: 30000 });
check(true, 'a bad parameter shows an error', await text('error'));
check((await p.locator('#p-width').inputValue()) === '100 mm', 'and the field goes back to the real value');

// view cube: TOP looks straight down, so a vertical line collapses to a point
await p.locator('.vcface[data-face=top]').click();
await p.waitForTimeout(300);
// (the camera looks at the middle of the model, so test on the vertical line through it: x 25, y -50 for the 100 mm wide part)
const [t0x, t0y] = await proj([25, -50, 0]), [t1x, t1y] = await proj([25, -50, 40]);
check(Math.hypot(t1x - t0x, t1y - t0y) < 8, 'view cube TOP looks straight down', `${Math.round(Math.hypot(t1x - t0x, t1y - t0y))} px`);
await p.getByTestId('navbar').getByLabel('Home').click(); // from straight above the front face is edge-on and cannot be clicked, as on any view cube
await p.waitForTimeout(300);
await p.locator('.vcface[data-face=front]').click();
await p.waitForTimeout(300);
const [f0x, f0y] = await proj([25, -50, 0]), [f1x, f1y] = await proj([25, -50, 40]);
check(Math.abs(f1x - f0x) < 8 && f0y - f1y > 20, 'view cube FRONT shows height going up the screen');
await p.getByTestId('navbar').getByLabel('Home').click();

// the Fusion mouse: middle drag pans, wheel zooms
const [m0x, m0y] = await proj([0, 0, 0]);
await p.mouse.move(700, 400); await p.mouse.down({ button: 'middle' }); await p.mouse.move(780, 400, { steps: 6 }); await p.mouse.up({ button: 'middle' });
const [m1x] = await proj([0, 0, 0]);
check(Math.abs(Math.abs(m1x - m0x) - 80) < 25 && Math.abs(m1x - m0x) > 40, 'middle-button drag pans', `moved ${Math.round(m1x - m0x)} px`);
const [a0x, a0y] = await proj([0, 0, 0]), [a1x, a1y] = await proj([100, 0, 0]);
await p.mouse.move(700, 400); await p.mouse.wheel(0, -400); await p.waitForTimeout(300);
const [b0x, b0y] = await proj([0, 0, 0]), [b1x, b1y] = await proj([100, 0, 0]);
check(Math.hypot(b1x - b0x, b1y - b0y) > Math.hypot(a1x - a0x, a1y - a0y) * 1.1, 'the wheel zooms in');
await p.getByLabel('Fit').click();

// light theme repaints
await p.getByRole('button', { name: 'Light' }).click();
check((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light theme switches');
await p.screenshot({ path: `${shots}/forge-4-light.png` });

// the server answers only this computer
check((await p.evaluate(async () => (await fetch('/api/state')).status)) === 200, 'local request is served');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
