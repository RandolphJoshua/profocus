import { useState } from 'react';
import { formatDuration, relativeLabel } from '../lib/date';
import type { DateKey, Task } from '../lib/types';
import { useStore } from '../state/store';

type Filter = 'suggested' | 'inbox' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'suggested', label: 'Suggested' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'all', label: 'All' },
];
/** Rows shown before "Show more": enough to plan with, short enough to scan. */
const VISIBLE = 6;

interface WeekTrayProps {
  /** Unscheduled open tasks, already sorted by priority. */
  tasks: Task[];
  weekStart: DateKey;
  weekEnd: DateKey;
  today: DateKey;
}

/** Overdue, due this week, or high priority: what most likely needs a slot this week. */
export function isSuggested(t: Task, weekStart: DateKey, weekEnd: DateKey, today: DateKey): boolean {
  if (t.date && t.date < today) return true;
  if (t.date && t.date >= weekStart && t.date <= weekEnd) return true;
  return t.priority === 'high';
}

/** The Week screen's "To schedule" list: filtered, searchable and short, with the rest one click away. */
export function WeekTray({ tasks, weekStart, weekEnd, today }: WeekTrayProps) {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>('suggested');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const q = query.trim().toLowerCase();
  const inFilter = (t: Task) => (filter === 'all' ? true : filter === 'inbox' ? !t.date : isSuggested(t, weekStart, weekEnd, today));
  const list = tasks.filter((t) => inFilter(t) && (!q || t.title.toLowerCase().includes(q)));
  const shown = expanded || q ? list : list.slice(0, VISIBLE);
  const count = (f: Filter) => tasks.filter((t) => (f === 'all' ? true : f === 'inbox' ? !t.date : isSuggested(t, weekStart, weekEnd, today))).length;

  return (
    <aside className="card week-tray" aria-label="To schedule">
      <div className="row gap tray-head">
        <h2 className="card-title">To schedule</h2>
        <span className="spacer" />
        <span className="muted num">{tasks.length}</span>
      </div>
      <div className="seg tray-seg" role="tablist" aria-label="Which tasks">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? 'is-on' : ''}
            onClick={() => { setFilter(f.id); setExpanded(false); }}
          >
            {f.label} <span className="num muted">{count(f.id)}</span>
          </button>
        ))}
      </div>
      {tasks.length > VISIBLE && (
        <input className="tray-search" type="search" placeholder="Find a task" aria-label="Find a task" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <ul className="tray-list">
        {shown.map((t) => {
          const p = state.projects.find((x) => x.id === t.projectId);
          const overdue = !!t.date && t.date < today;
          return (
            <li
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/profocus-task', t.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="tray-item"
              title={t.title}
            >
              <i style={{ background: p?.color ?? 'var(--control)' }} />
              <span className="tray-title">{t.title}</span>
              {t.date && <small className={overdue ? 'overdue' : 'muted'}>{relativeLabel(t.date, today)}</small>}
              {t.estimateMin ? <small className="muted num">{formatDuration(t.estimateMin)}</small> : null}
            </li>
          );
        })}
        {list.length === 0 && <li className="empty">{q ? 'No match.' : filter === 'suggested' ? 'Nothing urgent. Try Inbox.' : 'All caught up.'}</li>}
      </ul>
      {!q && list.length > VISIBLE && (
        <button type="button" className="link-btn tray-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Show ${list.length - VISIBLE} more`}
        </button>
      )}
      <p className="hint">Drag a task onto a day to time-block it.</p>
    </aside>
  );
}
