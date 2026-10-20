#!/usr/bin/env node
// Builds the Windows package: one zip with Forge, its own copy of Node, the modelling engine, and a double-click start file.
// Layout: each version lives in versions\<version> (the program in app\, the engine in engine\), current.txt names the one that runs, and
// launcher.mjs (run by the start file with node\node.exe) starts it. That is what lets Update now unpack a new version beside the running
// one (see server/src/update/windows.ts).
// Runs on Linux, macOS or Windows (CI runs it on Linux). Nothing is compiled here: the server is bundled to plain JavaScript and the
// engine (solidcraft-cli.exe) is built separately by the "Windows package" workflow and handed in with --engine-dir.
//
//   node scripts/build-windows.mjs --engine-dir <dir>      <dir> holds solidcraft-cli.exe and the engine's licence files
//   node scripts/build-windows.mjs --engine-dir <dir> --node-zip file.zip   use an already downloaded Node for Windows (win-x64 zip)
//   node scripts/build-windows.mjs --engine-dir <dir> --skip-web            reuse web/dist as it is
//
// Output: dist-windows/DemonX-Forge-<version>-windows-x64.zip and the same name + .sha256

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const NODE_VERSION = opt('--node-version') ?? '22.22.0';   // the server needs Node 20 or newer
const ENGINE_LICENCES = ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'THIRD-PARTY-LICENSES.txt'];

