// Real-browser check of the INSPECT tab and the Measure tool: tabs, vertex to vertex, an edge, face to face, Esc.
// Needs: the engine, a built app (npm run build), and a FRESH server: FORGE_PORT=8120 npm start   (stop it by port: fuser -k 8120/tcp)
// Run: node e2e/measure.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const settle = (ms = 450) => p.waitForTimeout(ms);
const proj = (w) => p.evaluate((w) => window.__forge.project(w), w);
const clickWorld = async (w) => { const [x, y] = await proj(w); await p.mouse.move(x, y, { steps: 3 }); await settle(200); await p.mouse.click(x, y); await settle(350); };
const values = () => p.getByTestId('measure-value').allInnerTexts();

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.evaluate(() => fetch('/api/batch', { method: 'POST', body: JSON.stringify({ steps: [
  { command: 'sketch.create', params: { plane: 'XY', name: 'S1' } },
  { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [40, 30] } },
  { command: 'sketch.finish' },
  { command: 'solid.extrude', params: { sketch: 'S1', profiles: [0], distance: 12, operation: 'new' } }] }) }));
await p.reload(); await p.getByTestId('btn-extrude').waitFor({ timeout: 30000 }); await settle(1500);

// ---- tabs
check(await p.getByTestId('btn-extrude').isVisible(), 'the SOLID tab shows Create and Modify as before');
await p.getByTestId('tab-inspect').click();
check(await p.getByTestId('btn-measure').isVisible() && !(await p.getByTestId('btn-extrude').count()), 'the INSPECT tab shows Measure (and the Solid tools are not shown)');
await p.getByTestId('tab-insert').click();
check(await p.getByTestId('btn-import').isVisible(), 'the INSERT tab shows Import');
await p.getByTestId('tab-inspect').click();

// ---- vertex to vertex
await p.getByTestId('btn-measure').click();
await p.getByTestId('measure-panel').waitFor();
await clickWorld([0, 0, 12]); await clickWorld([40, 0, 12]);
let v = await values();
check(v.includes('40 mm') && (await p.getByTestId('measure-between').innerText()).includes('Distance'), 'two corners 40 apart measure 40 mm', JSON.stringify(v));
await p.screenshot({ path: `${shots}/ms1-points.png` });

// ---- an edge: the third click starts over
await clickWorld([20, 0, 12]);
v = await values();
check(v.includes('40 mm') && !(await p.getByTestId('measure-between').count()), 'a click on an edge starts a new measurement: its length is 40 mm', JSON.stringify(v));

// ---- two faces at right angles
await p.getByRole('button', { name: 'Clear' }).click();
await clickWorld([20, 15, 12]); await clickWorld([20, 0, 6]);
const between = await p.getByTestId('measure-between').innerText().catch(() => '');
check(/90°/.test(between), 'the top face and the front face are 90° apart', between.replace(/\n/g, ' '));
await p.screenshot({ path: `${shots}/ms2-faces.png` });

// ---- Esc closes it, and clicks select again
await p.keyboard.press('Escape'); await settle(300);
check((await p.getByTestId('measure-panel').count()) === 0, 'Esc closes the Measure panel');
// the I key opens it from the SOLID tab as well
await p.getByTestId('tab-solid').click();
await p.keyboard.press('i'); await p.getByTestId('measure-panel').waitFor({ timeout: 5000 });
check(true, 'the I key starts Measure');

console.log(failed ? `\n${failed} FAILED` : '\n== measure: all passed');
await b.close(); process.exit(failed ? 1 : 0);
