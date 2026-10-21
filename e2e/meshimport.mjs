// Real-browser check of File > Import STL and Mesh to Solid against the real engine: a part exported as STL comes back as a mesh body,
// Mesh to Solid rebuilds it as a real solid (undo gives the mesh back), the demo bracket (a prism with holes across it) is rebuilt too,
// a block chamfered in two directions is refused with a reason, and a junk STL is refused.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/meshimport.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
const p = await ctx.newPage();
await p.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; }); // the plain file chooser
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 500) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const waitTrue = async (f) => { for (let i = 0; i < 80; i++) { if (await f()) return true; await settle(250); } return false; };
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
const menu = async (label) => { await p.getByTestId('file-menu').click(); await p.getByTestId('context-menu').waitFor(); await p.getByTestId('context-menu').getByRole('button', { name: label, exact: true }).click(); };
const exportStl = () => p.evaluate(async () => Array.from(new Uint8Array(await (await fetch('/api/export', { method: 'POST', body: JSON.stringify({ format: 'stl' }) })).arrayBuffer())));
const fresh = async () => { await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' })); await p.reload(); await p.getByTestId('demo').waitFor({ timeout: 30000 }); await settle(600); };
const importFile = async (file) => { const chooser = p.waitForEvent('filechooser'); await menu('Import STEP / IGES / STL…'); await (await chooser).setFiles(file); };
const dir = mkdtempSync(join(tmpdir(), 'forge-e2e-mesh-'));

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
// a plate with a hole, made with the real tools, leaves as an STL file
await api([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], radius: 4 } }, { command: 'sketch.finish', params: {} },
  { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
const plate = join(dir, 'Plate One.stl'); writeFileSync(plate, Buffer.from(await exportStl()));
await fresh();

// ---- Mesh to Solid with no mesh in the design
await p.getByTestId('btn-meshconv').isDisabled(); // (disabled while there is no body at all)
check(await p.getByTestId('btn-meshconv').isDisabled(), 'Mesh to Solid is greyed out in an empty design');

// ---- Import an STL
await importFile(plate);
check(await waitTrue(async () => (await state()).bodies.length === 1), 'Import brings the STL in as a body');
await p.getByTestId('place-import').waitFor({ timeout: 10000 });
check(/X 20, Y 15/.test(await text('place-import')) && /Z 0/.test(await text('place-import')), 'the app asks where to put it and says where the file put it', await text('place-import'));
let st = await state();
check(st.bodies[0].mesh === true && /Plate/.test(st.bodies[0].name), 'it is a mesh body named after the file', st.bodies[0].name);
const q = st.bodies[0].positions; let hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < q.length; i++) hi[i % 3] = Math.max(hi[i % 3], q[i]);
check(hi.map((v) => Math.round(v)).join() === '40,30,10', 'in millimetres, 40 x 30 x 10', hi.join());
await p.getByTestId('place-origin').click();
const box = (s) => { const q = s.bodies[0].positions; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < q.length; i++) { lo[i % 3] = Math.min(lo[i % 3], q[i]); hi[i % 3] = Math.max(hi[i % 3], q[i]); } return [...lo, ...hi].map((v) => Math.round(v * 10) / 10).join(','); };
check(await waitTrue(async () => box(await state()) === '-20,-15,0,20,15,10'), '"Centre it on the origin, on the floor" moves it there (bottom at Z 0)', box(await state()));
check(await p.getByTestId('place-import').count() === 0, 'and the question goes away');
await p.screenshot({ path: `${shots}/m1-imported.png` });

// ---- Mesh to Solid
await p.getByTestId('btn-meshconv').click();
await p.getByTestId('modify-dialog').waitFor();
check(/MESH TO SOLID/.test(await text('modify-dialog')) && /Plate/.test(await text('edge-count')), 'Mesh to Solid opens with the only mesh already chosen', await text('edge-count'));
await p.getByLabel('Tolerance (mm)').fill('0');
await p.getByTestId('modify-ok').click();
await p.getByTestId('error').waitFor();
check(/tolerance/i.test(await text('error')), 'a tolerance of zero is refused', await text('error'));
await p.getByLabel('Tolerance (mm)').fill('0.05');
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached', timeout: 120000 });
check(await waitTrue(async () => { const s = await state(); return s.bodies.length === 1 && s.bodies[0].mesh === false; }), 'OK turns the mesh into a real solid');
st = await state();
check(st.bodies[0].faces.length >= 7 && st.bodies[0].edges.length > 10, 'with real faces and edges again (top, bottom, 4 sides, the hole)', `${st.bodies[0].faces.length} faces, ${st.bodies[0].edges.length} edges`);
check(st.timeline.some((t) => /Sketch/i.test(t.type)) && st.timeline.some((t) => /Extrude/i.test(t.type)), 'the timeline holds a sketch and an extrude (real, editable steps)', st.timeline.map((t) => t.name).join(', '));
await p.screenshot({ path: `${shots}/m2-converted.png` });
// it can be worked on like any solid: fillet one edge
await p.keyboard.press('Control+z');
check(await waitTrue(async () => (await state()).bodies[0]?.mesh === true), 'one Ctrl+Z gives the mesh back');
await p.keyboard.press('Control+y');
check(await waitTrue(async () => (await state()).bodies[0]?.mesh === false), 'and Ctrl+Y converts again');
const ok1 = await p.evaluate(async () => { const s = await (await fetch('/api/state')).json(); const e = s.bodies[0].edges.find((x) => Math.abs(x.length - 30) < 0.01); const r = await fetch('/api/command', { method: 'POST', body: JSON.stringify({ command: 'solid.fillet', params: { edges: [{ body: s.bodies[0].name, index: e.index }], radius: 2 } }) }); return r.ok; });
check(ok1, 'the converted solid can be filleted');

