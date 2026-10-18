import type { TimelineItem } from './api';
import { featureIcon } from './icons';

interface Props {
  items: TimelineItem[];
  /** How many items are active; fewer than the list means the history is rolled back to there. */
  marker: number;
  selected: number | null;
  onSelect(id: number | null): void;
  onEdit(item: TimelineItem): void;
  onMenu(item: TimelineItem, x: number, y: number): void;
  onRollEnd(): void;
}

/** The feature timeline: one icon per step. Click selects, double-click edits, right-click opens the menu; steps after the marker are rolled back. */
export function Timeline({ items, marker, selected, onSelect, onEdit, onMenu, onRollEnd }: Props) {
  const rolled = items.length > 0 && marker < items.length;
  return (
    <div className="timeline" data-testid="timeline" onClick={() => onSelect(null)}>
      {items.length === 0 && <span className="muted">Timeline is empty</span>}
      {items.map((t, i) => (
        <span key={t.id} style={{ display: 'contents' }}>
          {rolled && i === marker && <span className="tmarker" data-testid="timeline-marker" title="The history is rolled back to here" />}
          <span
            className={`titem${t.error ? ' err' : ''}${t.suppressed ? ' off' : ''}${rolled && i >= marker ? ' future' : ''}${selected === t.id ? ' sel' : ''}`}
            title={`${t.name}${t.suppressed ? ' (suppressed)' : ''}${t.error ? ': ' + t.error : ''}. Double-click to edit, right-click for more.`}
            data-testid="timeline-item" data-name={t.name}
            onClick={(e) => { e.stopPropagation(); onSelect(t.id); }}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit(t); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(t.id); onMenu(t, e.clientX, e.clientY); }}
          >
            {featureIcon(t.type)}
          </span>
        </span>
      ))}
      {rolled && <button className="tend" data-testid="roll-end" onClick={(e) => { e.stopPropagation(); onRollEnd(); }}>Roll to end</button>}
    </div>
  );
}
