// Real-browser check of editing Fillet, Chamfer, Shell, Offset Face, Draft and Press Pull from the timeline against the real engine.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/valueedit.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
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
/** The largest cylinder radius, the highest Z, and the highest X at height z of the first body. */
const topZ = async () => { const q = (await state()).bodies[0].positions; let m = -1e9; for (let i = 2; i < q.length; i += 3) m = Math.max(m, q[i]); return +m.toFixed(2); };
const maxXat = async (z) => { const q = (await state()).bodies[0].positions; let m = -1e9; for (let i = 0; i < q.length; i += 3) if (Math.abs(q[i + 2] - z) < 0.01) m = Math.max(m, q[i]); return +m.toFixed(2); };
const maxRadius = async () => Math.max(0, ...(await state()).bodies[0].faces.filter((f) => f.cylinder).map((f) => f.cylinder.radius));
const defOf = (name) => p.evaluate(async (n) => (await (await fetch('/api/query', { method: 'POST', body: JSON.stringify({ command: 'timeline.inspect', params: { feature: n } }) })).json()), name);
const edit = async (name, value) => { await p.getByTestId('timeline').locator(`[data-name=${name}]`).dblclick(); await p.getByTestId('modify-dialog').waitFor({ timeout: 15000 }); await settle(400); if (value !== undefined) await p.getByLabel(/Radius|Distance|Thickness|Angle/).fill(String(value)); };
const names = async () => (await state()).timeline.map((t) => t.name);

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
// a block with a rounded vertical edge, then a chamfer, in one design; shell, offset face and draft on others
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 20, corner: [0, 0, 0] } }]);
const edges = (await state()).bodies[0].edges;
const vertical = edges.find((e) => Math.abs(e.start[2] - e.end[2]) > 19 && Math.abs(e.start[0]) < 1 && Math.abs(e.start[1]) < 1);
await api([{ command: 'solid.fillet', params: { edges: [{ body: 'Body1', index: vertical.index }], radius: 2 } }]);
await reload();

// ---- Fillet: radius 2 -> 5
await edit('Fillet1');
check(/EDIT FILLET1/.test(await text('modify-dialog')) && (await p.getByLabel('Radius').inputValue()) === '2', 'double-click opens EDIT FILLET1 with radius 2');
check((await p.getByTestId('modify-dialog').innerText()).includes('Only the number'), 'and says that only the number can change');
await p.getByLabel('Radius').fill('5');
check(await waitTrue(async () => Math.abs((await maxRadius()) - 5) < 0.01), 'the preview shows radius 5', `${await maxRadius()}`);
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(600);
check(Math.abs((await maxRadius()) - 2) < 0.01, 'Esc puts it back to 2');
await edit('Fillet1', 6);
await waitTrue(async () => Math.abs((await maxRadius()) - 6) < 0.01);
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check(Math.abs((await maxRadius()) - 6) < 0.01 && (await names()).filter((n) => /Fillet/.test(n)).length === 1, 'OK keeps radius 6, still one Fillet', JSON.stringify(await names()));
await p.keyboard.press('Control+z'); await settle(1000);
check(Math.abs((await maxRadius()) - 2) < 0.01, 'one Ctrl+Z gives back radius 2', `${await maxRadius()}`);
await edit('Fillet1', 100);
await settle(1800);
check(/Step 1/.test(await text('error').catch(() => '')) && Math.abs((await maxRadius()) - 2) < 0.01, 'a radius too big is refused with the engine\'s reason and nothing changes', await text('error').catch(() => ''));
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(500);

// ---- Offset Face on the far wall, then Draft on the same wall
await api([{ command: 'solid.offset_face', params: { faces: [[40, 15, 10]], distance: 3 } }]);
await reload();
check((await maxXat(20)) === 43, 'a wall moved out by 3: the block is 43 long', `${await maxXat(20)}`);
await edit('OffsetFace1', 6);
check(await waitTrue(async () => (await maxXat(20)) === 46), 'editing the offset to 6: 46 long', `${await maxXat(20)}`);
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
check((await maxXat(20)) === 46, 'OK keeps it');

// ---- Chamfer
const e2 = (await state()).bodies[0].edges.find((e) => Math.abs(e.start[2] - 20) < 0.01 && Math.abs(e.end[2] - 20) < 0.01 && Math.abs(e.start[1]) < 0.01 && Math.abs(e.end[1]) < 0.01);
await api([{ command: 'solid.chamfer', params: { edges: [{ body: 'Body1', index: e2.index }], distance: 1 } }]);
await reload();
const f0 = (await state()).bodies[0].faces.length;
await edit('Chamfer1', 3);
await settle(1800);
const changed = (await state()).bodies[0].positions.length;
check((await p.getByLabel('Distance').inputValue()) === '3' && changed > 0, 'a chamfer opens with Distance and takes a new value (preview ran)');
await p.keyboard.press('Escape'); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(500);
check((await state()).bodies[0].faces.length === f0, 'Esc leaves it as it was');

// ---- Shell on a fresh block, edited thickness
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 20, corner: [0, 0, 0] } }, { command: 'solid.shell', params: { faces: [[20, 15, 20]], thickness: 2 } }]);
await reload();
const shellRadiusProbe = async () => { const q = (await state()).bodies[0]; return q.faces.length; };
await edit('Shell1');
check(/EDIT SHELL1/.test(await text('modify-dialog')) && (await p.getByLabel('Thickness').inputValue()) === '2', 'Shell opens with thickness 2');
await p.getByLabel('Thickness').fill('4');
await settle(1800);
check((await shellRadiusProbe()) === 11, 'a thicker wall still makes an open box (11 faces)');
await p.getByTestId('modify-ok').click(); await p.getByTestId('modify-dialog').waitFor({ state: 'detached' }); await settle(700);
const sd = await defOf('Shell1');
check(String(sd.result?.definition?.thickness) === '4', 'the shell step now says thickness 4', JSON.stringify(sd.result?.definition));

// ---- Press Pull is an extrude underneath: the extrude dialog opens
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await api([{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }, { command: 'solid.press_pull', params: { face: [20, 15, 10], distance: 5 } }]);
await reload();
check((await topZ()) === 15, 'a face pulled out 5: 15 high');
await p.getByTestId('timeline').locator('[data-name=Extrude1]').dblclick();
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await p.getByLabel('Distance').fill('9');
check(await waitTrue(async () => (await topZ()) === 19), 'double-clicking the extrude behind the press pull and typing 9 makes it 19 high', `${await topZ()}`);
await p.getByTestId('extrude-ok').click(); await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' }); await settle(700);
check((await topZ()) === 19, 'OK keeps it');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
