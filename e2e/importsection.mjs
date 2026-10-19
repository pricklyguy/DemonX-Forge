// Real-browser check of File > Import STEP / IGES and File > Export > Section through a body against the real engine: export a plate with a hole as STEP, bring it back in as a component, refuse a junk file, and export a section through the hole as DXF.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/presspull.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
const p = await ctx.newPage();
await p.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; }); // a plain download
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
const api = (steps) => p.evaluate(async (steps) => { const r = await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); return r.ok; }, steps);
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const menu = async (label) => { await p.getByTestId('file-menu').click(); await p.getByTestId('context-menu').waitFor(); await p.getByTestId('context-menu').getByRole('button', { name: label, exact: true }).click(); };
const dir = mkdtempSync(join(tmpdir(), 'forge-e2e-'));
await api([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 8 } }, { command: 'sketch.finish' },
  { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(1000);
const box = (st) => { const q = st.bodies[0].positions; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < q.length; i++) { lo[i % 3] = Math.min(lo[i % 3], q[i]); hi[i % 3] = Math.max(hi[i % 3], q[i]); } return [...lo, ...hi].map((v) => Math.round(v)).join(','); };
const original = box(await state());

// ---- a STEP file from the app itself, then a fresh design, then Import
const stepBytes = await p.evaluate(async () => { const r = await fetch('/api/export', { method: 'POST', body: JSON.stringify({ format: 'step' }) }); return Array.from(new Uint8Array(await r.arrayBuffer())); });
const stepFile = join(dir, 'Plate One.step'); writeFileSync(stepFile, Buffer.from(stepBytes));
check(stepBytes.length > 500, 'a STEP file was exported', `${stepBytes.length} bytes`);
await p.evaluate(() => fetch('/api/new', { method: 'POST', body: '{}' }));
await p.reload(); await p.getByTestId('demo').waitFor({ timeout: 30000 }); await settle(800);
check((await state()).bodies.length === 0, 'a fresh, empty design');
let chooser = p.waitForEvent('filechooser');
await menu('Import STEP / IGES…');
await (await chooser).setFiles(stepFile);
check(await (async () => { for (let i = 0; i < 60; i++) { if ((await state()).bodies.length === 1) return true; await settle(250); } return false; })(), 'Import brings the part in as a body');
const imported = await state();
check(box(imported) === original, 'with the same size and place as the original', `${box(imported)} vs ${original}`);
check(imported.bodies[0].faces.length === 7, 'and the same faces (4 sides, top, bottom and the hole as one round face)', `${imported.bodies[0].faces.length}`);
await p.screenshot({ path: `${shots}/i1-imported.png` });

// ---- a file that is not a STEP file
const junk = join(dir, 'junk.step'); writeFileSync(junk, 'this is not a STEP file');
chooser = p.waitForEvent('filechooser');
await menu('Import STEP / IGES…');
await (await chooser).setFiles(junk);
await p.getByTestId('error').waitFor({ timeout: 15000 });
check(/Nothing was changed|could not|invalid|not/i.test(await text('error')) && (await state()).bodies.length === 1, 'a junk file is refused with a reason and the design is left alone', await text('error'));
const wrongType = join(dir, 'notes.txt'); writeFileSync(wrongType, 'hello');
chooser = p.waitForEvent('filechooser');
await menu('Import STEP / IGES…');
await (await chooser).setFiles(wrongType);
await settle(1200);
check(/STEP|IGES/.test(await text('error')) , 'a .txt file is refused by name', await text('error'));

// ---- Section through the hole
await p.keyboard.press('Escape');
await menu('Section through a body…');
await p.getByTestId('section-dialog').waitFor();
await p.getByLabel('Section plane').selectOption('XZ');
await p.getByLabel('Section position').fill('15');
const dl = p.waitForEvent('download');
await p.getByTestId('section-ok').click();
const d = await dl;
check(/section\.dxf$/.test(d.suggestedFilename()), 'it downloads a section.dxf', d.suggestedFilename());
const dxf = readFileSync(await d.path(), 'utf8').split(/\r?\n/).map((l) => l.trim());
let nLine = 0, ys = [];
for (let i = dxf.indexOf('ENTITIES'); i < dxf.length - 1 && dxf[i] !== 'ENDSEC'; i++) {
  if (dxf[i] === '0' && dxf[i + 1] === 'LINE') { nLine++; for (let k = i + 2; k < dxf.length - 1 && dxf[k] !== '0'; k += 2) if (dxf[k] === '20' || dxf[k] === '21') ys.push(Number(dxf[k + 1])); }
}
check(nLine >= 6, 'the file has the lines of the two sides of the hole (the imported solid is cut as a mesh, so a few more pieces than the original)', `${nLine}`);
check(Math.min(...ys) === 0 && Math.max(...ys) === 10, 'standing up, 10 mm tall', `${Math.min(...ys)}..${Math.max(...ys)}`);
await settle(500);
const after = await state();
check(after.sketches.length === 0 && after.bodies.length === 1, 'the design is as it was: no extra sketch', `${after.sketches.length} sketches`);
await p.getByTestId('section-dialog').waitFor({ state: 'detached' });
check(true, 'the dialog closed after exporting');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
