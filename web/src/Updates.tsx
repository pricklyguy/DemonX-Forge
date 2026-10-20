import { useCallback, useEffect, useRef, useState } from 'react';
import { updates, type UpdateInfo } from './api';

/** What the server says about updates, asked at start and every few minutes (faster while an update is running or Forge is restarting). */
export function useUpdates() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');
  const restarting = useRef(false);
  const refresh = useCallback(async () => {
    try { const i = await updates.info(); setInfo(i); setError(''); return i; } catch (e) { setError((e as Error).message); return null; }
  }, []);
  // `now` is shown at once (a check box must not wait for the answer to change); the server's answer then replaces it
  const act = useCallback(async (f: () => Promise<UpdateInfo>, now?: Partial<UpdateInfo>) => {
    if (now) setInfo((cur) => (cur ? { ...cur, ...now } : cur));
    try { setInfo(await f()); setError(''); } catch (e) { setError((e as Error).message); void refresh(); }
  }, [refresh]);
  const state = info?.apply.state;
  useEffect(() => {
    if (state === 'done') restarting.current = true;   // the server is about to exit: reload when the new one answers
    const fast = state === 'running' || state === 'waiting' || state === 'done';
    const t = setInterval(async () => {
      const i = await refresh();
      if (restarting.current && i && info && i.current !== info.current) location.reload();
    }, fast ? 1000 : 5 * 60_000);
    void (info ? 0 : refresh());
    return () => clearInterval(t);
  }, [state, info, refresh]);
  return { info, error, refresh, act };
}

/** The little badge in the header: shown when a release newer than this one is on offer. */
export function UpdateBadge({ info, onClick }: { info: UpdateInfo | null; onClick(): void }) {
  if (!info || !info.newer || info.skipped || !info.latest) return null;
  return <button className="update-badge" data-testid="update-badge" title={`Version ${info.latest.version} is available`} onClick={onClick}>Update {info.latest.version}</button>;
}

const ago = (t: number) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export function UpdatesDialog({ info, error, dirty, act, onClose }: { info: UpdateInfo | null; error: string; dirty: boolean; act(f: () => Promise<UpdateInfo>, now?: Partial<UpdateInfo>): Promise<void>; onClose(): void }) {
  if (!info) return (
    <div className="modalback" onPointerDown={onClose}><div className="dialog updates" data-testid="updates-dialog" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dhead">UPDATES</div><div className="dnote">{error || 'Asking the server…'}</div>
      <div className="dbtns"><button className="primary" onClick={onClose}>Close</button></div></div></div>);
  const a = info.apply, r = info.latest, windows = info.install === 'windows';
  const working = a.state === 'running' || a.state === 'waiting' || a.state === 'done';
  const canNow = !!r && info.newer && a.available && !dirty && !working;
  return (
    <div className="modalback" onPointerDown={onClose}>
      <div className="dialog updates" data-testid="updates-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="dhead">UPDATES</div>
        <div className="drow"><span>You have</span><b data-testid="update-current">{info.current}</b></div>
        {!info.enabled && <div className="dnote">Checking is off. Forge asks GitHub nothing until you tick "Check for updates".</div>}
        {info.enabled && info.newer && r && <>
          <div className="drow"><span>Available</span><b data-testid="update-latest">{r.version}{r.prerelease ? ' (test release)' : ''}</b></div>
          {r.notes && <pre className="update-notes" data-testid="update-notes">{r.notes}</pre>}
          <div className="dnote"><a href={info.url} target="_blank" rel="noopener noreferrer">Release page on GitHub</a>{info.skipped ? ' · you chose to skip this version' : ''}</div>
        </>}
        {info.enabled && !info.newer && !info.error && <div className="dnote" data-testid="update-uptodate">{info.checkedAt ? 'Forge is up to date.' : 'Not checked yet.'}</div>}
        {info.error && <div className="dnote warn" data-testid="update-error">Could not check: {info.error}</div>}
        {info.enabled && <div className="dnote">Last checked: {info.checking ? 'checking now…' : ago(info.checkedAt)}</div>}

        {working && <div className="dnote" data-testid="update-progress">{a.state === 'done' ? a.message : a.step}</div>}
        {!working && a.message && <div className={`dnote${a.state === 'failed' ? ' warn' : ''}`} data-testid="update-message">{a.message}</div>}
        {dirty && info.newer && windows && <div className="dnote warn" data-testid="update-dirty">Save your design first (File &gt; Save): Forge restarts to update, and unsaved changes would be lost.</div>}
        {!windows && info.newer && <div className="dnote">To update: download the Windows zip from the release page and extract it over the old folder (see READ ME FIRST).</div>}
        {windows && info.newer && !a.available && !working && a.reason && <div className="dnote" data-testid="update-reason">{a.reason}</div>}

        <label className="drow"><span>Check</span><input type="checkbox" aria-label="Check for updates" checked={info.enabled} onChange={(e) => void act(() => updates.settings({ check: e.target.checked }), { enabled: e.target.checked })} /></label>
        {windows && <label className="drow"><span>Update now</span><input type="checkbox" aria-label="Allow Update now" checked={info.allowApply} onChange={(e) => void act(() => updates.settings({ apply: e.target.checked }), { allowApply: e.target.checked })} /></label>}
        {error && <div className="dnote warn">{error}</div>}
        <div className="dbtns">
          <button disabled={!info.enabled || info.checking || working} onClick={() => void act(updates.check)}>Check now</button>
          {info.newer && r && !info.skipped && <button disabled={working} onClick={() => void act(() => updates.settings({ skipped: r.version }))}>Skip this version</button>}
          {info.newer && r && info.skipped && <button onClick={() => void act(() => updates.settings({ skipped: '' }))}>Stop skipping</button>}
          {windows && info.newer && r && <button className="primary" data-testid="update-now" disabled={!canNow} onClick={() => void act(() => updates.apply(r.version))}>Update now</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
