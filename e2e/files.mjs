// Real-browser check of New, Open, Save, Save As, Export and the unsaved marker against the real engine.
// Two runs of the app: (1) with a stand-in for Chrome's native file windows (Save writes back to the same file), (2) without them (downloads and a file chooser).
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/files.mjs          Exported files and screenshots go to $SHOTS (default /tmp).
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { strFromU8, unzipSync } from 'fflate';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// ---- a stand-in for the native file windows: records what was asked and what was written, and hands back what the test prepared
const FAKE_PICKERS = () => {
  window.__asked = []; window.__written = {}; window.__saveName = null; window.__openNext = null; window.__openWritable = true;
  window.showSaveFilePicker = async (o) => {
    window.__asked.push({ kind: 'save', suggested: o.suggestedName });
    const name = window.__saveName ?? o.suggestedName;
    return { name, createWritable: async () => { const parts = []; return { write: async (d) => { parts.push(d); }, close: async () => { const buf = await new Blob(parts).arrayBuffer(); window.__written[name] = Array.from(new Uint8Array(buf)); } }; } };
  };
  window.showOpenFilePicker = async () => {
    window.__asked.push({ kind: 'open' });
    const n = window.__openNext; if (!n) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    // like a real opened file: it can be written back to when `__openWritable` is true, otherwise the browser refuses
    return [{ name: n.name, getFile: async () => new File([new Uint8Array(n.bytes)], n.name),
      createWritable: async () => { if (!window.__openWritable) throw Object.assign(new Error('permission refused'), { name: 'NotAllowedError' }); const parts = []; return { write: async (d) => { parts.push(d); }, close: async () => { window.__written[n.name] = Array.from(new Uint8Array(await new Blob(parts).arrayBuffer())); } }; } }];
  };
};

async function page(fake) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
  const p = await ctx.newPage();
  if (fake) await p.addInitScript(FAKE_PICKERS);
  else await p.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; });
  p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
  return p;
}
const api = (p) => ({
  state: () => p.evaluate(async () => (await fetch('/api/state')).json()),
  at: (q) => p.evaluate((q) => window.__forge.sketchToScreen(q), q),
});
const text = (p, id) => p.getByTestId(id).innerText();
const settle = (p, ms = 500) => p.waitForTimeout(ms);
const written = (p, name) => p.evaluate((n) => window.__written[n] ?? null, name);
const unprevented = (p) => p.evaluate(() => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });

/** A 40 x 30 rectangle with a 10 mm circle, extruded 10. */
async function build(p) {
  const { at } = api(p);
  const click = async (q) => { const [x, y] = await at(q); await p.mouse.move(x, y); await p.mouse.click(x, y); };
  await p.getByTestId('btn-sketch').click();
  const [px, py] = await p.evaluate(() => window.__forge.project([40, -40, 0]));
  await p.mouse.move(px, py); await p.mouse.click(px, py);
  await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
  await settle(p, 700);
  await p.keyboard.press('r'); await click([0, 0]); await click([40, 30]);
  await p.locator('.palette label', { hasText: 'Snap' }).locator('input').uncheck(); // the grid step depends on the zoom; free positions keep the circle inside
  await p.keyboard.press('c'); await click([20, 15]); await click([25, 15]); await settle(p);
  await p.keyboard.press('e');
  await p.getByTestId('extrude-dialog').waitFor({ timeout: 15000 });
  await settle(p, 400);
  const [rx, ry] = await p.evaluate(() => window.__forge.project([3, 3, 0]));
  await p.mouse.move(rx, ry); await p.mouse.click(rx, ry);
  await p.getByLabel('Distance').fill('10');
  await p.getByTestId('timeline').locator('[data-name^=Extrude]').waitFor({ timeout: 15000 });
  await settle(p, 500);
  await p.getByTestId('extrude-ok').click();
  await p.getByTestId('extrude-dialog').waitFor({ state: 'detached' });
  await settle(p);
}
const openMenu = async (p, label) => { await p.getByTestId('file-menu').click(); await p.getByTestId('context-menu').waitFor(); if (label) await p.getByTestId('context-menu').getByRole('button', { name: label, exact: true }).click(); };

