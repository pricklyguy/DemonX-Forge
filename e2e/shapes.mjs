// Real-browser check of Scale, Coil, Pipe and Emboss against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/shapes.mjs      Screenshots go to $SHOTS (default /tmp).
import { pick, enabled } from './menu.mjs';
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 500) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
const waitTrue = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (await f()) return true; await settle(250); } return false; };
const reload = async () => { await p.reload(); await p.getByTestId('timeline').waitFor({ timeout: 30000 }); await settle(1000); };
const fresh = async () => { await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' })); };
const boxes = () => p.evaluate(async () => (await (await fetch('/api/state')).json()).bodies.map((b) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < b.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.positions[i]); hi[i % 3] = Math.max(hi[i % 3], b.positions[i]); } return [...lo, ...hi].map((v) => Math.round(v * 10) / 10).join(','); }).sort());
const is = async (list) => JSON.stringify(await boxes()) === JSON.stringify(list);
const waitIs = (list) => waitTrue(() => is(list));
const names = async () => (await state()).timeline.map((t) => t.name);

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });

// ---------------- Scale
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
await reload();
await pick(p, 'btn-scale'); await p.getByTestId('modify-dialog').waitFor();
check(/SCALE/.test(await text('modify-dialog')) && /Body1/.test(await text('edge-count')), 'Scale opens with the only body chosen');
check(await waitIs(['-20,-15,-5,60,45,15']), 'factor 2 about the middle of the body doubles it in place', JSON.stringify(await boxes()));
await p.getByLabel('About').selectOption('origin');
check(await waitIs(['0,0,0,80,60,20']), 'about the origin it grows away from the corner', JSON.stringify(await boxes()));
await p.getByLabel('Different in X, Y and Z').check();
await p.getByLabel('Factor X').fill('1'); await p.getByLabel('Factor Y').fill('2'); await p.getByLabel('Factor Z').fill('3');
check(await waitIs(['0,0,0,40,60,30']), 'uneven factors 1, 2, 3', JSON.stringify(await boxes()));
await p.getByLabel('Factor Z').fill('0');
await settle(1500);
check(await is(['0,0,0,40,30,10']), 'a factor of zero is not accepted and the preview goes away', JSON.stringify(await boxes()));
await p.getByLabel('Factor Z').fill('3');
await waitIs(['0,0,0,40,60,30']);
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check(await is(['0,0,0,40,60,30']) && (await names()).some((n) => /^Scale/.test(n)), 'OK keeps it with a Scale in the timeline');
await p.keyboard.press('Control+z');
check(await waitIs(['0,0,0,40,30,10']), 'one Ctrl+Z undoes it');

// ---------------- Coil (needs no body)
await fresh(); await reload();
await pick(p, 'btn-coil'); await p.getByTestId('modify-dialog').waitFor();
check(/COIL/.test(await text('modify-dialog')), 'Coil opens with no body in the design');
check(await waitIs(['-11.5,-11.5,-1.5,11.5,11.5,31.5']), 'the default coil: 20 across, 4 turns, 30 tall, wire 3', JSON.stringify(await boxes()));
await p.screenshot({ path: `${shots}/k1-coil.png` });
await p.getByLabel('Coil pitch').fill('6');
await settle(1500);
check(await is([]), 'turns, height and pitch all given is refused (exactly two): nothing is made', JSON.stringify(await boxes()));
await p.getByLabel('Coil height').fill('');
check(await waitTrue(async () => (await boxes()).length === 1), '4 turns at a pitch of 6 works');
await p.getByLabel('Coil axis').selectOption('X');
check(await waitTrue(async () => { const bx = (await boxes())[0]; return !!bx && bx.startsWith('0,') === true || (await boxes()).length === 1; }), 'a coil about the X axis');
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check((await names()).some((n) => /^Coil/.test(n)) && (await boxes()).length === 1, 'OK keeps it with a Coil in the timeline');
await p.keyboard.press('Control+z');
check(await waitIs([]), 'one Ctrl+Z undoes it');

// ---------------- Pipe
await fresh();
await api([{ command: 'sketch.create', params: { plane: 'XZ', name: 'Run' } }, { command: 'sketch.line', params: { points: [[0, 0], [0, -40]] } }, { command: 'sketch.finish' }]);
await reload();
await pick(p, 'btn-pipe'); await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/PIPE/.test(await text('extrude-dialog')) && (await p.getByLabel('Pipe path').innerText()).includes('Run'), 'Pipe opens with the sketch as the path');
check(await waitIs(['-3,-3,0,3,3,40']), 'a solid rod 6 across and 40 long', JSON.stringify(await boxes()));
await p.getByLabel('Pipe wall').fill('1'); await p.getByLabel('Pipe diameter').fill('10');
check(await waitIs(['-5,-5,0,5,5,40']), 'a hollow pipe 10 across with a 1 mm wall', JSON.stringify(await boxes()));
await p.getByLabel('Pipe diameter').fill('0');
await settle(1500);
check(await is([]), 'a diameter of zero is not accepted');
await p.getByLabel('Pipe diameter').fill('10');
await waitIs(['-5,-5,0,5,5,40']);
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(700);
check(await is(['-5,-5,0,5,5,40']) && (await names()).some((n) => /^Pipe/.test(n)), 'OK keeps it with a Pipe in the timeline');
await p.keyboard.press('Control+z');
check(await waitIs([]), 'one Ctrl+Z undoes it');

// ---------------- Emboss and deboss: a circle sketched on the top face
await fresh();
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
const top = (await state()).bodies[0].faces.find((f) => (f.planeNormal?.[2] ?? 0) > 0.9);
await api([{ command: 'sketch.create', params: { plane: { face: top.point, body: 'Body1', index: top.index }, name: 'Logo' } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 10 } }, { command: 'sketch.finish' }]);
await reload();
await pick(p, 'btn-emboss'); await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/EMBOSS/.test(await text('extrude-dialog')), 'Emboss opens');
await settle(500);
if (!/1 selected/.test(await text('profile-count'))) { // the face's own outline is a profile too, so the circle is clicked
  const [cx, cy] = await p.evaluate(() => window.__forge.project([20, 15, 10]));
  await p.mouse.move(cx, cy); await p.mouse.click(cx, cy); await settle(500);
}
check(/1 selected/.test(await text('profile-count')), 'the circle is chosen as the profile', await text('profile-count'));
check(await waitIs(['0,0,0,40,30,12']), 'raised 2 mm off the top', JSON.stringify(await boxes()));
await p.getByLabel('Emboss mode').selectOption('deboss');
await settle(1800);
const f9 = (await state()).bodies[0].faces.length;
check(await is(['0,0,0,40,30,10']) && f9 === 9, 'deboss cuts it in: the same height, 9 faces', `${f9}`);
await p.getByLabel('Emboss depth').fill('0');
await settle(1500);
check((await state()).bodies[0].faces.length === 6, 'a depth of zero is not accepted and the preview goes away', `${(await state()).bodies[0].faces.length}`);
await p.getByLabel('Emboss mode').selectOption('emboss'); await p.getByLabel('Emboss depth').fill('3');
await waitIs(['0,0,0,40,30,13']);
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(700);
check(await is(['0,0,0,40,30,13']) && (await names()).some((n) => /^Emboss/.test(n)), 'OK keeps it with an Emboss in the timeline');
await p.keyboard.press('Control+z');
check(await waitIs(['0,0,0,40,30,10']), 'one Ctrl+Z undoes it');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
