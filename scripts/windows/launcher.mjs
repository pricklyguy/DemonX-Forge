// Starts DemonX Forge from whichever version folder current.txt names, and keeps it running across updates.
//
//   node.exe launcher.mjs      runs versions\<current>\app\server.mjs, and starts it again when it asks for that (exit code 75)
//   node.exe launcher.mjs mcp  runs versions\<current>\app\mcp.mjs once: the MCP server an AI client starts (it talks on standard input and output)
//
// Why this exists: on Windows a running node.exe and the modelling engine cannot be overwritten, so Forge never updates itself in
// place. Each version lives in its own folder (versions\<version>: the program in app\, the engine in engine\), current.txt says
// which one runs, an update unpacks the new version beside the old one and then changes current.txt and exits with code 75, and this
// file starts whatever current.txt names. This file and node.exe are not part of any version, so an update never has to replace a
// program that is running.
//
// Safety net: before an update restarts Forge it writes data\update-pending.json. Forge deletes that file after it has been running
// for a while. If the new version stops before that, current.txt is put back to the version that worked and it is started again.
//
// Plain JavaScript with no packages: it is run by the Node that is in the Forge folder, and tested on Linux too.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RESTART = 75;
/** The engine program's file name on this system */
const EXE = process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli';
export const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
/** How many version folders are kept (the running one, the one before it, and one more: Design may still run from an older one) */
export const KEEP_VERSIONS = 3;

// (a file edited in Notepad may start with a byte order mark)
const read = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim(); } catch { return ''; } };
/** Write a small file so that it is either the old content or the new, never half */
function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  // a virus scanner can hold a file for a moment on Windows
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    }
  }
}

const ENTRY = { forge: 'server.mjs', mcp: 'mcp.mjs' };

/**
 * Run until done. `o.home` is the Forge folder; `o.spawnChild(entry, args, env)` runs one program and resolves to its exit code
 * (tests replace it). Resolves to the exit code the launcher itself should end with.
 */
export async function launch(mode, args, o) {
  const home = o.home;
  // (the MCP server speaks on standard output: nothing of ours may go there)
  const log = o.log ?? ((m) => (mode === 'mcp' ? console.error(m) : console.log(m)));
  const data = o.data ?? path.join(home, 'data');
  const entryName = ENTRY[mode];
  if (!entryName) { log(`Unknown mode "${mode}" (forge or mcp).`); return 2; }
  const currentFile = path.join(home, 'current.txt'), previousFile = path.join(home, 'previous.txt');
  const pendingFile = path.join(data, 'update-pending.json'), failedFile = path.join(data, 'update-failed.json');
  const spawnChild = o.spawnChild ?? defaultSpawn;

  for (let round = 0; round < 1000; round++) {
    const version = read(currentFile);
    if (!VERSION.test(version)) { log(`current.txt (${currentFile}) does not name a version. Extract the DemonX Forge zip again.`); return 2; }
    const dir = path.join(home, 'versions', version, 'app');
    const entry = path.join(dir, entryName);
    if (!fs.existsSync(entry)) {
      const prev = read(previousFile);
      if (VERSION.test(prev) && prev !== version && fs.existsSync(path.join(home, 'versions', prev, 'app', entryName))) {
        log(`Version ${version} is not complete (${entryName} is missing): going back to ${prev}.`);
        failUpdate(failedFile, pendingFile, version, prev, `its files were not complete`);
        writeAtomic(currentFile, prev);
        continue;
      }
      log(`Version ${version} is not complete: ${entry} is missing. Extract the DemonX Forge zip again.`);
      return 2;
    }
    // the old layout (before versions) left an app folder behind: it is not used any more
    if (mode === 'forge' && round === 0) { removeLegacy(home, log); pruneVersions(home, version, read(previousFile), log); }

    const env = {
      ...process.env,
      FORGE_HOME: home, FORGE_LAUNCHER: '1', FORGE_VERSION: version,
      FORGE_ROOT: dir,
      FORGE_DATA: process.env.FORGE_DATA || data,
      FORGE_ENGINE: process.env.FORGE_ENGINE || path.join(home, 'versions', version, 'engine', EXE),
    };
    const code = await spawnChild(entry, args, env);

    if (mode !== 'forge') return code;
    if (code === RESTART) { log(`Starting Forge again (version ${read(currentFile)})...`); continue; }
    // stopped before the update that put it there was confirmed (Forge confirms after it has run for a while): go back
    const pending = readJson(pendingFile);
    if (pending && code !== 0 && pending.version === version && VERSION.test(String(pending.previous ?? ''))) {
      log(`Version ${version} stopped (exit code ${code}) before it was confirmed. Going back to ${pending.previous}.`);
      failUpdate(failedFile, pendingFile, version, pending.previous, `it stopped with exit code ${code} soon after it started`);
      writeAtomic(currentFile, String(pending.previous));
      continue;
    }
    return code;
  }
  log('Forge restarted too many times in a row.');
  return 1;
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

/** Record that an update was undone (Forge tells the owner on its next start) and clear the pending mark */
function failUpdate(failedFile, pendingFile, version, previous, why) {
  try { fs.mkdirSync(path.dirname(failedFile), { recursive: true }); writeAtomic(failedFile, JSON.stringify({ version, previous, why, at: Date.now() })); } catch { /* the owner is still back on the working version */ }
  try { fs.rmSync(pendingFile, { force: true }); } catch { /* ignore */ }
}

// the old layout (before versions) left an app folder and an engine folder next to the start file: they are not used any more
function removeLegacy(home, log) {
  for (const [dir, marker] of [['app', 'server.mjs'], ['engine', EXE]]) {
    const legacy = path.join(home, dir);
    if (!fs.existsSync(path.join(legacy, marker))) continue;
    try { fs.rmSync(legacy, { recursive: true, force: true }); log(`Removed the old ${dir} folder (this install now keeps each version in its own folder under versions).`); } catch { /* in use: tried again at the next start */ }
  }
}

/** Delete the oldest version folders beyond KEEP_VERSIONS, never the running or the previous one. A folder that is in use just stays. */
export function pruneVersions(home, current, previous, log = () => {}) {
  const base = path.join(home, 'versions');
  let names;
  try { names = fs.readdirSync(base).filter((n) => VERSION.test(n)); } catch { return; }
  const dated = names.map((n) => ({ n, t: fs.statSync(path.join(base, n)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { n } of dated.slice(KEEP_VERSIONS)) {
    if (n === current || n === previous) continue;
    try { fs.rmSync(path.join(base, n), { recursive: true, force: true }); log(`Removed the old version ${n}.`); } catch { /* in use: tried again later */ }
  }
  // folders left half unpacked by an update that was cut short
  try { for (const n of fs.readdirSync(base)) if (n.endsWith('.partial')) fs.rmSync(path.join(base, n), { recursive: true, force: true }); } catch { /* ignore */ }
}

function defaultSpawn(entry, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], { stdio: 'inherit', env, windowsHide: false });
    child.once('error', (e) => { console.error(e.message); resolve(1); });
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

// run when started as a program (not when imported by the tests)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode = 'forge', ...args] = process.argv.slice(2);
  const home = path.dirname(fileURLToPath(import.meta.url));
  launch(mode, args, { home }).then((code) => process.exit(code));
}
