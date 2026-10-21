// The files that sit beside versions\ (launcher.mjs, the guides, the helper .bat files) are not part of an update unpacked by
// Update now, so an old install would keep an old launcher.mjs (one that does not know "mcp"). Each version carries its own copy in
// app/root/ and puts them in place when it starts. The start file itself is left alone: cmd reads a running .bat as it goes.
import fs from 'node:fs';
import path from 'node:path';

const KEEP = new Set(['Start DemonX Forge.bat', 'start-forge.sh']);

/** Copy files from `<appRoot>/root` into `home` where they differ. Returns the names it replaced. Never throws. */
export function refreshStartFiles(home: string, appRoot: string, log: (m: string) => void = () => {}): string[] {
  const src = path.join(appRoot, 'root'), done: string[] = [];
  let names: string[] = [];
  try { names = fs.readdirSync(src); } catch { return done; }
  for (const n of names) {
    if (KEEP.has(n)) continue;
    try {
      const from = path.join(src, n), to = path.join(home, n);
      const st = fs.statSync(from);
      if (!st.isFile()) continue;
      const a = fs.readFileSync(from);
      let same = false;
      try { same = a.equals(fs.readFileSync(to)); } catch { /* not there yet */ }
      if (same) continue;
      const tmp = `${to}.new`;
      fs.writeFileSync(tmp, a, { mode: st.mode & 0o777 }); fs.renameSync(tmp, to);
      done.push(n);
    } catch (e) { log(`Could not refresh ${n}: ${(e as Error).message}`); }
  }
  if (done.length) log(`Refreshed ${done.join(', ')} in the Forge folder.`);
  return done;
}
