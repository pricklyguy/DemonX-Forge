import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BadSetting, Updates } from '../src/update';

let tmp: string;
const make = () => new Updates({ home: tmp, dataDir: path.join(tmp, 'data'), version: '1.0.0', launcher: true, platform: 'win32', busy: async () => null, exit: () => {}, log: () => {} });
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-upd-set-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('update settings', () => {
  it('start with checking on and Update now off, and say this is the Windows package', () => {
    const v = make().view();
    expect(v).toMatchObject({ enabled: true, current: '1.0.0', install: 'windows' });
    expect(v.apply.available).toBe(false);
    expect(v.apply.reason).toMatch(/turned off/);   // off until the owner turns it on
  });

  it('are kept in data/settings.json and read again at the next start, next to anything else saved there', () => {
    fs.mkdirSync(path.join(tmp, 'data'));
    fs.writeFileSync(path.join(tmp, 'data', 'settings.json'), JSON.stringify({ other: 1 }));
    make().change({ check: false, apply: true, skipped: ' v1.2.0 ' });
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'settings.json'), 'utf8'));
    expect(saved).toEqual({ other: 1, updates: { check: false, apply: true, skipped: '1.2.0' } });
    expect(make().view().enabled).toBe(false);
  });

  it('refuse anything that is not a known setting of the right kind', () => {
    const u = make();
    for (const bad of [{ check: 'yes' }, { apply: 1 }, { skipped: 'latest' }, { skipped: 5 }, { channel: 'test' }, { x: true }]) expect(() => u.change(bad as never)).toThrow(BadSetting);
    expect(u.change({ skipped: '' }).enabled).toBe(true);
  });

  it('ignore a settings file that was edited into nonsense', () => {
    fs.mkdirSync(path.join(tmp, 'data'));
    fs.writeFileSync(path.join(tmp, 'data', 'settings.json'), JSON.stringify({ updates: { check: 'no', apply: 5, skipped: '../x' } }));
    expect(make().view().enabled).toBe(true);
  });

  it('say it is not the Windows package anywhere else', () => {
    expect(new Updates({ home: tmp, dataDir: tmp, version: '1.0.0', launcher: false, platform: 'linux', busy: async () => null, exit: () => {}, log: () => {} }).view().install).toBe('other');
  });
});