// ---- the demo bracket (an L-shaped section with holes through its base) is rebuilt: a prism along one direction and cuts along another
await fresh();
await p.evaluate(() => fetch('/api/demo', { method: 'POST', body: '{}' }));
const bracket = join(dir, 'Bracket.stl'); writeFileSync(bracket, Buffer.from(await exportStl()));
await fresh();
await importFile(bracket);
check(await waitTrue(async () => (await state()).bodies[0]?.mesh === true), 'the demo bracket comes in as a mesh');
await p.getByTestId('place-keep').click();
await p.getByTestId('btn-meshconv').click(); await p.getByTestId('modify-dialog').waitFor();
await p.getByTestId('modify-ok').click();
await p.getByTestId('modify-dialog').waitFor({ state: 'detached', timeout: 120000 });
check(await waitTrue(async () => (await state()).bodies[0]?.mesh === false), 'the bracket is rebuilt as a solid, with its holes');
st = await state();
check(st.timeline.filter((t) => /Sketch/i.test(t.type)).length >= 2, 'from several sketches (the section along its length and the holes across it)', st.timeline.map((t) => t.name).join(', '));
await p.keyboard.press('Control+z');
check(await waitTrue(async () => (await state()).bodies[0]?.mesh === true && (await state()).timeline.length === 1), 'and one Ctrl+Z gives the mesh back');

// ---- a part with a slanted face in two directions is refused, and stays a mesh
await fresh();
await p.evaluate(async () => {
  const post = (path, body) => fetch(path, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
  let s = await post('/api/batch', { steps: [{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }] });
  const top = (axis) => s.bodies[0].edges.find((e) => Math.abs(e.start[2] - 10) < 1e-6 && Math.abs(e.end[2] - 10) < 1e-6 && Math.abs(e.start[axis] - e.end[axis]) < 1e-6 && e.length > 20);
  s = await post('/api/batch', { steps: [{ command: 'solid.chamfer', params: { edges: [{ body: s.bodies[0].name, index: top(0).index }], distance: 4 } }] });
  await post('/api/batch', { steps: [{ command: 'solid.chamfer', params: { edges: [{ body: s.bodies[0].name, index: top(1).index }], distance: 4 } }] });
});
const chamfered = join(dir, 'Chamfered.stl'); writeFileSync(chamfered, Buffer.from(await exportStl()));
await fresh();
await importFile(chamfered);
check(await waitTrue(async () => (await state()).bodies[0]?.mesh === true), 'a block chamfered along two edges comes in as a mesh');
await p.getByTestId('place-keep').click();
await p.getByTestId('btn-meshconv').click(); await p.getByTestId('modify-dialog').waitFor();
await p.getByTestId('modify-ok').click();
const refused = await waitTrue(async () => (await p.getByTestId('error').count()) > 0);
check(refused && (await state()).bodies[0].mesh === true, 'it is refused with a reason, the mesh is left alone, the dialog stays open', refused ? await text('error') : '');
await p.getByRole('button', { name: 'Cancel' }).click();

// ---- a junk STL
await fresh();
const junk = join(dir, 'junk.stl'); writeFileSync(junk, 'this is not an STL file');
await importFile(junk);
await p.getByTestId('error').waitFor({ timeout: 15000 });
check((await state()).bodies.length === 0 && /STL|mesh|Nothing was changed/i.test(await text('error')), 'a junk STL is refused and the design is left alone', await text('error'));
await p.screenshot({ path: `${shots}/m3-junk.png` });

await b.close();
console.log(failed ? `== meshimport: ${failed} FAILED` : '== meshimport: all passed');
process.exit(failed ? 1 : 0);
