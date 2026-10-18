// Real-browser check of the second set of sketch tools against the real engine: centre rectangle, 3-point arc, slot, 2-point circle,
// selecting, construction lines and Delete, Trim, Offset, Fillet, and the constraints.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/sketch2.mjs        Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const sketch = async () => (await p.evaluate(async () => (await fetch('/api/state')).json())).sketches.find((k) => k.active);
const at = (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q);
const click = async (q, opts) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y, opts); };
const settle = (ms = 450) => p.waitForTimeout(ms);
const text = (id) => p.getByTestId(id).innerText();
const dist = (c, q) => { // distance from point q to a line or circle curve, in sketch mm
  if (c.type === 'circle') return Math.abs(Math.hypot(q[0] - c.center[0], q[1] - c.center[1]) - c.radius);
  if (c.type !== 'line') return Infinity;
  const [a, e] = [c.start, c.end], dx = e[0] - a[0], dy = e[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
};
const lines = (k) => k.curves.filter((c) => c.type === 'line');
const solid = (k) => lines(k).filter((c) => !c.construction);

await p.goto(URL);
await p.getByTestId('demo').waitFor({ timeout: 30000 });
await p.getByTestId('btn-sketch').click();
const [px, py] = await p.evaluate(() => window.__forge.project([40, -40, 0]));
await p.mouse.move(px, py); await p.mouse.click(px, py);
await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
await settle(700);
check(await p.getByTestId('tool-arc3').isVisible() && await p.getByTestId('tool-trim').isVisible() && await p.getByTestId('tool-horizontal').isVisible(), 'the SKETCH tab offers the new tools');

// ---- centre rectangle: centre (30,20), corner (50,30) -> 40 x 20
await p.getByTestId('tool-rectCenter').click();
await click([30, 20]); await click([50, 30]); await settle();
let k = await sketch();
let xs = lines(k).flatMap((c) => [c.start[0], c.end[0]]), ys = lines(k).flatMap((c) => [c.start[1], c.end[1]]);
check(solid(k).length === 4 && lines(k).length - solid(k).length === 2, 'centre rectangle: 4 sides plus 2 construction diagonals', `${solid(k).length} solid, ${lines(k).length - solid(k).length} construction`);
check(near(Math.min(...xs), 10) && near(Math.max(...xs), 50) && near(Math.min(...ys), 10) && near(Math.max(...ys), 30), 'centre rectangle: x 10..50, y 10..30', `${lines(k).length} lines`);

// ---- 3-point arc (A): start (60,0), end (80,0), through (70,10)
await p.keyboard.press('a');
check((await p.getByTestId('tool-arc3').getAttribute('aria-pressed')) === 'true', 'A selects the arc tool');
await click([60, 0]); await click([80, 0]);
check(/passes through/.test(await text('hint')), 'after two points it asks for the third');
await click([70, 10]); await settle();
k = await sketch();
const arc = k.curves.find((c) => c.type === 'arc');
check(arc && near(arc.center[0], 70, 0.1) && near(arc.center[1], 0, 0.1) && near(arc.radius, 10, 0.1), 'a 3-point arc through (60,0), (70,10), (80,0): centre (70,0), radius 10', JSON.stringify(arc && [arc.center, arc.radius]));
check(arc && near(Math.hypot(arc.start[0] - arc.center[0], arc.start[1] - arc.center[1]), arc.radius, 0.01), 'its radius matches its ends');

// ---- slot: centres (10,50) and (30,50), width set by a click 10 mm off the centre line -> 20 wide
await p.getByTestId('tool-slot').click();
await click([10, 50]); await click([30, 50]); await click([20, 60]); await settle();
k = await sketch();
check(k.curves.filter((c) => c.type === 'arc').length >= 3, 'slot: two end arcs were added', `${k.curves.filter((c) => c.type === 'arc').length} arcs`);
const slotTop = lines(k).find((c) => near(c.start[1], 60, 0.05) && near(c.end[1], 60, 0.05));
check(!!slotTop, 'slot: its long edges are 10 mm either side of the centre line (width 20)');

// ---- 2-point circle: (60,40) to (70,40) -> centre (65,40), radius 5
await p.getByTestId('tool-circle2').click();
await click([60, 40]); await click([70, 40]); await settle();
k = await sketch();
const c2 = k.curves.find((c) => c.type === 'circle');
check(c2 && near(c2.center[0], 65) && near(c2.center[1], 40) && near(c2.radius, 5), '2-point circle: centre (65,40), radius 5', JSON.stringify(c2 && [c2.center, c2.radius]));
await p.screenshot({ path: `${shots}/t1-drawn.png` });

// ---- select a line, make it a construction line (X) and back, then delete it
const nLines = lines(k).length, nConstr = k.curves.filter((c) => c.construction).length;
await click([30, 10]); // the bottom edge of the centre rectangle (no tool: select)
check(/1 selected/.test(await text('hint')), 'with no tool, clicking a line selects it');
await p.keyboard.press('x'); await settle();
k = await sketch();
check(k.curves.filter((c) => c.construction).length === nConstr + 1, 'X makes the selected line a construction line');
await p.keyboard.press('x'); await settle();
k = await sketch();
check(k.curves.filter((c) => c.construction).length === nConstr, 'X again makes it a normal line');
const profiles0 = k.profiles.length;
await p.keyboard.press('Delete'); await settle();
k = await sketch();
check(lines(k).length === nLines - 1, 'Delete removes the selected line', `${nLines} -> ${lines(k).length}`);
check(k.profiles.length < profiles0, 'and the region it closed is gone', `${profiles0} -> ${k.profiles.length} profiles`);
await p.keyboard.press('Control+z'); await settle(700);
k = await sketch();
check(lines(k).length === nLines, 'Ctrl+Z brings the line back');

// ---- Trim (T): two crossing lines, remove the left piece of the horizontal one
await p.keyboard.press('l');
await click([-60, 70]); await click([-20, 70]); await p.keyboard.press('Escape');
await p.keyboard.press('l');
await click([-40, 60]); await click([-40, 80]); await p.keyboard.press('Escape'); await settle();
k = await sketch();
const before = lines(k).length;
await p.keyboard.press('t');
await click([-50, 70]); await settle(600);
k = await sketch();
check(!lines(k).some((c) => dist(c, [-50, 70]) < 0.5) && lines(k).some((c) => dist(c, [-30, 70]) < 0.1), 'Trim removed the piece left of the crossing and kept the right piece', `${before} -> ${lines(k).length} lines`);
await p.keyboard.press('Escape');

// ---- Offset (O): the 2-point circle by 3 mm
await p.keyboard.press('o');
await click([70, 40]); // on the circle's rim
await p.getByTestId('value-entry').waitFor();
await p.getByLabel('Value').fill('3'); await p.getByLabel('Value').press('Enter'); await settle(700);
k = await sketch();
const radii = k.curves.filter((c) => c.type === 'circle' && near(c.center[0], 65, 0.1) && near(c.center[1], 40, 0.1)).map((c) => c.radius).sort();
check(radii.length === 2 && near(Math.abs(radii[1] - radii[0]), 3, 0.01), 'Offset made a concentric circle 3 mm away', JSON.stringify(radii));
await p.keyboard.press('Escape');

// ---- Fillet: a right-angle corner at (-20,0) rounded with radius 4
await p.keyboard.press('l');
await click([-60, 0]); await click([-20, 0]); await click([-20, 20]); await p.keyboard.press('Escape'); await settle();
await p.getByTestId('tool-fillet').click();
await click([-20, 0]);
await p.getByTestId('value-entry').waitFor();
await p.getByLabel('Value').fill('4'); await p.getByLabel('Value').press('Enter'); await settle(700);
k = await sketch();
const fil = k.curves.find((c) => c.type === 'arc' && near(c.radius, 4, 0.01));
check(!!fil, 'Fillet added an arc of radius 4 at the corner', JSON.stringify(fil && [fil.center, fil.radius]));
await p.keyboard.press('Escape');

// ---- constraints
// horizontal: a slanted line becomes level
await p.keyboard.press('l');
await click([-60, -30]); await click([-20, -20]); await p.keyboard.press('Escape'); await settle();
await p.getByTestId('tool-horizontal').click();
await click([-40, -25]); await settle(600);
k = await sketch();
const slanted = lines(k).find((c) => dist(c, [-40, -30]) < 6 && Math.abs(c.start[0] - c.end[0]) > 30);
check(slanted && near(slanted.start[1], slanted.end[1], 1e-6), 'Horizontal/Vertical: the slanted line is now level', JSON.stringify(slanted && [slanted.start, slanted.end]));
await p.keyboard.press('Escape');

// parallel: B is turned to match A
await p.keyboard.press('l');
await click([-60, -50]); await click([-20, -50]); await p.keyboard.press('Escape');
await p.keyboard.press('l');
await click([-60, -70]); await click([-30, -60]); await p.keyboard.press('Escape'); await settle();
await p.getByTestId('tool-parallel').click();
await click([-40, -50]); await click([-45, -65]); await settle(600);
k = await sketch();
const A = lines(k).find((c) => near(c.start[1], -50, 0.01) && near(c.end[1], -50, 0.01) || (dist(c, [-40, -50]) < 0.5 && Math.abs(c.start[0] - c.end[0]) > 30));
const B = lines(k).find((c) => c !== A && dist(c, [-50, -65]) < 8 && Math.abs(c.start[0] - c.end[0]) > 10);
const cr = A && B ? (A.end[0] - A.start[0]) * (B.end[1] - B.start[1]) - (A.end[1] - A.start[1]) * (B.end[0] - B.start[0]) : 99;
check(Math.abs(cr) < 1e-6, 'Parallel: the two lines now point the same way', `cross product ${cr}`);
await p.keyboard.press('Escape');

// fix: pin a point
await p.getByTestId('tool-fix').click();
const pt = k.points.find((q) => near(q.at[0], -60, 0.05) && near(q.at[1], -50, 0.05));
await click(pt ? pt.at : [-60, -50]); await settle(600);
k = await sketch();
check(k.points.some((q) => q.fixed && near(q.at[0], -60, 0.05) && near(q.at[1], -50, 0.05)), 'Fix: the clicked point is now fixed');
await p.keyboard.press('Escape');

// a refused constraint says why
await p.getByTestId('tool-midpoint').click();
await click([-60, -50]); await click([-20, -50]); await settle(500); // two points: needs a point and a line
check(/point and a line/.test(await text('error')), 'a constraint that cannot apply shows why');
await p.keyboard.press('Escape');
await p.screenshot({ path: `${shots}/t2-done.png` });

// ---- the whole sketch still finishes
await p.getByTestId('btn-finish').click();
await p.getByTestId('tab-sketch').waitFor({ state: 'detached', timeout: 15000 });
check(true, 'Finish Sketch works after all of that');
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
