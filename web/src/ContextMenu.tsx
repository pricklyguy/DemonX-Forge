import { useEffect } from 'react';

export interface MenuItem { label: string; onClick(): void; disabled?: boolean; danger?: boolean; /** A section title, not clickable. */ heading?: boolean }

/** A small right-click menu at the pointer. Any click elsewhere, Esc, or a scroll closes it. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose(): void }) {
  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', key); window.addEventListener('wheel', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); window.removeEventListener('wheel', close); };
  }, [onClose]);
  // keep it on screen: open upward when there is no room below
  const top = Math.min(y, window.innerHeight - items.length * 28 - 12), left = Math.min(x, window.innerWidth - 220);
  return (
    <div className="cmenu" style={{ top, left }} data-testid="context-menu" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it) => it.heading ? <div key={it.label} className="mhead">{it.label}</div> : (
        <button key={it.label} className={it.danger ? 'danger' : ''} disabled={it.disabled} onClick={() => { onClose(); it.onClick(); }}>{it.label}</button>
      ))}
    </div>
  );
}