// =============== run 1: native file windows ===============
{
  const p = await page(true), A = api(p);
  await p.goto(URL);
  await p.getByTestId('demo').waitFor({ timeout: 30000 });
  check((await text(p, 'docname')).startsWith('Untitled') && !(await p.getByTestId('dirty').count()), 'a new design is called Untitled and has no unsaved marker');
  check(!(await unprevented(p)), 'nothing to lose: closing the tab is not blocked');
  await build(p);
  check((await p.getByTestId('dirty').count()) === 1 && /●/.test(await p.title()), 'after building, the unsaved marker shows in the header and the tab title');
  check(await unprevented(p), 'closing the tab now asks first');

  // Save: the first time it asks where
  await p.evaluate(() => { window.__saveName = 'Bracket.forge'; });
  await p.keyboard.press('Control+s');
  await p.waitForFunction(() => window.__written['Bracket.forge'], null, { timeout: 15000 });
  await settle(p, 400);
  let asked = await p.evaluate(() => window.__asked.filter((a) => a.kind === 'save'));
  check(asked.length === 1 && asked[0].suggested === 'Untitled.forge', 'Ctrl+S opens the Save window suggesting Untitled.forge');
  const f1 = Uint8Array.from(await written(p, 'Bracket.forge'));
  const zip = unzipSync(f1);
  const meta = JSON.parse(strFromU8(zip['forge.json']));
  check(meta.format === 'demonx-forge' && meta.version === 1 && zip['design.solidcraft']?.length > 100, 'the file is a Forge file: forge.json and the design inside', JSON.stringify(meta));
  check((await text(p, 'docname')).startsWith('Bracket') && !(await p.getByTestId('dirty').count()), 'the design is now called Bracket and is marked saved');
  check(/Saved Bracket.forge/.test(await text(p, 'notice')), 'a notice says it was saved');
  check(!(await unprevented(p)), 'closing the tab is no longer blocked');

  // change something: the marker returns; Ctrl+S now writes back to the same file without asking
  await p.getByTestId('timeline').locator('[data-name=Extrude1]').click({ button: 'right' });
  await p.getByRole('button', { name: 'Rename…' }).click();
  await p.getByLabel('Value').fill('Base'); await p.getByLabel('Value').press('Enter'); await settle(p, 600);
  check((await p.getByTestId('dirty').count()) === 1, 'renaming a step marks the design unsaved again');
  const before = (await written(p, 'Bracket.forge')).length;
  await p.keyboard.press('Control+s'); await settle(p, 1200);
  asked = await p.evaluate(() => window.__asked.filter((a) => a.kind === 'save'));
  check(asked.length === 1, 'a second Ctrl+S does not ask again', `${asked.length} Save windows so far`);
  const f2 = Uint8Array.from(await written(p, 'Bracket.forge'));
  check(f2.length > 0 && !(await p.getByTestId('dirty').count()) && Buffer.compare(Buffer.from(f1), Buffer.from(f2)) !== 0, 'the file was updated in place and the marker cleared', `${before} -> ${f2.length} bytes`);

  // Save As asks again
  await openMenu(p, 'Save As…   Ctrl+Shift+S');
  await p.waitForFunction(() => window.__asked.filter((a) => a.kind === 'save').length === 2, null, { timeout: 10000 });
  check(true, 'Save As always opens the window');

  // Export: STEP, STL, 3MF, OBJ, and a sketch as DXF
  const exported = {};
  for (const [label, ext] of [['STEP (.step)', 'step'], ['STL (.stl)', 'stl'], ['3MF (.3mf)', '3mf'], ['OBJ (.obj)', 'obj']]) {
    await p.evaluate(() => { window.__saveName = null; });
    await openMenu(p, label);
    await p.waitForFunction((e) => Object.keys(window.__written).some((k) => k.endsWith(`.${e}`)), ext, { timeout: 20000 });
    const key = await p.evaluate((e) => Object.keys(window.__written).find((k) => k.endsWith(`.${e}`)), ext);
    exported[ext] = { key, bytes: Uint8Array.from(await written(p, key)) };
  }
  check(exported.step.key === 'Bracket.step' && strFromU8(exported.step.bytes.subarray(0, 14)).startsWith('ISO-10303-21'), 'Export STEP: Bracket.step, a real STEP file');
  check(exported.stl.key === 'Bracket.stl' && exported.stl.bytes.length === 84 + 50 * new DataView(exported.stl.bytes.buffer).getUint32(80, true), 'Export STL: a well-formed binary STL');
  check(exported['3mf'].bytes[0] === 0x50 && exported['3mf'].bytes[1] === 0x4b, 'Export 3MF: a zip package');
  check(/^v /m.test(strFromU8(exported.obj.bytes)), 'Export OBJ: vertices present');
  writeFileSync(`${shots}/exported.step`, exported.step.bytes); writeFileSync(`${shots}/exported.stl`, exported.stl.bytes);
  await p.evaluate(() => { window.__saveName = null; });
  await openMenu(p, 'Sketch1');
  await p.waitForFunction(() => Object.keys(window.__written).some((k) => k.endsWith('.dxf')), null, { timeout: 15000 });
  const dxfName = await p.evaluate(() => Object.keys(window.__written).find((k) => k.endsWith('.dxf')));
  const dxf = strFromU8(Uint8Array.from(await written(p, dxfName)));
  writeFileSync(`${shots}/exported.dxf`, dxf);
  check(dxfName === 'Bracket Sketch1.dxf' && /SECTION/.test(dxf) && (dxf.match(/\nLINE\n/g) ?? []).length === 4 && /CIRCLE/.test(dxf), 'Export DXF: Bracket Sketch1.dxf with the 4 lines and the circle');
  writeFileSync(`${shots}/Bracket.forge`, f2);

  // New asks before throwing work away, then empties everything
  await p.getByTestId('timeline').locator('[data-name=Base]').click({ button: 'right' });
  await p.getByRole('button', { name: 'Suppress', exact: true }).click(); await settle(p, 600); // an unsaved change
  await openMenu(p, 'New');
  await p.getByTestId('confirm').waitFor();
  check(/Discard the unsaved changes/.test(await text(p, 'confirm')), 'New asks before discarding unsaved changes');
  await p.getByRole('button', { name: 'Cancel' }).click();
  check((await A.state()).timeline.length === 2, 'Cancel keeps the design');
  await openMenu(p, 'New');
  await p.getByTestId('confirm-ok').click(); await settle(p, 800);
  let s = await A.state();
  check(s.timeline.length === 0 && s.bodies.length === 0 && s.doc.name === 'Untitled' && !s.doc.dirty, 'New empties the design and calls it Untitled');
  check(await p.getByTestId('demo').isVisible(), 'and the empty-design hint is back');
  await p.getByTestId('file-menu').click();
  check(await p.getByTestId('context-menu').getByRole('button', { name: 'STEP (.step)', exact: true }).isDisabled(), 'with nothing built, STEP export is greyed out');
  await p.keyboard.press('Escape');

  // Open: the file we saved
  await p.evaluate((bytes) => { window.__openNext = { name: 'Bracket.forge', bytes }; }, Array.from(f2));
  await p.keyboard.press('Control+o');
  await p.getByTestId('timeline').locator('[data-name=Base]').waitFor({ timeout: 20000 });
  await settle(p, 500);
  s = await A.state();
  check(s.timeline.map((t) => t.name).join() === 'Sketch1,Base' && s.bodies.length === 1 && s.doc.name === 'Bracket' && !s.doc.dirty, 'Ctrl+O brings the design back: the same steps, one body, called Bracket, not unsaved');
  check(/Opened Bracket.forge/.test(await text(p, 'notice')), 'a notice says it was opened');
  await p.screenshot({ path: `${shots}/f1-opened.png` });

  // ... and it is still editable: reopen the sketch, change a dimension, the body follows
  await p.getByTestId('timeline').locator('[data-name=Sketch1]').dblclick();
  await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
  await settle(p, 700);
  const { at } = A;
  await p.keyboard.press('d');
  const [dx, dy] = await at([20, 0]); await p.mouse.move(dx, dy); await p.mouse.click(dx, dy);
  await p.getByTestId('value-entry').waitFor();
  await p.getByLabel('Value').fill('55'); await p.getByLabel('Value').press('Enter'); await settle(p, 700);
  await p.keyboard.press('Escape');
  await p.getByTestId('btn-finish').click();
  await p.getByTestId('tab-sketch').waitFor({ state: 'detached', timeout: 15000 });
  await settle(p, 600);
  s = await A.state();
  const xs = s.bodies[0].positions.filter((_, i) => i % 3 === 0);
  check(Math.abs(Math.max(...xs) - 55) < 1e-6, 'the reopened design is fully editable: dimension 55, the body follows');

  // when the browser refuses to write back to the opened file, Save falls back to the Save window
  await p.evaluate(() => { window.__openWritable = false; window.__saveName = 'Elsewhere.forge'; });
  await p.getByTestId('timeline').locator('[data-name=Base]').click({ button: 'right' });
  await p.getByRole('button', { name: 'Rename…' }).click();
  await p.getByLabel('Value').fill('Base2'); await p.getByLabel('Value').press('Enter'); await settle(p, 600);
  const savesBefore = (await p.evaluate(() => window.__asked.filter((a) => a.kind === 'save').length));
  await p.keyboard.press('Control+s');
  await p.waitForFunction(() => window.__written['Elsewhere.forge'], null, { timeout: 15000 });
  await settle(p, 500);
  check((await p.evaluate(() => window.__asked.filter((a) => a.kind === 'save').length)) === savesBefore + 1 && !(await p.getByTestId('error').count()), 'if writing back to the opened file is refused, Save opens the Save window instead (no error)');
  check(/Saved Elsewhere.forge/.test(await text(p, 'notice')), 'and the notice names the new file');
  await p.evaluate(() => { window.__openWritable = true; window.__saveName = null; });

  // a bad file is refused and nothing changes
  await p.evaluate(() => { window.__openNext = { name: 'bad.forge', bytes: [1, 2, 3, 4, 5, 6, 7, 8] }; });
  await p.keyboard.press('Control+s'); await settle(p, 800); // save the change first so Open does not ask
  await p.keyboard.press('Control+o'); await p.getByTestId('error').waitFor({ timeout: 15000 });
  check(/not a valid archive/.test(await text(p, 'error')), 'a file that is not a Forge file is refused with the reason', await text(p, 'error'));
  s = await A.state();
  check(s.bodies.length === 1 && s.doc.name === 'Elsewhere', 'and the open design is untouched');
  await p.screenshot({ path: `${shots}/f2-refused.png` });

  // saving while a sketch is open: what comes back
  await p.getByTestId('btn-sketch').click();
  const [qx, qy] = await p.evaluate(() => window.__forge.project([20, -20, 0])); // inside the origin plane squares of this smaller model
  await p.mouse.move(qx, qy); await p.mouse.click(qx, qy);
  await p.getByTestId('tab-sketch').waitFor({ timeout: 15000 });
  await settle(p, 600);
  await p.keyboard.press('r');
  const [r1x, r1y] = await at([-30, 10]); await p.mouse.move(r1x, r1y); await p.mouse.click(r1x, r1y); // near the origin: the view is zoomed in on a small model
  const [r2x, r2y] = await at([-10, 30]); await p.mouse.move(r2x, r2y); await p.mouse.click(r2x, r2y); await settle(p);
  await p.keyboard.press('Control+s'); await settle(p, 1200);
  const midSketch = Uint8Array.from(await written(p, 'Elsewhere.forge')); // Save now writes back to the file chosen in the fallback above
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await settle(p, 800); // leave the sketch state tidy
  await p.evaluate((bytes) => { window.__openNext = { name: 'Bracket.forge', bytes }; }, Array.from(midSketch));
  await p.getByTestId('file-menu').click(); await p.getByTestId('context-menu').waitFor();
  const dirtyNow = (await A.state()).doc.dirty;
  await p.keyboard.press('Escape');
  if (dirtyNow) { await openMenu(p, 'Open…   Ctrl+O'); await p.getByTestId('confirm-ok').click(); } else { await openMenu(p, 'Open…   Ctrl+O'); }
  await settle(p, 1200);
  s = await A.state();
  const half = s.sketches.find((k) => k.name === 'Sketch2');
  check(!!half && half.curves.length === 4 && !half.active && s.timeline.some((t) => t.name === 'Sketch2'), 'saving in the middle of a sketch loses nothing: the unfinished sketch (4 lines) comes back as an ordinary sketch to continue', `steps ${s.timeline.map((t) => t.name).join()}; ${s.sketches.map((k) => k.name + ':' + k.curves.length + (k.active ? ' (open)' : '')).join(', ')}`);
  await p.context().close();
}

