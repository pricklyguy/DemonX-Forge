// Real-browser check of the sizes shown on a sketch (Sketch Palette > Dimensions): measured sizes, double-click to change, driving dimensions, the check box.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/dimensions.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 500) => p.waitForTimeout(ms);
const state = () => p.evaluate(async () => (await fetch('/api/state')).json());
const waitTrue = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (await f()) return true; await settle(250); } return false; };
const near = (a, c, t = 0.01) => Math.abs(a - c) < t;
const texts = (sel) => p.locator(sel).allInnerTexts();

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.evaluate(async () => { await fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps: [
  { command: 'sketch.create', params: { plane: 'XY', name: 'Plate' } },
  { command: 'sketch.rectangle.two_point', params: { p0: [-50, -30], p1: [50, 30] } },
  { command: 'sketch.circle.center', params: { center: [-20, 5], diameter: 12 } },
  { command: 'sketch.circle.center', params: { center: [20, 5], diameter: 12 } },
] }) }); });
await p.reload(); await p.getByTestId('tab-sketch').waitFor({ timeout: 30000 }); await settle(1500);

const measured = await texts('[data-testid=measured]');
check(measured.length === 4 && measured.includes('100') && measured.includes('60') && measured.filter((t) => t === 'Ø12').length === 2, 'the sketch shows its sizes: 100 and 60 for the rectangle (one label per pair of sides) and Ø12 on each circle', JSON.stringify(measured));
await p.screenshot({ path: `${shots}/dm1-measured.png` });

// ---- the check box hides and shows them
const box = p.getByLabel('Dimensions', { exact: true });
check(await box.isChecked(), 'the Dimensions box in the Sketch Palette is ticked');
await box.uncheck(); await settle(500);
check((await p.locator('.dimlabel').count()) === 0, 'unticking it hides every size');
await box.check(); await settle(500);
check((await p.locator('[data-testid=measured]').count()) === 4, 'ticking it brings them back');

// ---- double-click a measured size and change it: the rectangle follows and the size becomes a real dimension
const wide = p.locator('[data-testid=measured]', { hasText: /^100$/ });
await wide.dblclick();
await p.getByLabel('Dimension value').waitFor({ timeout: 5000 });
check((await p.getByLabel('Dimension value').inputValue()) === '100', 'double-clicking opens the number in place (100), selected');
await p.keyboard.type('120'); await p.keyboard.press('Enter'); await settle(1500);
let sk = (await state()).sketches[0];
const xs = sk.curves.filter((c) => c.type === 'line').flatMap((c) => [c.start[0], c.end[0]]);
check(near(Math.max(...xs) - Math.min(...xs), 120, 0.05), 'the rectangle is now 120 wide', `${Math.max(...xs) - Math.min(...xs)}`);
check(sk.dimensions.length === 1 && near(sk.dimensions[0].value, 120), 'and that size is a driving dimension now', JSON.stringify(sk.dimensions.map((d) => d.value)));
check((await texts('[data-testid=dimlabel]')).includes('120'), 'its label is shown as a dimension (120)', JSON.stringify(await texts('[data-testid=dimlabel]')));

// ---- change the driving dimension again, and a circle
await p.locator('[data-testid=dimlabel]', { hasText: /^120$/ }).dblclick();
await p.keyboard.type('90'); await p.keyboard.press('Enter'); await settle(1500);
sk = (await state()).sketches[0];
const xs2 = sk.curves.filter((c) => c.type === 'line').flatMap((c) => [c.start[0], c.end[0]]);
check(near(Math.max(...xs2) - Math.min(...xs2), 90, 0.05) && sk.dimensions.length === 1, 'changing it again makes it 90 (still one dimension)', `${Math.max(...xs2) - Math.min(...xs2)}`);
await p.locator('[data-testid=measured]', { hasText: /^Ø12$/ }).first().dblclick();
check((await p.getByLabel('Dimension value').inputValue()) === '12', 'a circle opens with its diameter (12, without the symbol)');
await p.keyboard.type('25'); await p.keyboard.press('Enter'); await settle(1500);
sk = (await state()).sketches[0];
check(sk.curves.filter((c) => c.type === 'circle').some((c) => near(c.radius, 12.5)), 'the circle is now 25 across', JSON.stringify(sk.curves.filter((c) => c.type === 'circle').map((c) => c.radius)));
await p.screenshot({ path: `${shots}/dm2-changed.png` });

// ---- Esc leaves it alone, and one Ctrl+Z undoes one change
await p.locator('[data-testid=measured]', { hasText: /^60$/ }).dblclick();
await p.keyboard.type('77'); await p.keyboard.press('Escape'); await settle(600);
sk = (await state()).sketches[0];
const ys = sk.curves.filter((c) => c.type === 'line').flatMap((c) => [c.start[1], c.end[1]]);
check(near(Math.max(...ys) - Math.min(...ys), 60, 0.05) && (await p.getByLabel('Dimension value').count()) === 0, 'Esc cancels the edit: still 60', `${Math.max(...ys) - Math.min(...ys)}`);
await p.keyboard.press('Control+z'); await settle(1200);
sk = (await state()).sketches[0];
check(!sk.curves.filter((c) => c.type === 'circle').some((c) => near(c.radius, 12.5)), 'Ctrl+Z undoes the circle change');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
