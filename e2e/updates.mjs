// Real-browser check of the update check and the Updates window: the header badge, the window (current and available version, notes,
// last checked), Skip this version, the two check boxes (kept on the server), Check now, an unsaved-design warning, and the check being
// switched off. A small local server stands in for GitHub's release list. Update now itself (download, unpack, switch, restart) is checked
// by the unit tests (server/test/updateWindows.test.ts) and cannot run on Linux: it needs the Windows package.
// Needs: the engine (FORGE_ENGINE or data/engine/), a built app (npm run build). This script starts its own server on port 8121:
// Run: node e2e/updates.mjs      Screenshots go to $SHOTS (default /tmp).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// the fake GitHub: one release list, and a count of how often it was asked
let asked = 0;
const fake = http.createServer((req, res) => { asked++; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify([{ tag_name: 'v99.0.0', name: 'Forge 99', body: 'Everything is better.\n- one\n- two', draft: false, prerelease: false, published_at: '2026-10-01T00:00:00Z' }, { tag_name: 'v0.0.1', body: 'old', draft: false, prerelease: false }])); });
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const fakeUrl = `http://127.0.0.1:${fake.address().port}/releases`;

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-e2e-upd-'));
const PORT = 8121, URL = `http://127.0.0.1:${PORT}/`;
const server = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve('server'), env: { ...process.env, FORGE_PORT: String(PORT), FORGE_DATA: data, FORGE_UPDATE_URL: fakeUrl }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`${URL}api/update`); break; } catch { await settle(500); } }

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
const info = () => p.evaluate(async () => (await fetch('/api/update')).json());
try {
  await p.goto(URL);
  await p.getByTestId('docname').waitFor({ timeout: 30000 });
  // the server checks a few seconds after it starts
  let i;
  for (let n = 0; n < 40; n++) { i = await info(); if (i.latest) break; await settle(500); }
  check(i.latest?.version === '99.0.0' && i.newer, 'the server found the newer release on the fake list', JSON.stringify(i.latest?.version));
  await p.reload(); await p.getByTestId('docname').waitFor();
  await p.getByTestId('update-badge').waitFor({ timeout: 10000 });
  check(/^v\d+\.\d+\.\d+/.test(await p.getByTestId('app-version').innerText()), 'the header shows the running version', await p.getByTestId('app-version').innerText());
  check(/Update 99\.0\.0/.test(await p.getByTestId('update-badge').innerText()), 'the header shows an update badge with the version');
  await p.getByTestId('update-badge').click();
  await p.getByTestId('updates-dialog').waitFor();
  check(/\d+\.\d+\.\d+/.test(await p.getByTestId('update-current').innerText()) && (await p.getByTestId('update-latest').innerText()) === '99.0.0', 'the window shows the running and the available version');
  check(/Everything is better/.test(await p.getByTestId('update-notes').innerText()), 'the release notes are shown as plain text');
  check(await p.getByTestId('update-now').count() === 0 && /download the Windows zip/i.test(await p.getByTestId('updates-dialog').innerText()), 'off the Windows package there is no Update now button, only what to do by hand');
  await p.screenshot({ path: `${shots}/updates.png` });
  // settings are kept on the server
  await p.getByLabel('Check for updates').uncheck(); await settle(500);
  check((await info()).enabled === false, 'unticking "Check for updates" is kept by the server');
  check(/Checking is off/.test(await p.getByTestId('updates-dialog').innerText()), 'the window says checking is off');
  await p.getByLabel('Check for updates').check(); await settle(500);
  check((await info()).enabled === true, 'ticking it again turns checking back on');
  const before = asked;
  await p.getByRole('button', { name: 'Check now' }).click(); await settle(1500);
  check(asked > before, 'Check now asks the release list again');
  // skip
  await p.getByRole('button', { name: 'Skip this version' }).click(); await settle(500);
  check((await info()).skipped === true, 'Skip this version is kept');
  await p.getByRole('button', { name: 'Close' }).click();
  await p.reload(); await p.getByTestId('docname').waitFor(); await settle(500);
  check(await p.getByTestId('update-badge').count() === 0, 'a skipped version no longer shows the badge');
  await p.getByTestId('file-menu').click();
  check(await p.getByRole('button', { name: /Updates…/ }).isVisible(), 'File > Updates… is still there to open the window');
  await p.getByRole('button', { name: /Updates…/ }).click();
  await p.getByRole('button', { name: 'Stop skipping' }).click(); await settle(500);
  check((await info()).skipped === false, 'Stop skipping brings it back');
  // an unsaved design is warned about (the warning is for the Windows package, so only the saved settings are checked here)
  const raw = JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
  check(raw.updates && raw.updates.check === true && raw.updates.apply === false, 'settings.json holds the choices; Update now is off until it is allowed', JSON.stringify(raw.updates));
  await p.keyboard.press('Escape');
} finally {
  await b.close(); server.kill(); fake.close(); fs.rmSync(data, { recursive: true, force: true });
}
console.log(failed ? `== updates: ${failed} FAILED` : '== updates: all passed');
process.exit(failed ? 1 : 0);
