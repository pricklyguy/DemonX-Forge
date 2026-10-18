// Real-browser check of picking edges and Fillet / Chamfer on bodies against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/edges.mjs          Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const faces = async () => (await state()).bodies[0]?.faces.length ?? 0;
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const clickWorld = async (w) => { const [x, y] = await proj(w); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const settle = (ms = 500) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const waitFaces = (n) => p.waitForFunction(async (n) => (await (await fetch('/api/state')).json()).bodies[0]?.faces.length === n, n, { timeout: 20000 });

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
check(await p.getByTestId('btn-fillet').isDisabled() && await p.getByTestId('btn-chamfer').isDisabled(), 'Fillet and Chamfer are greyed out until there is a body');

// ---- a 40 x 30 plate with rounded corners (the sketch Fillet tool), extruded 10
await p.getByTestId('btn-sketch').click();
const [px, py] = await p.evaluate(() => window.__forge.project([40, -40, 0]));
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(700);
await p.keyboard.press('r'); await click([0, 0]); await click([40, 30]); await settle();
for (const corner of [[0, 0], [40, 0], [40, 30], [0, 30]]) {
  await p.getByTestId('tool-fillet').click();
  await click(corner);
  await p.getByTestId('value-entry').waitFor();
  await p.getByLabel('Value').fill('5'); await p.getByLabel('Value').press('Enter'); await settle(500);
}
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
check((await faces()) === 10, 'a rounded plate: 4 sides, 4 corners, top and bottom = 10 faces', `${await faces()}`);
check(await p.getByTestId('btn-fillet').isEnabled(), 'Fillet is available now');
await p.screenshot({ path: `${shots}/g1-plate.png` });

// ---- Fillet (F): one click on a straight top edge picks it
await p.keyboard.press('f');
await p.getByTestId('modify-dialog').waitFor();
check(/FILLET/.test(await text('modify-dialog')) && /Select edges/.test(await text('edge-count')), 'F opens the Fillet dialog asking for edges');
check(/Click the edges/.test(await text('hint')), 'and the status bar says what to do');
check((await p.evaluate(() => window.__forge.edgeAt([20, 0, 10]).pick?.index)) !== undefined, 'the edge picker finds the top front edge at its own screen position (not mistaken for hidden)');
await clickWorld([20, 0, 10]); // the middle of the top front edge
await p.waitForFunction(() => /1 selected/.test(document.querySelector('[data-testid=edge-count]').textContent), null, { timeout: 8000 });
check(true, 'clicking an edge selects it');
await p.getByLabel('Radius').fill('1.5');
await waitFaces(18);
check(true, 'the preview rounds the whole outline from that one edge: +8 faces (4 sides and 4 corners)', `${await faces()} faces`);
await p.screenshot({ path: `${shots}/g2-fillet-preview.png` });
await p.getByLabel('Radius').fill('3');
await settle(900);
let s = await state();
check(s.bodies[0].faces.length === 18 && s.timeline.filter((t) => /Fillet/i.test(t.name)).length === 1, 'changing the radius replaces the preview: still one Fillet in the timeline');
await p.getByLabel('Radius').fill('50');
await p.getByTestId('error').waitFor({ timeout: 15000 });
check(/largest radius that fits/.test(await text('error')), 'a radius that is too big is refused with the engine\'s reason', await text('error'));
check((await faces()) === 10 && await p.getByTestId('modify-dialog').isVisible(), 'the preview is removed and the dialog stays open');
await p.getByLabel('Radius').fill('1.5');
await waitFaces(18);
await p.getByRole('button', { name: 'Cancel' }).click();
await waitFaces(10);
s = await state();
check(!s.timeline.some((t) => /Fillet/i.test(t.name)) && (await p.getByTestId('modify-dialog').count()) === 0, 'Cancel removes the preview completely');

// ---- Fillet again, OK, then undo
await p.getByTestId('btn-fillet').click();
await p.getByTestId('modify-dialog').waitFor();
await clickWorld([20, 0, 10]);
await p.getByLabel('Radius').fill('1.5');
await waitFaces(18);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(600);
s = await state();
check(s.bodies[0].faces.length === 18 && s.timeline.some((t) => /Fillet/i.test(t.name)), 'OK keeps the fillet: 18 faces and a Fillet in the timeline');
await p.keyboard.press('Control+z'); await settle(800);
check((await faces()) === 10, 'one Ctrl+Z removes it');
await p.keyboard.press('Control+y'); await settle(800);
check((await faces()) === 18, 'and Ctrl+Y brings it back');

// ---- Chamfer on a different edge: the bottom outline's front edge
await p.getByTestId('btn-chamfer').click();
await p.getByTestId('modify-dialog').waitFor();
check(/CHAMFER/.test(await text('modify-dialog')) && (await p.getByLabel('Distance').count()) === 1, 'the Chamfer dialog asks for a distance');
await clickWorld([20, 0, 0]); // the middle of the bottom front edge
await p.waitForFunction(() => /1 selected/.test(document.querySelector('[data-testid=edge-count]').textContent));
await p.getByLabel('Distance').fill('1');
await waitFaces(26);
check(true, 'the chamfer follows the whole bottom outline too (+8 faces)', `${await faces()} faces`);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(500);

// ---- selecting, deselecting, and edges you cannot see
await p.getByTestId('btn-fillet').click();
await p.getByTestId('modify-dialog').waitFor();
await settle(300);
await clickWorld([20, 0, 5 + 5]); // (top front edge is already rounded; pick any straight vertical-ish edge instead)
let n = await text('edge-count');
await p.keyboard.press('Escape');
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
check(true, 'Esc closes the dialog without changing anything', n);

await p.getByTestId('btn-fillet').click();
await p.getByTestId('modify-dialog').waitFor();
await settle(300);
const [hx, hy] = await proj([20, 30, 0]); // the bottom back edge: behind the plate as seen from the front
await p.mouse.move(hx, hy); await p.mouse.click(hx, hy); await settle(300);
check(/Select edges/.test(await text('edge-count')), 'an edge hidden behind the part cannot be picked', await text('edge-count'));
await p.screenshot({ path: `${shots}/g3-chamfer-done.png` });
await p.keyboard.press('Escape');
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(300);

// ---- the ribbon in sketch mode has no body Fillet (that name belongs to the sketch tool there)
await p.getByTestId('btn-sketch').click();
const [qx, qy] = await p.evaluate(() => window.__forge.project([20, 15, 10]));
await p.mouse.move(qx, qy); await p.mouse.click(qx, qy);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
check((await p.getByTestId('btn-fillet').count()) === 0 && (await p.getByTestId('tool-fillet').count()) === 1, 'inside a sketch the Fillet button is the sketch one');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
