// Real-browser check of Offset Face, Draft and Combine against the real engine: move and tilt faces of a block and combine two overlapping blocks, then deselect, Esc, OK, undo.
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
// the blocks are made through the API; the dialogs are driven by hand
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(1000);
const boxes = () => p.evaluate(async () => (await (await fetch('/api/state')).json()).bodies.map((b) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < b.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.positions[i]); hi[i % 3] = Math.max(hi[i % 3], b.positions[i]); } return [...lo, ...hi].map((v) => Math.round(v)).join(','); }).sort());
/** The smallest Y among the first body's vertices at height z, to a hundredth. */
const minYat = (z) => p.evaluate(async (z) => { const q = (await (await fetch('/api/state')).json()).bodies[0]?.positions ?? []; let m = 1e9; for (let i = 0; i < q.length; i += 3) if (Math.abs(q[i + 2] - z) < 0.01) m = Math.min(m, q[i + 1]); return +m.toFixed(2); }, z);
const waitTrue = async (f) => { for (let i = 0; i < 60; i++) { if (await f()) return true; await settle(250); } return false; };
const ONE = '0,0,0,40,30,10';
check(JSON.stringify(await boxes()) === JSON.stringify([ONE]), 'a 40 x 30 x 10 block', JSON.stringify(await boxes()));

// ---- Offset Face: the front wall (y = 0)
await p.getByTestId('btn-offsetface').click();
await p.getByTestId('modify-dialog').waitFor();
check(/OFFSET FACE/.test(await text('modify-dialog')) && /Select faces/.test(await text('edge-count')), 'Offset Face opens asking for faces');
await clickWorld([20, 0, 5]); await settle(300);
check(/1 selected/.test(await text('edge-count')), 'clicking the front wall selects it');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify(['0,-2,0,40,30,10'])), 'the preview moves it out by the default 2 mm', JSON.stringify(await boxes()));
await p.getByLabel('Distance').fill('-6');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify(['0,6,0,40,30,10'])), 'a negative distance moves it in: the block is 24 deep', JSON.stringify(await boxes()));
await p.keyboard.press('Escape');
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(600);
check(JSON.stringify(await boxes()) === JSON.stringify([ONE]), 'Esc puts it back', JSON.stringify(await boxes()));
await p.getByTestId('btn-offsetface').click(); await p.getByTestId('modify-dialog').waitFor();
await clickWorld([20, 0, 5]); await settle(300);
await p.getByLabel('Distance').fill('5');
await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify(['0,-5,0,40,30,10']));
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(700);
check(JSON.stringify(await boxes()) === JSON.stringify(['0,-5,0,40,30,10']) && (await p.getByTestId('timeline').locator('[data-name^=OffsetFace]').count()) === 1, 'OK keeps it, with an Offset Face in the timeline', JSON.stringify(await boxes()));
await p.keyboard.press('Control+z');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify([ONE])), 'one Ctrl+Z undoes it');

// ---- Draft: tilt the front wall 5 degrees about the bottom
await p.getByTestId('btn-draft').click();
await p.getByTestId('modify-dialog').waitFor();
check(/DRAFT/.test(await text('modify-dialog')) && (await p.getByLabel('Neutral plane').count()) === 1 && (await p.getByLabel('Angle').count()) === 1, 'Draft asks for faces, a neutral plane and an angle');
await clickWorld([20, 0, 5]); await settle(300);
check(await waitTrue(async () => (await minYat(10)) === 0.87), 'the front wall leans in 0.87 mm at the top (10 x tan 5 degrees) and stays put at the bottom', `top ${await minYat(10)}, bottom ${await minYat(0)}`);
check((await minYat(0)) === 0, 'the bottom edge did not move');
await p.getByLabel('Angle').fill('-5');
check(await waitTrue(async () => (await minYat(10)) === -0.87), 'a negative angle leans it out', `top ${await minYat(10)}`);
await p.getByLabel('Neutral plane').selectOption('top');
check(await waitTrue(async () => (await minYat(0)) === 0.87 && (await minYat(10)) === 0), 'with the neutral plane at the top, the top stays and the bottom moves', `top ${await minYat(10)}, bottom ${await minYat(0)}`);
await p.getByLabel('Angle').fill('0');
await settle(1200);
check(JSON.stringify(await boxes()) === JSON.stringify([ONE]), 'an angle of zero is not accepted and the preview goes away');
await p.getByLabel('Angle').fill('5'); await p.getByLabel('Neutral plane').selectOption('bottom');
await waitTrue(async () => (await minYat(10)) === 0.87);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(700);
check((await minYat(10)) === 0.87 && (await p.getByTestId('timeline').locator('[data-name^=Draft]').count()) === 1, 'OK keeps it, with a Draft in the timeline');
await p.keyboard.press('Control+z');
await waitTrue(async () => (await minYat(10)) === 0);

// ---- Combine: a second block overlapping the first
await api([{ command: 'solid.box', params: { length: 20, width: 20, height: 20, corner: [30, 5, 0], operation: 'new' } }]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(1000);
const TWO = ['0,0,0,40,30,10', '30,5,0,50,25,20'];
check(JSON.stringify(await boxes()) === JSON.stringify(TWO), 'two overlapping blocks', JSON.stringify(await boxes()));
await p.getByTestId('btn-combine').click();
await p.getByTestId('modify-dialog').waitFor();
check(/COMBINE/.test(await text('modify-dialog')) && /Body2/.test(await text('edge-count')), 'Combine opens with Body1 as the target and Body2 as the tool');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify(['0,0,0,50,30,20'])), 'Join merges them into one body', JSON.stringify(await boxes()));
await p.screenshot({ path: `${shots}/c1-combine.png` });
await p.getByLabel('Operation').selectOption('cut');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify([ONE])), 'Cut removes the second block from the first', JSON.stringify(await boxes()));
await p.getByLabel('Keep tools').check();
check(await waitTrue(async () => (await boxes()).length === 2), 'Keep tools leaves the second block in place', JSON.stringify(await boxes()));
await p.getByLabel('Keep tools').uncheck();
await p.getByLabel('Operation').selectOption('intersect');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify(['30,5,0,40,25,10'])), 'Intersect keeps only where they overlap', JSON.stringify(await boxes()));
await p.getByLabel('Operation').selectOption('cut');
await p.getByLabel('Keep tools').check();
await waitTrue(async () => (await boxes()).length === 2 && (await boxes()).includes(ONE));
await clickWorld([45, 15, 20]); await settle(1200);
check(/Select a body/.test(await text('edge-count')) && JSON.stringify(await boxes()) === JSON.stringify(TWO), 'clicking the tool body deselects it and the preview goes away', await text('edge-count'));
await clickWorld([45, 15, 20]); await settle(500);
await p.getByLabel('Keep tools').uncheck();
await p.getByLabel('Operation').selectOption('join');
await waitTrue(async () => (await boxes()).length === 1);
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' });
await settle(700);
check(JSON.stringify(await boxes()) === JSON.stringify(['0,0,0,50,30,20']) && (await p.getByTestId('timeline').locator('[data-name^=Combine]').count()) === 1, 'OK keeps the joined body, with a Combine in the timeline', JSON.stringify(await boxes()));
await p.keyboard.press('Control+z');
check(await waitTrue(async () => JSON.stringify(await boxes()) === JSON.stringify(TWO)), 'one Ctrl+Z gives back the two blocks');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
