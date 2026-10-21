import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshStartFiles } from '../src/update/startFiles';

describe('refreshStartFiles', () => {
  it('replaces a changed launcher and guide, leaves the start file and same files alone', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-sf-'));
    const home = path.join(d, 'home'), app = path.join(d, 'app');
    fs.mkdirSync(home); fs.mkdirSync(path.join(app, 'root'), { recursive: true });
    const w = (dir: string, n: string, t: string) => fs.writeFileSync(path.join(dir, n), t);
    w(path.join(app, 'root'), 'launcher.mjs', 'new'); w(home, 'launcher.mjs', 'old');
    w(path.join(app, 'root'), 'Start DemonX Forge.bat', 'new'); w(home, 'Start DemonX Forge.bat', 'old');
    w(path.join(app, 'root'), 'READ ME FIRST.txt', 'same'); w(home, 'READ ME FIRST.txt', 'same');
    w(path.join(app, 'root'), 'forge.ico', 'icon');
    expect(refreshStartFiles(home, app).sort()).toEqual(['forge.ico', 'launcher.mjs']);
    expect(fs.readFileSync(path.join(home, 'launcher.mjs'), 'utf8')).toBe('new');
    expect(fs.readFileSync(path.join(home, 'Start DemonX Forge.bat'), 'utf8')).toBe('old');
    expect(fs.existsSync(path.join(home, 'launcher.mjs.new'))).toBe(false);
    expect(refreshStartFiles(home, app)).toEqual([]);
    expect(refreshStartFiles(home, path.join(d, 'nothing'))).toEqual([]);
  });
});
