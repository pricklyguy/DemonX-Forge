// Real-browser check of Move / Copy, Split Body, Hole (create and edit), Thread and Rib against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/tools3.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const clickWorld = async (w) => { const [x, y] = await proj(w); await p.mouse.move(x, y); await p.mouse.click(x, y); };
const settle = (ms = 500) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
const waitTrue = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (await f()) return true; await settle(250); } return false; };
const boxes = () => p.evaluate(async () => (await (await fetch('/api/state')).json()).bodies.map((b) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < b.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.positions[i]); hi[i % 3] = Math.max(hi[i % 3], b.positions[i]); } return [...lo, ...hi].map((v) => Math.round(v)).join(','); }).sort());
const same = async (list) => JSON.stringify(await boxes()) === JSON.stringify(list);
const faces = async () => (await state()).bodies[0]?.faces.length ?? 0;
const reload = async () => { await p.reload(); await p.getByTestId('timeline').waitFor({ timeout: 30000 }); await settle(1000); };
const names = async () => (await state()).timeline.map((t) => t.name);

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }]);
await reload();
const ONE = '0,0,0,40,30,10';

// ---------------- Move / Copy
await p.getByTestId('btn-move').click(); await p.getByTestId('modify-dialog').waitFor();
check(/MOVE/.test(await text('modify-dialog')) && /Body1/.test(await text('edge-count')), 'Move / Copy opens with the only body chosen');
await p.getByLabel('Move X', { exact: true }).fill('50');
check(await waitTrue(async () => await same(['50,0,0,90,30,10'])), 'a move of 50 in X shifts the body', JSON.stringify(await boxes()));
await p.getByLabel('Copy').check();
check(await waitTrue(async () => await same([ONE, '50,0,0,90,30,10'])), 'Copy keeps the original and adds a moved copy', JSON.stringify(await boxes()));
await p.getByLabel('Copy').uncheck(); await p.getByLabel('Move X', { exact: true }).fill('0');
await p.getByLabel('Turn about').selectOption('Z'); await p.getByLabel('Turn angle').fill('90');
check(await waitTrue(async () => await same(['-30,0,0,0,40,10'])), 'a 90 degree turn about Z (through the origin)', JSON.stringify(await boxes()));
await p.getByLabel('Turn angle').fill('0');
await settle(1500);
check(await same([ONE]), 'a move of nothing is not accepted: the preview goes away');
await p.getByLabel('Turn about').selectOption('none'); await p.getByLabel('Move Z', { exact: true }).fill('5');
await waitTrue(async () => await same(['0,0,5,40,30,15']));
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check(await same(['0,0,5,40,30,15']) && (await names()).some((n) => /^Move/.test(n)), 'OK keeps it with a Move in the timeline', JSON.stringify(await boxes()));
await p.keyboard.press('Control+z');
check(await waitTrue(async () => await same([ONE])), 'one Ctrl+Z undoes it');

// ---------------- Split Body
await p.getByTestId('btn-split').click(); await p.getByTestId('modify-dialog').waitFor();
check(/SPLIT/.test(await text('modify-dialog')), 'Split Body opens its dialog');
await p.getByLabel('Position', { exact: true }).fill('15');
check(await waitTrue(async () => await same(['0,0,0,15,30,10', '15,0,0,40,30,10'])), 'a plane at x = 15 cuts it into two bodies', JSON.stringify(await boxes()));
await p.getByLabel('Cut across').selectOption('Z'); await p.getByLabel('Position', { exact: true }).fill('4');
check(await waitTrue(async () => await same(['0,0,0,40,30,4', '0,0,4,40,30,10'])), 'a plane at z = 4 instead', JSON.stringify(await boxes()));
await p.getByLabel('Position', { exact: true }).fill('50');
await settle(1500);
check((await boxes()).length === 1 && /Step 1/.test(await text('error').catch(() => '')), 'a plane that misses the body is refused with the engine\'s reason', await text('error').catch(() => ''));
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(600);
check(await same([ONE]), 'Esc leaves the one body');

