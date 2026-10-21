import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// scripts/linux/install-launcher.sh and uninstall-launcher.sh, run as the real programs with a throwaway home folder
const SCRIPTS = path.resolve(__dirname, '../../scripts/linux');
let tmp: string, pkg: string, home: string;
const run = (script: string, input = '') => spawnSync('sh', [path.join(pkg, script)], { input, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, XDG_DATA_HOME: '', XDG_CONFIG_HOME: '' } });
const exists = (p: string) => fs.existsSync(path.join(home, p));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-linux-'));
  pkg = path.join(tmp, 'Forge Folder'); home = path.join(tmp, 'home'); // (a space in the path: the entries must still work)
  fs.mkdirSync(pkg); fs.mkdirSync(path.join(home, 'Desktop'), { recursive: true });
  for (const f of fs.readdirSync(SCRIPTS)) { fs.copyFileSync(path.join(SCRIPTS, f), path.join(pkg, f)); fs.chmodSync(path.join(pkg, f), 0o755); }
  fs.writeFileSync(path.join(pkg, 'forge.png'), 'png');
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe.skipIf(process.platform === 'win32')('the Linux menu entry, desktop icon and start at login', () => {
  it('adds a menu entry and a desktop icon that start Forge from its own folder, and no login entry when the answer is no', () => {
    const r = run('install-launcher.sh', 'n\n');
    expect(r.status).toBe(0);
    for (const f of ['.local/share/applications/demonx-forge.desktop', 'Desktop/DemonX Forge.desktop']) {
      const t = fs.readFileSync(path.join(home, f), 'utf8');
      expect(t).toContain(`Exec="${pkg}/start-forge.sh"`);
      expect(t).toContain(`Path=${pkg}`);
      expect(t).toContain(`Icon=${pkg}/forge.png`);
      expect(t).toContain('Terminal=true');
      expect(fs.statSync(path.join(home, f)).mode & 0o100).toBeTruthy(); // executable, so the desktop will launch it
    }
    expect(exists('.config/autostart/demonx-forge.desktop')).toBe(false);
  });

  it('starts at login when asked, in the background: with the browser (Y) or without it (n)', () => {
    run('install-launcher.sh', 'y\n\n');
    let t = fs.readFileSync(path.join(home, '.config/autostart/demonx-forge.desktop'), 'utf8');
    expect(t).toContain(`Exec="${pkg}/start-forge.sh"\n`);
    expect(t).toContain('Terminal=false');
    run('install-launcher.sh', 'y\nn\n');
    t = fs.readFileSync(path.join(home, '.config/autostart/demonx-forge.desktop'), 'utf8');
    expect(t).toContain(`Exec="${pkg}/start-forge.sh" nobrowser`);
  });

  it('changes its mind when run again, and uninstall removes everything it made', () => {
    run('install-launcher.sh', 'y\n\n');
    expect(exists('.config/autostart/demonx-forge.desktop')).toBe(true);
    run('install-launcher.sh', 'n\n');
    expect(exists('.config/autostart/demonx-forge.desktop')).toBe(false);
    run('install-launcher.sh', 'y\n\n');
    expect(run('uninstall-launcher.sh').status).toBe(0);
    for (const f of ['.local/share/applications/demonx-forge.desktop', '.config/autostart/demonx-forge.desktop', 'Desktop/DemonX Forge.desktop']) expect(exists(f)).toBe(false);
    expect(fs.existsSync(path.join(pkg, 'forge.png'))).toBe(true); // the program itself is not touched
  });

  it('refuses to run from a folder that has no start-forge.sh', () => {
    fs.rmSync(path.join(pkg, 'start-forge.sh'));
    const r = run('install-launcher.sh');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/start-forge\.sh is not in/);
  });
});
