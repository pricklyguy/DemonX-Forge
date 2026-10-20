// Wires the update check and Update now to the server: the settings file, the routes' logic, and the questions Update now asks.
import fs from 'node:fs';
import path from 'node:path';
import { UpdateChecker } from './check';
import { cleanVersion, defaultUpdateSettings, type UpdateInfo, type UpdateSettings } from './model';
import { WindowsUpdater } from './windows';

export interface UpdateWiring {
  /** The folder with versions\, current.txt and previous.txt (set by launcher.mjs as FORGE_HOME) */
  home: string;
  dataDir: string;
  version: string;
  launcher: boolean;
  /** Why Forge must not be restarted now (an unsaved design), or null */
  busy: () => Promise<string | null>;
  /** Stop the engine and end the process with this code */
  exit: (code: number) => void;
  log?: (kind: 'info' | 'error', text: string) => void;
  platform?: NodeJS.Platform;
  /** Where the release list is asked for (tests and the browser check point it at a local server) */
  releasesUrl?: string;
}

export class BadSetting extends Error {}

export class Updates {
  readonly checker: UpdateChecker;
  readonly windows: WindowsUpdater;
  private settings: UpdateSettings = defaultUpdateSettings();
  private readonly file: string;

  constructor(private readonly w: UpdateWiring) {
    this.file = path.join(w.dataDir, 'settings.json');
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { updates?: Record<string, unknown> };
      const u = j.updates ?? {};
      this.settings = {
        ...defaultUpdateSettings(),
        ...(typeof u.check === 'boolean' ? { check: u.check } : {}),
        ...(typeof u.apply === 'boolean' ? { apply: u.apply } : {}),
        ...(typeof u.skipped === 'string' ? { skipped: cleanVersion(u.skipped) ?? '' } : {}),
      };
    } catch { /* no file yet, or unreadable: the defaults */ }
    const log = w.log ?? ((k, m) => (k === 'error' ? console.warn(m) : console.log(m)));
    this.checker = new UpdateChecker({
      current: w.version, dataDir: w.dataDir, settings: () => this.settings, url: w.releasesUrl,
      install: (w.platform ?? process.platform) === 'win32' && w.launcher ? 'windows' : 'other',
      apply: () => this.windows.view(),
    });
    this.windows = new WindowsUpdater({
      home: w.home, dataDir: w.dataDir, current: w.version, launcher: w.launcher, platform: w.platform,
      allowed: () => this.settings.apply, offered: () => this.checker.offered(), busy: w.busy, log, exit: w.exit,
    });
  }

  start() { this.checker.start(); }
  view(): UpdateInfo { return this.checker.view(); }

  /** Change settings. Only the three known fields, each checked; anything else is refused. */
  change(body: Record<string, unknown>): UpdateInfo {
    const next = { ...this.settings };
    for (const [k, v] of Object.entries(body)) {
      if (k === 'check' || k === 'apply') { if (typeof v !== 'boolean') throw new BadSetting(`"${k}" must be true or false`); next[k] = v; }
      else if (k === 'skipped') {
        if (v === '' ) next.skipped = '';
        else { const c = cleanVersion(v); if (!c) throw new BadSetting('"skipped" must be a version such as 0.15.0, or empty'); next.skipped = c; }
      } else throw new BadSetting(`Unknown setting "${k.slice(0, 40)}"`);
    }
    this.settings = next;
    fs.mkdirSync(this.w.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    let all: Record<string, unknown> = {};
    try { all = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* none */ }
    fs.writeFileSync(tmp, JSON.stringify({ ...all, updates: { check: next.check, apply: next.apply, skipped: next.skipped } }, null, 2));
    fs.renameSync(tmp, this.file);
    this.checker.settingsChanged();
    return this.view();
  }
}
