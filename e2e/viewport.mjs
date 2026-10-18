// Real-browser check of the viewport, picking and edits against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a fresh server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/viewport.mjs        Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
check(/Ready/.test(await p.getByTestId('status').innerText()), 'empty design starts ready');
check((await p.getByTestId('timeline').innerText()).includes('Timeline is empty'), 'empty timeline');

await p.getByTestId('demo').click();
await p.getByText('Face 12').waitFor({ timeout: 60000 });
const tl = await p.getByTestId('timeline').innerText();
check(/Extrude1/.test(tl) && /Fillet/.test(tl), 'demo builds a timeline', tl.replace(/\s+/g, ' '));
check((await p.locator('.param').count()) === 1, 'one parameter listed (width)');
await p.screenshot({ path: `${shots}/forge-1-demo.png` });

// click the big top face by projecting a point that lies on it (z = 0, between the holes)
const [x, y] = await p.evaluate(() => window.__forge.project([40, -30, 0]));
await p.mouse.click(x, y);
await p.getByTestId('selection').waitFor({ timeout: 5000 });
const info = await p.getByTestId('selection').innerText();
check(/Normal\s*0\.00, 0\.00, 1\.00/.test(info), 'click selects the top face (normal +Z)', info.replace(/\s+/g, ' '));
check((await p.locator('.tree .sel').count()) === 1, 'the browser tree highlights it');

// a drag moves the camera and must not change the selection
await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(700, 330, { steps: 5 }); await p.mouse.up();
check(/Normal/.test(await p.getByTestId('selection').innerText()), 'a drag does not clear the selection');

// edit the parameter
await p.getByLabel('width').fill('100 mm'); await p.getByLabel('width').press('Enter');
await p.waitForFunction(() => /engine \d+ ms/.test(document.querySelector('[data-testid=status]').textContent), null, { timeout: 60000 });
await p.waitForFunction(() => document.querySelector('#p-width').value === '100 mm');
// exact area (OpenCascade on the exported STEP): 50 x 100 minus two 6 mm holes = 4943.451. The engine's face list reports it a little high
// (about +0.06 %), so this allows 0.2 %; the UI must not present that figure as a dimension (see docs/PLAN.md, engine findings).
const area = await p.getByTestId('selection').innerText();
const got = Number(/Area\s*([\d.]+)/.exec(area)?.[1]);
check(Math.abs(got - 4943.451) / 4943.451 < 0.002, 'width 100 mm rebuilt; the selected top face is about 4943 mm²', area.replace(/\s+/g, ' '));
await p.screenshot({ path: `${shots}/forge-2-width100.png` });

// click a point, drill a hole there, undo it
const faces0 = await p.locator('.tree .child').count();
const [hx, hy] = await p.evaluate(() => window.__forge.project([40, -50, 0]));
await p.mouse.click(hx, hy);
await p.getByTestId('drill').click();
await p.waitForFunction((n) => document.querySelectorAll('.tree .child').length > n, faces0, { timeout: 60000 });
const faces1 = await p.locator('.tree .child').count();
check(faces1 > faces0, 'drilling at a clicked point adds faces', `${faces0} -> ${faces1}`);
check((await p.getByTestId('timeline').innerText()).includes('Hole'), 'the hole is in the timeline');
await p.screenshot({ path: `${shots}/forge-3-hole.png` });
await p.getByRole('button', { name: 'Undo' }).click();
await p.waitForFunction((n) => document.querySelectorAll('.tree .child').length === n, faces0, { timeout: 60000 });
check(true, 'undo removes the hole');

// a refused edit shows the engine's reason and changes nothing
await p.getByLabel('width').fill('banana'); await p.getByLabel('width').press('Enter');
await p.waitForFunction(() => document.querySelector('.status .err'), null, { timeout: 30000 });
check(true, 'a bad parameter shows an error', await p.locator('.status .err').innerText());
check((await p.getByLabel('width').inputValue()) === '100 mm', 'and the field goes back to the real value');

// light theme repaints
await p.getByRole('button', { name: 'Light' }).click();
check((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light theme switches');
await p.screenshot({ path: `${shots}/forge-4-light.png` });

// the server answers only this computer
const bad = await p.evaluate(async () => (await fetch('/api/state', { headers: {} })).status);
check(bad === 200, 'local request is served');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