// ---------------- Hole: create, then edit
await p.getByTestId('btn-hole').click(); await p.getByTestId('modify-dialog').waitFor();
check(/HOLE/.test(await text('modify-dialog')) && /Select a face/.test(await text('edge-count')), 'Hole opens asking for a face');
const f0 = await faces();
await clickWorld([30, 5, 10]); await settle(400); // away from the dialog, which covers the middle of the part
check(/1 selected/.test(await text('edge-count')) && (await p.getByLabel('Position X').inputValue()) !== '', 'clicking the top face selects it and fills in the position', `${await p.getByLabel('Position X').inputValue()},${await p.getByLabel('Position Y').inputValue()}`);
await p.getByLabel('Position X').fill('12'); await p.getByLabel('Position Y').fill('15'); await p.getByLabel('Position Z').fill('10');
await p.getByLabel('Diameter', { exact: true }).fill('6');
check(await waitTrue(async () => (await faces()) > f0), 'the preview drills the hole', `${f0} -> ${await faces()}`);
await p.getByLabel('Depth').fill('4');
await settle(1500);
const blind = await faces();
check(blind > f0, 'with a depth of 4 it is a blind hole', `${blind} faces`);
await p.screenshot({ path: `${shots}/t1-hole.png` });
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check((await names()).includes('Hole1'), 'OK keeps it: Hole1 in the timeline');
// edit it from the timeline
await p.getByTestId('timeline').locator('[data-name=Hole1]').dblclick();
await p.getByTestId('modify-dialog').waitFor({ timeout: 15000 });
check(/Hole1/.test(await text('edge-count')) && (await p.getByLabel('Diameter', { exact: true }).inputValue()) === '6' && (await p.getByLabel('Depth').inputValue()) === '4', 'double-clicking the hole opens it with its diameter 6 and depth 4');
await p.getByLabel('Diameter', { exact: true }).fill('9'); await p.getByLabel('Position X').fill('14'); await p.getByLabel('Depth').fill('');
await settle(1800);
const wide = (await state()).bodies[0];
const maxHole = (() => { const cyl = wide.faces.filter((f) => f.cylinder).map((f) => f.cylinder.radius); return Math.max(...cyl); })();
check(Math.abs(maxHole - 4.5) < 0.01, 'the preview shows a hole of radius 4.5', `${maxHole}`);
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
const tl = (await state()).timeline.filter((t) => /Hole/.test(t.name)).length;
check(tl === 1, 'editing changed the hole in place: still one Hole in the timeline', `${tl}`);
await p.keyboard.press('Control+z'); await settle(1200);
const back = (await state()).bodies[0].faces.filter((f) => f.cylinder).map((f) => +f.cylinder.radius.toFixed(2));
check(back.length > 0 && Math.max(...back) === 3, 'one Ctrl+Z puts the hole back to diameter 6', JSON.stringify(back));
await p.getByTestId('timeline').locator('[data-name=Hole1]').dblclick(); await p.getByTestId('modify-dialog').waitFor();
await p.getByLabel('Hole type').selectOption('counterbore'); await p.getByLabel('Counterbore diameter').fill('12'); await p.getByLabel('Counterbore depth').fill('2');
await settle(1800);
check((await state()).bodies[0].faces.some((f) => f.cylinder && Math.abs(f.cylinder.radius - 6) < 0.01), 'a counterbore of diameter 12 appears');
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(800);
check((await state()).bodies[0].faces.every((f) => !f.cylinder || f.cylinder.radius < 5), 'Esc takes the counterbore back out');
await p.keyboard.press('Control+z'); await settle(1000);

// ---------------- Thread: on a hole wall
await api([{ command: 'solid.hole', params: { position: [30, 12, 10], diameter: 10 } }]);
await reload();
await p.getByTestId('btn-thread').click(); await p.getByTestId('modify-dialog').waitFor();
check(/THREAD/.test(await text('modify-dialog')), 'Thread opens its dialog');
await settle(800);
await clickWorld([37, 4, 10]); await settle(500);   // the flat top: not round
check(/not round/.test(await text('error').catch(() => '')), 'clicking a flat face says it is not round', await text('error').catch(() => ''));
for (let k = 0; k < 12 && !/1 selected/.test(await text('edge-count')); k++) { // somewhere round the hole's wall faces the camera
  const t = (k * Math.PI) / 6;
  await clickWorld([30 + 4.8 * Math.cos(t), 12 + 4.8 * Math.sin(t), 8]); await settle(350);
}
check(/1 selected/.test(await text('edge-count')), 'clicking the hole wall selects it', await text('edge-count'));
await p.getByLabel('Thread size').fill('M20');
await settle(1800);
check(/does not fit/.test(await text('error').catch(() => '')) && !(await names()).some((n) => /Thread/.test(n)), 'an M20 thread on a 10 mm hole is refused with the reason', await text('error').catch(() => ''));
await p.getByLabel('Thread size').fill('M10');
await settle(1800);
check((await names()).some((n) => /Thread/.test(n)), 'the preview adds a Thread to the timeline', JSON.stringify(await names()));
await p.getByTestId('modify-ok').click(); await settle(1500);
await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check((await names()).filter((n) => /Thread/.test(n)).length === 1, 'OK keeps exactly one Thread');
await p.keyboard.press('Control+z'); await settle(1000);
check(!(await names()).some((n) => /Thread/.test(n)), 'one Ctrl+Z removes it');

// ---------------- Rib: a wall grown from a line on the floor of an open box
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 20, corner: [0, 0, 0] } }, { command: 'solid.shell', params: { faces: [[20, 15, 20]], thickness: 2 } },
  { command: 'sketch.create', params: { plane: 'XZ', name: 'RibLine', offset: 15 } }, { command: 'sketch.line', params: { points: [[2, -2], [38, -2]] } }, { command: 'sketch.finish' }]);
await reload();
const f11 = await faces();
check(f11 === 11, 'an open box (11 faces) and a line across its floor', `${f11}`);
await p.getByTestId('btn-rib').click(); await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
check(/RIB/.test(await text('extrude-dialog')) && (await p.getByLabel('Rib thickness').count()) === 1 && (await p.getByLabel('Rib sketch').innerText()).includes('RibLine'), 'Rib opens with the sketch, a thickness and a depth');
await p.getByLabel('Rib depth').fill('');
await settle(1800);
check(/give a depth/.test(await text('error').catch(() => '')) || (await faces()) === f11, 'with no depth the engine says it needs one', await text('error').catch(() => ''));
await p.getByLabel('Rib depth').fill('8');
check(await waitTrue(async () => (await faces()) > f11), 'a depth of 8 grows the rib: more faces', `${f11} -> ${await faces()}`);
await p.screenshot({ path: `${shots}/t2-rib.png` });
await p.getByLabel('Rib thickness').fill('0');
await settle(1500);
check((await faces()) === f11, 'a thickness of zero is not accepted and the preview goes away', `${await faces()}`);
await p.getByLabel('Rib thickness').fill('3');
await waitTrue(async () => (await faces()) > f11);
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(700);
check((await faces()) > f11 && (await names()).some((n) => /^Rib/.test(n)), 'OK keeps it with a Rib in the timeline', JSON.stringify(await names()));
await p.keyboard.press('Control+z');
check(await waitTrue(async () => (await faces()) === f11), 'one Ctrl+Z undoes it');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
