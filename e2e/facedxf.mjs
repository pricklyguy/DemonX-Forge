// Real-browser check of File > Export > Selected face as DXF against the real engine: export the top face of a plate with a hole as DXF and check the design is left untouched.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/presspull.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

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
await api([{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } }, { command: 'sketch.circle.center', params: { center: [20, 15], diameter: 8 } }, { command: 'sketch.finish' },
  { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 10, operation: 'new' } }]);
await p.reload();
await p.getByTestId('timeline').waitFor({ timeout: 30000 });
await settle(1000);
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const before = await state();
const menuItem = (label) => p.getByTestId('context-menu').getByRole('button', { name: label });

await p.getByTestId('file-menu').click(); await p.getByTestId('context-menu').waitFor();
check(await menuItem('Select a flat face first').isDisabled(), 'with no face selected the menu says to select one');
await p.keyboard.press('Escape'); await settle(300);

await clickWorld([30, 5, 10]); await settle(400);   // the top face, away from the hole
check(/Face \d+/.test(await text('selection')), 'a face is selected', await text('selection'));
await p.getByTestId('file-menu').click(); await p.getByTestId('context-menu').waitFor();
const item = menuItem(/Selected face/);
check(await item.isEnabled(), 'now the menu offers Selected face');
const dl = p.waitForEvent('download');
await item.click();
const d = await dl;
check(d.suggestedFilename() === 'Untitled face.dxf', 'it downloads "Untitled face.dxf"', d.suggestedFilename());
const path = await d.path();
const dxf = readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.trim());
const from = dxf.indexOf('ENTITIES'); const ents = {};
for (let i = from; i < dxf.length - 1; i++) { if (dxf[i] === 'ENDSEC') break; if (dxf[i] === '0' && /^[A-Z]+$/.test(dxf[i + 1])) ents[dxf[i + 1]] = (ents[dxf[i + 1]] ?? 0) + 1; }
check(ents.LINE === 4 && (ents.CIRCLE ?? 0) + (ents.ARC ?? 0) >= 1, 'the file has the four edges of the face and the hole', JSON.stringify(ents));
await settle(500);
const after = await state();
check(JSON.stringify(after.timeline.map((t) => t.name)) === JSON.stringify(before.timeline.map((t) => t.name)) && after.sketches.length === before.sketches.length, 'the design is as it was: no extra sketch or step', JSON.stringify(after.timeline.map((t) => t.name)));
check(after.bodies[0].faces.length === before.bodies[0].faces.length, 'and the body is unchanged');

await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