const q = (a) => (process.platform === 'win32' && /[\s&()^|<>]/.test(a) ? `"${a}"` : a);
const sh = (cmd, a, cwd = root) => execFileSync(cmd, a.map(q), { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
const say = (m) => console.log(`\n== ${m}`);

const engineDir = opt('--engine-dir');
if (!engineDir) throw new Error('--engine-dir is required: the folder with solidcraft-cli.exe and its licence files (see .github/workflows/windows-package.yml)');
const engineExe = path.join(engineDir, 'solidcraft-cli.exe');
if (!fs.existsSync(engineExe)) throw new Error(`${engineExe} is missing`);
for (const f of ENGINE_LICENCES) if (!fs.existsSync(path.join(engineDir, f))) throw new Error(`${path.join(engineDir, f)} is missing: the engine's licence files must travel with it`);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git checkout */ }

const name = `DemonX-Forge-${pkg.version}-windows-x64`;
const outDir = path.join(root, 'dist-windows');
const stage = path.join(outDir, 'DemonX-Forge');   // no version in the folder name, so a newer zip extracted over an older one lands in the same place
fs.rmSync(stage, { recursive: true, force: true });
const verDir = path.join(stage, 'versions', pkg.version);   // everything that belongs to this version
const appDir = path.join(verDir, 'app');
fs.mkdirSync(appDir, { recursive: true });

// ---- the web UI (the server serves <app>/web/dist, as it does from a checkout)
if (!args.includes('--skip-web')) { say('Building the web UI'); sh('npm', ['run', 'build']); }
const webDist = path.join(root, 'web/dist');
if (!fs.existsSync(path.join(webDist, 'index.html'))) throw new Error('web/dist is missing: run "npm run build" first');
fs.cpSync(webDist, path.join(appDir, 'web/dist'), { recursive: true });
fs.cpSync(path.join(root, 'server/fixtures'), path.join(appDir, 'server/fixtures'), { recursive: true });

// ---- the server, as one plain JavaScript file (its only package is pure JavaScript, so it is bundled in)
say('Bundling the server');
await build({
  entryPoints: [path.join(root, 'server/src/index.ts')], outfile: path.join(appDir, 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20', sourcemap: false, legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'demonx-forge', version: pkg.version, build: commit || undefined, type: 'module' }, null, 2));

// ---- the engine and its licences (MIT OR Apache-2.0 and its dependencies: the notices must stay with it)
say('Adding the modelling engine');
fs.mkdirSync(path.join(verDir, 'engine/licences'), { recursive: true });
fs.copyFileSync(engineExe, path.join(verDir, 'engine/solidcraft-cli.exe'));
for (const f of ENGINE_LICENCES) fs.copyFileSync(path.join(engineDir, f), path.join(verDir, 'engine/licences', f));
// the version the launcher runs (an update changes it)
fs.writeFileSync(path.join(stage, 'current.txt'), pkg.version + '\n');

// ---- Node for Windows (just node.exe, plus its licence)
say(`Node ${NODE_VERSION} for Windows`);
const zipName = `node-v${NODE_VERSION}-win-x64.zip`;
let nodeZip = opt('--node-zip');
if (!nodeZip) {
  nodeZip = path.join(outDir, zipName);
  if (!fs.existsSync(nodeZip)) {
    const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
    const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
    const zip = await get(`${base}/${zipName}`);
    const sums = (await get(`${base}/SHASUMS256.txt`)).toString('utf8');
    const want = sums.split('\n').find((l) => l.endsWith(` ${zipName}`))?.split(/\s+/)[0];
    const got = crypto.createHash('sha256').update(zip).digest('hex');
    if (!want || want !== got) throw new Error(`The Node download does not match its published checksum (${got} vs ${want})`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(nodeZip, zip);
  }
}
const nx = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-node-'));
if (process.platform === 'win32') sh('tar', ['-xf', nodeZip, '-C', nx]); else sh('unzip', ['-q', nodeZip, '-d', nx]);
const nodeDir = path.join(nx, `node-v${NODE_VERSION}-win-x64`);
fs.mkdirSync(path.join(stage, 'node'));
fs.copyFileSync(path.join(nodeDir, 'node.exe'), path.join(stage, 'node/node.exe'));
fs.copyFileSync(path.join(nodeDir, 'LICENSE'), path.join(stage, 'node/LICENSE-node.txt'));
fs.rmSync(nx, { recursive: true, force: true });

// ---- start file and the guide (Windows line endings)
say('Adding the start file and the guide');
const crlf = (t) => t.replace(/\r?\n/g, '\r\n');
for (const f of fs.readdirSync(path.join(root, 'scripts/windows'))) {
  const text = fs.readFileSync(path.join(root, 'scripts/windows', f), 'utf8');
  fs.writeFileSync(path.join(stage, f), /\.(bat|vbs|ps1|txt)$/i.test(f) ? crlf(text) : text);
}
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE.txt'));
fs.writeFileSync(path.join(stage, 'READ ME FIRST.txt'), crlf(fs.readFileSync(path.join(root, 'docs/WINDOWS.md'), 'utf8')));

// ---- what the launcher (scripts/windows/launcher.mjs) and Update now (server/src/update/windows.ts) rely on
const V = `versions/${pkg.version}`;
for (const f of ['Start DemonX Forge.bat', 'READ ME FIRST.txt', 'launcher.mjs', 'current.txt', 'node/node.exe', `${V}/engine/solidcraft-cli.exe`, `${V}/app/server.mjs`, `${V}/app/package.json`, `${V}/app/web/dist/index.html`, `${V}/app/server/fixtures/bracket.json`]) {
  if (!fs.existsSync(path.join(stage, f))) throw new Error(`the package layout is wrong: ${f} is missing (the launcher and Update now need it)`);
}
if (fs.readFileSync(path.join(stage, 'current.txt'), 'utf8').trim() !== pkg.version) throw new Error('current.txt does not name this version');
if (!fs.readFileSync(path.join(stage, 'Start DemonX Forge.bat'), 'utf8').includes('launcher.mjs')) throw new Error('Start DemonX Forge.bat does not start Forge through launcher.mjs');

// ---- zip it
say('Zipping');
const zipOut = path.join(outDir, `${name}.zip`);
fs.rmSync(zipOut, { force: true });
if (process.platform === 'win32') sh('tar', ['-a', '-cf', zipOut, '-C', outDir, 'DemonX-Forge']);
else sh('zip', ['-q', '-r', '-9', zipOut, 'DemonX-Forge'], outDir);
const digest = crypto.createHash('sha256').update(fs.readFileSync(zipOut)).digest('hex');
fs.writeFileSync(`${zipOut}.sha256`, `${digest}  ${path.basename(zipOut)}\n`);
const mb = (fs.statSync(zipOut).size / 1048576).toFixed(1);
console.log(`\nDone: ${path.relative(root, zipOut)} (${mb} MB)${commit ? `, build ${commit}` : ''}\nChecksum: ${path.relative(root, zipOut)}.sha256 (${digest})`);
