// Real-browser check of angle and point-to-point / point-to-line sketch dimensions (Dimension tool, D).
// Needs: the engine, a built app (npm run build), and a FRESH server: FORGE_PORT=8120 npm start   (stop it by port: fuser -k 8120/tcp)
// Run: node e2e/dimensions2.mjs      Screenshots go to $SHOTS (default /tmp).
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
const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y, { steps: 3 }); await settle(200); await p.mouse.click(x, y); await settle(300); };
const near = (a, c, t = 0.05) => Math.abs(a - c) < t;
const lines = (k) => k.curves.filter((c) => c.type === 'line');
const ang = (l) => Math.atan2(l.end[1] - l.start[1], l.end[0] - l.start[0]);
const entry = async (v, option) => {
  await p.getByTestId('value-entry').waitFor({ timeout: 5000 });
  if (option) await p.getByTestId('value-option').selectOption(option);
  await p.getByLabel('Value').fill(String(v)); await p.keyboard.press('Enter'); await settle(1500);
};

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.evaluate(() => fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps: [
  { command: 'sketch.create', params: { plane: 'XY', name: 'S1' } },
  { command: 'sketch.line', params: { points: [[0, 0], [60, 0]] } },
  { command: 'sketch.line', params: { points: [[0, 0], [40, 30]] } },
  { command: 'sketch.line', params: { points: [[-40, 40], [-10, 55]] } },
] }) }));
await p.reload(); await p.getByTestId('tab-sketch').waitFor({ timeout: 30000 }); await settle(1000);

// ---- angle between two lines
await p.getByTestId('tool-dimension').click();
await click([45, 0]); // first line: the length box opens at once
await p.getByTestId('value-entry').waitFor({ timeout: 5000 });
await click([30, 22.5]); // second line
const title = await p.getByTestId('value-entry').innerText();
check(/Angle between/.test(title), 'a second line asks for an angle', title);
check(Math.abs(Number(await p.getByLabel('Value').inputValue()) - 36.87) < 0.05, 'it starts at the measured angle (36.87)', await p.getByLabel('Value').inputValue());
await entry(45);
let k = await sketch();
const [l1, l2] = [lines(k).find((l) => near(l.start[0], 0) && near(l.end[0], 60)), lines(k).find((l) => near(l.end[0] - l.start[0], 40, 20))];
const ls = lines(k).filter((l) => near(l.start[0], 0) && near(l.start[1], 0) || near(l.end[0], 0) && near(l.end[1], 0));
const a = Math.abs(ang(ls[0]) - ang(ls[1])) * 180 / Math.PI;
check(near(Math.min(a, 180 - a), 45, 0.1), 'the two lines are now 45 degrees apart', `${a}`);
check(k.dimensions.some((d) => d.kind === 'angle'), 'it is a driving angle dimension');
check((await p.locator('[data-testid=dimlabel]').allInnerTexts()).some((t) => t === '45°'), 'its label reads 45°');
await p.screenshot({ path: `${shots}/d2-angle.png` });

// ---- change it by double-clicking the label
await p.locator('[data-testid=dimlabel]', { hasText: '45°' }).dispatchEvent('dblclick');
await p.getByLabel('Dimension value').waitFor({ timeout: 5000 });
check((await p.getByLabel('Dimension value').inputValue()) === '45', 'double-click opens the number without the degree sign');
await p.keyboard.type('60'); await p.keyboard.press('Enter'); await settle(1500);
k = await sketch();
const ls2 = lines(k).filter((l) => near(l.start[0], 0) && near(l.start[1], 0) || near(l.end[0], 0) && near(l.end[1], 0));
const a2 = Math.abs(ang(ls2[0]) - ang(ls2[1])) * 180 / Math.PI;
check(near(Math.min(a2, 180 - a2), 60, 0.1), 'and the lines follow to 60 degrees', `${a2}`);

// ---- two points: horizontal distance
const free = lines(k).find((l) => l.start[0] < -30);
await p.keyboard.press('Escape'); await p.getByTestId('tool-dimension').click();
await click(free.start); await click(free.end);
check(/Distance between/.test(await p.getByTestId('value-entry').innerText()), 'two points ask for a distance');
await entry(40, 'Horizontal');
k = await sketch();
const f2 = lines(k).find((l) => Math.min(l.start[0], l.end[0]) < -30 && l.start[1] > 30);
check(near(Math.abs(f2.end[0] - f2.start[0]), 40, 0.05), 'the horizontal distance between its ends is 40', `${Math.abs(f2.end[0] - f2.start[0])}`);
check(k.dimensions.some((d) => d.kind === 'distance_x'), 'it is a horizontal-distance dimension');

console.log(failed ? `\n${failed} FAILED` : '\n== dimensions2: all passed');
await b.close(); process.exit(failed ? 1 : 0);
