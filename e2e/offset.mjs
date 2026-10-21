// Real-browser check of Offset on a whole outline against the real engine: pick one side of a five-sided shape, move the pointer inside (or outside)
// and click: every side moves, toward the pointer; a typed distance goes the way the pointer is, and a negative one the other way.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/offset.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 450) => p.waitForTimeout(ms);
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const sketch = async () => (await p.evaluate(async () => (await fetch('/api/state')).json())).sketches.find((k) => k.active);
const waitTrue = async (f) => { for (let i = 0; i < 60; i++) { if (await f()) return true; await settle(250); } return false; };
const move = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y, { steps: 4 }); await settle(250); };
const click = async (q) => { await move(q); const [x, y] = await at(q); await p.mouse.click(x, y); await settle(300); };
const solid = (k) => k.curves.filter((c) => c.type === 'line' && !c.construction);
const centroid = (cs) => { const pts = cs.flatMap((c) => [c.start, c.end]); return [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length]; };

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.evaluate(() => fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps: [{ command: 'sketch.create', params: { plane: 'XY', name: 'S1' } }, { command: 'sketch.line', params: { points: [[0, 0], [50, 0], [60, 40], [20, 60], [-10, 30], [0, 0]] } }] }) }));
await p.reload(); await p.getByTestId('tab-sketch').waitFor({ timeout: 30000 }); await settle(800);
check(solid(await sketch()).length === 5, 'a five-sided outline is in the open sketch');

// ---- inside: one click on a side, the pointer inside, a click
await p.getByTestId('tool-offset').click();
await click([52.5, 10]);
await move([40, 12]);
await p.screenshot({ path: `${shots}/o1-preview.png` });
await click([40, 12]);
let k = await sketch(); let ls = solid(k);
check(ls.length === 10, 'all five sides were offset (10 lines now), not just the one clicked', `${ls.length}`);
const orig = ls.slice(0, 5), copy = ls.slice(5);
const c0 = centroid(orig), c1 = centroid(copy);
check(Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) < 3, 'the new outline sits inside the old one (the same middle)', `${c0.map((v) => v.toFixed(1))} vs ${c1.map((v) => v.toFixed(1))}`);
const xs = (cs) => cs.flatMap((c) => [c.start[0], c.end[0]]);
check(Math.max(...xs(copy)) < Math.max(...xs(orig)) && Math.min(...xs(copy)) > Math.min(...xs(orig)), 'and is smaller than it');
await p.screenshot({ path: `${shots}/o2-inside.png` });

// ---- outside, with a typed distance
await p.keyboard.press('Control+z'); await settle(600);
check(solid(await sketch()).length === 5, 'one Ctrl+Z takes the offset away');
await p.getByTestId('tool-offset').click().catch(() => {});
await click([52.5, 10]);
await move([70, 10]);
await p.keyboard.type('7'); await settle(200);
await p.keyboard.press('Backspace'); await settle(200);
check((await p.getByLabel('Offset distance').inputValue()) === '', 'the typed digit can be deleted: the box can be emptied', await p.getByLabel('Offset distance').inputValue());
await p.keyboard.type('4'); await p.getByLabel('Offset distance').press('Enter'); await settle(600);
k = await sketch(); ls = solid(k);
check(ls.length === 10, 'a typed distance with the pointer outside offsets every side', `${ls.length}`);
check(await waitTrue(async () => { const l = solid(await sketch()); return Math.max(...xs(l)) > 64; }), 'and moves them out by 4 (the right-hand corner goes past 64)', `${Math.max(...xs(ls)).toFixed(1)}`);

await b.close();
console.log(failed ? `== offset: ${failed} FAILED` : '== offset: all passed');
process.exit(failed ? 1 : 0);