// =============== run 2: no native file windows (downloads and a file chooser) ===============
{
  const p = await page(false), A = api(p);
  await p.goto(URL);
  await p.getByTestId('file-menu').waitFor({ timeout: 30000 });
  await openMenu(p, 'New'); // the server still holds the first run's design
  if (await p.getByTestId('confirm').count()) await p.getByTestId('confirm-ok').click();
  await p.getByTestId('demo').waitFor({ timeout: 30000 });
  await settle(p, 600); // the view moves to its home position after New
  await build(p);
  let dl = p.waitForEvent('download');
  await p.keyboard.press('Control+s');
  let d = await dl;
  check(d.suggestedFilename() === 'Untitled.forge', 'without a Save window, Ctrl+S downloads Untitled.forge', d.suggestedFilename());
  await settle(p, 600);
  check(!(await p.getByTestId('dirty').count()), 'and the design counts as saved');

  await openMenu(p, 'Save As…   Ctrl+Shift+S');
  await p.getByTestId('value-entry').waitFor();
  check(/Downloads folder/.test(await text(p, 'value-entry')), 'Save As asks for a name in the page and says where it goes');
  await p.getByLabel('Value').fill('Fallback One');
  dl = p.waitForEvent('download');
  await p.getByLabel('Value').press('Enter');
  d = await dl;
  check(d.suggestedFilename() === 'Fallback One.forge', 'the download has the chosen name', d.suggestedFilename());
  await d.saveAs(`${shots}/fallback.forge`);
  await settle(p, 600);
  check((await text(p, 'docname')).startsWith('Fallback One'), 'and the design is called that now');

  dl = p.waitForEvent('download');
  await openMenu(p, 'STEP (.step)');
  d = await dl;
  check(d.suggestedFilename() === 'Fallback One.step', 'Export STEP downloads Fallback One.step', d.suggestedFilename());

  await openMenu(p, 'New'); await settle(p, 800);
  check((await A.state()).timeline.length === 0, 'New (nothing unsaved, no question)');
  const chooser = p.waitForEvent('filechooser');
  await p.keyboard.press('Control+o');
  await (await chooser).setFiles(`${shots}/fallback.forge`);
  await p.getByTestId('timeline').locator('[data-name=Extrude1]').waitFor({ timeout: 20000 });
  const s = await A.state();
  check(s.bodies.length === 1 && s.doc.name === 'fallback' && !s.doc.dirty, 'Ctrl+O with a file chooser opens it (named after the file)', s.doc.name);
  await p.context().close();
}

await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
