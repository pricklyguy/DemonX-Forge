// Real-browser check of Sweep and Loft against the real engine: carry a circle along a path sketch and loft between two sketches, then Cancel, OK, undo.
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
// the sketches are made through the API (sketching itself is covered by sketch.mjs / sketch2.mjs); the dialogs are driven by hand
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
await api([
  { command: 'sketch.create', params: { plane: 'XY', name: 'Round' } }, { command: 'sketch.circle.center', params: { center: [0, 0], diameter: 10 } }, { command: 'sketch.finish' },
  { command: 'sketch.create', params: { plane: 'XZ', name: 'Rail' } }, { command: 'sketch.line', params: { points: [[0, 0], [0, -40]] } }, { command: 'sketch.finish' },
]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(800);

// ---- a sketch: a 20 x 10 rectangle standing 10 mm from the sketch's Y axis
const boxes = () => p.evaluate(async () => (await (await fetch('/api/state')).json()).bodies.map((b) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < b.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.positions[i]); hi[i % 3] = Math.max(hi[i % 3], b.positions[i]); } return [...lo, ...hi].map((v) => Math.round(v)).join(','); }));
const waitBoxes = async (v) => { for (let i = 0; i < 60; i++) { if (JSON.stringify(await boxes()) === JSON.stringify(v)) return; await settle(250); } };

// ---- Sweep: the circle (sketch Round) along the line (sketch Rail)
await p.getByTestId('btn-sweep').click();
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/SWEEP/.test(await text('extrude-dialog')) && (await p.getByLabel('Path').count()) === 1, 'Sweep opens a dialog with a Path');
check(/1 selected/.test(await text('profile-count')), 'the circle is already the profile');
check((await p.getByLabel('Path').innerText()).includes('Rail') && !(await p.getByLabel('Path').innerText()).includes('Round'), 'the path choices are the other sketches (Rail, not Round)');
await waitBoxes(['-5,-5,0,5,5,40']);
check(JSON.stringify(await boxes()) === JSON.stringify(['-5,-5,0,5,5,40']), 'the preview is a rod 10 across and 40 long', JSON.stringify(await boxes()));
await p.screenshot({ path: `${shots}/w1-sweep.png` });
await p.keyboard.press('Escape');
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(600);
check((await boxes()).length === 0, 'Esc removes the preview');
await p.getByTestId('btn-sweep').click(); await p.getByTestId('extrude-dialog').waitFor();
await waitBoxes(['-5,-5,0,5,5,40']);
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(700);
check(JSON.stringify(await boxes()) === JSON.stringify(['-5,-5,0,5,5,40']) && (await p.getByTestId('timeline').locator('[data-name^=Sweep]').count()) === 1, 'OK keeps it and there is a Sweep in the timeline');
await p.keyboard.press('Control+z'); await waitBoxes([]);
check((await boxes()).length === 0, 'one Ctrl+Z undoes it');
await p.keyboard.press('Control+y'); await waitBoxes(['-5,-5,0,5,5,40']);
check((await boxes()).length === 1, 'and Ctrl+Y brings it back');
await p.keyboard.press('Control+z'); await waitBoxes([]);

// ---- Loft: a square sketch 30 up from a circle
await api([
  { command: 'sketch.create', params: { plane: 'XY', name: 'Top', offset: 30 } }, { command: 'sketch.rectangle.two_point', params: { p0: [-10, -10], p1: [10, 10] } }, { command: 'sketch.finish' },
]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(800);
await p.getByTestId('btn-loft').click();
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/LOFT/.test(await text('extrude-dialog')) && /Select profiles/.test(await text('profile-count')), 'Loft opens asking for profiles');
const [cx, cy] = await proj([0, 0, 0]);
await p.mouse.move(cx, cy); await p.mouse.click(cx, cy); await settle(400);
check(/1 selected/.test(await text('profile-count')), 'clicking the circle picks it');
check((await boxes()).length === 0, 'one profile is not enough for a loft (nothing is made yet)');
const [sx, sy] = await proj([0, 0, 30]);
await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); await settle(400);
check(/2 selected/.test(await text('profile-count')), 'clicking the square picks it too (a second sketch)');
await waitBoxes(['-10,-10,0,10,10,30']);
check(JSON.stringify(await boxes()) === JSON.stringify(['-10,-10,0,10,10,30']), 'the preview is a solid from the circle up to the square', JSON.stringify(await boxes()));
await p.screenshot({ path: `${shots}/w2-loft.png` });
await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); await settle(1200);
check(/1 selected/.test(await text('profile-count')) && (await boxes()).length === 0, 'clicking the square again removes it and the preview goes away');
await p.mouse.move(sx, sy); await p.mouse.click(sx, sy);
await waitBoxes(['-10,-10,0,10,10,30']);
await p.getByTestId('extrude-ok').click();
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
await settle(700);
check(JSON.stringify(await boxes()) === JSON.stringify(['-10,-10,0,10,10,30']) && (await p.getByTestId('timeline').locator('[data-name^=Loft]').count()) === 1, 'OK keeps it and there is a Loft in the timeline');
await p.keyboard.press('Control+z'); await waitBoxes([]);
check((await boxes()).length === 0, 'one Ctrl+Z undoes it');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
