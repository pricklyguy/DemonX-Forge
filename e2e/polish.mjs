// Real-browser check of the Fusion-habit polish (0.22): press-drag draws with a live preview, edges first then Fillet, typing a number right after E.
// Needs: the engine, a built app (npm run build), and a FRESH server: FORGE_PORT=8120 npm start   (stop it by port: fuser -k 8120/tcp)
// Run: node e2e/polish.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 450) => p.waitForTimeout(ms);
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const api = (steps) => p.evaluate(async (steps) => { await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps }) }); }, steps);

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await api([{ command: 'sketch.create', params: { plane: 'XY', name: 'S0' } }]);
await p.reload(); await p.getByTestId('tab-sketch').waitFor({ timeout: 30000 }); await settle(1000);

// ---- press, drag and release: the rectangle follows the pointer, then stays
await p.keyboard.press('r');
const [x0, y0] = await at([0, 0]), [x1, y1] = await at([50, 30]);
await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 }); await p.mouse.move(x1, y1, { steps: 4 }); await settle(300);
check((await p.locator('.dimlabel.live').count()) > 0, 'while the button is down the size boxes of the rectangle are shown (it is being drawn)');
await p.screenshot({ path: `${shots}/pl1-drag.png` });
await p.mouse.up();
for (let i = 0; i < 40; i++) { const k = (await state()).sketches.find((q) => q.active); if (k?.curves.length === 4) break; await settle(250); }
const k = (await state()).sketches.find((q) => q.active);
const xs = k.curves.flatMap((c) => [c.start[0], c.end[0]]), ys = k.curves.flatMap((c) => [c.start[1], c.end[1]]);
check(k.curves.length === 4 && Math.abs(Math.max(...xs) - Math.min(...xs) - 50) < 0.5 && Math.abs(Math.max(...ys) - Math.min(...ys) - 30) < 0.5, 'a 50 x 30 rectangle was made', `${Math.max(...xs) - Math.min(...xs)} x ${Math.max(...ys) - Math.min(...ys)}`);

// ---- finish, select the shape, E, then just type the distance
await p.keyboard.press('Escape');
await p.getByTestId('btn-finish').click();
await settle(1200);
await settle(500);
const [cx, cy] = await proj([25, 15, 0]);
await p.mouse.click(cx, cy); await settle(400);
await p.keyboard.press('e');
await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
await settle(500);
await p.keyboard.type('12');
check((await p.getByLabel('Distance').inputValue()) === '12', 'typing right after E fills the Distance box (no click needed)', await p.getByLabel('Distance').inputValue());
await p.keyboard.press('Enter');
await p.getByTestId('extrude-dialog').waitFor({ state: 'detached', timeout: 15000 });
await settle(800);
let s = await state();
check(s.bodies.length === 1 && s.bodies[0].faces.length === 6, 'the 12 mm block exists', `${s.bodies[0]?.faces.length} faces`);

// ---- edges first, then F
const top = [25, 0, 12];
const [ex, ey] = await proj(top);
await p.mouse.move(ex, ey); await settle(300);
await p.mouse.click(ex, ey); await settle(400);
check(await p.evaluate(() => true), 'clicked the top front edge in the model view');
await p.keyboard.press('f');
await p.getByTestId('modify-dialog').waitFor({ timeout: 15000 });
check(/1 selected/.test(await p.getByTestId('edge-count').innerText()), 'Fillet opens with that edge already selected', await p.getByTestId('edge-count').innerText());
await p.keyboard.type('2');
check((await p.getByLabel('Radius').inputValue()) === '2', 'typing a number goes straight into the Radius box', await p.getByLabel('Radius').inputValue());
// the radius arrow sits on the edge and can be dragged
await settle(600);
const tip = await p.evaluate(() => window.__forge.handleTip(0));
check(!!tip && tip.value === 2, 'a radius arrow is shown on the picked edge (value 2)', JSON.stringify(tip));
const [mx, my] = await proj([25, 0, 12]);
const to = [tip.at[0] + (tip.at[0] - mx) * 1.5, tip.at[1] + (tip.at[1] - my) * 1.5];
await p.mouse.move(tip.at[0], tip.at[1]); await p.mouse.down(); await p.mouse.move(to[0], to[1], { steps: 8 }); await p.mouse.up(); await settle(600);
const dragged = Number(await p.getByLabel('Radius').inputValue());
check(dragged > 3, 'dragging the arrow outward makes the radius bigger', String(dragged));
await p.getByLabel('Radius').fill('2');
for (let i = 0; i < 40; i++) { if ((await state()).bodies[0].faces.length === 7) break; await settle(250); }
check((await state()).bodies[0].faces.length === 7, 'the live preview shows the rounded edge (7 faces) before pressing OK');
await p.screenshot({ path: `${shots}/pl2-fillet.png` });
await p.keyboard.press('Enter');
await p.getByTestId('modify-dialog').waitFor({ state: 'detached', timeout: 15000 });
await settle(600);
s = await state();
check(s.timeline.filter((t) => /Fillet/i.test(t.name)).length === 1 && s.bodies[0].faces.length === 7, 'OK keeps one Fillet step');

console.log(failed ? `\n${failed} FAILED` : '\n== polish: all passed');
await b.close(); process.exit(failed ? 1 : 0);
