import type { TimelineItem } from './api';
import { featureIcon } from './icons';

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="timeline" data-testid="timeline">
      {items.length === 0 && <span className="muted">Timeline is empty</span>}
      {items.map((t) => (
        <span key={t.id} className={`titem${t.error ? ' err' : ''}${t.suppressed ? ' off' : ''}`} title={`${t.name}${t.error ? ': ' + t.error : ''}`} data-testid="timeline-item" data-name={t.name}>
          {featureIcon(t.type)}
        </span>
      ))}
    </div>
  );
}
