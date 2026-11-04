import { useState } from 'react';
import { QuickAdd } from '../components/QuickAdd';
import { TaskItem } from '../components/TaskItem';
import { nextColor, uid } from '../lib/storage';
import type { Task } from '../lib/types';
import { useStore, useToday } from '../state/store';
import { byPriority } from './TodayView';

type Filter = 'inbox' | 'today' | 'upcoming' | 'overdue' | 'all' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'all', label: 'All open' },
  { id: 'done', label: 'Done' },
];

function matchFilter(t: Task, f: Filter, today: string): boolean {
  switch (f) {
    case 'inbox': return !t.done && !t.date;
    case 'today': return !t.done && t.date === today;
    case 'upcoming': return !t.done && !!t.date && t.date > today;
    case 'overdue': return !t.done && !!t.date && t.date < today;
    case 'all': return !t.done;
    case 'done': return t.done;
  }
}

export function TasksView() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>('inbox');
  const [projectId, setProjectId] = useState<string>('');

  const match = (t: Task) => (!projectId || t.projectId === projectId) && matchFilter(t, filter, today);
  const count = (f: Filter) => state.tasks.filter((t) => matchFilter(t, f, today)).length;

  const list = state.tasks.filter(match).sort((a, b) => {
    if (filter === 'done') return (b.doneAt ?? '').localeCompare(a.doneAt ?? '');
    if (filter === 'upcoming' || filter === 'all') return (a.date ?? '9999').localeCompare(b.date ?? '9999') || byPriority(a, b);
    return byPriority(a, b);
  });

  return (
    <div className="tasks-page">
      <header className="page-head">
        <h1>Tasks</h1>
        <p className="sub num">{count('all')} open · {count('inbox')} in inbox</p>
      </header>

      <QuickAdd defaultDate={filter === 'today' ? today : undefined} placeholder="Capture a task…  “#project”, “tomorrow”, “30m”, “!high”, “@3pm” all work" />

      <div className="tasks-layout">
        <div>
          <nav className="seg" aria-label="Task filters">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? 'is-on' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}{f.id !== 'done' && <small className="num">{count(f.id) || ''}</small>}
              </button>
            ))}
          </nav>
          <ul className="task-list">
            {list.map((t) => <TaskItem key={t.id} task={t} showDate={filter !== 'today'} canHighlight />)}
            {list.length === 0 && <li className="empty">{filter === 'inbox' ? 'Inbox zero. Lovely.' : 'Nothing here.'}</li>}
          </ul>
        </div>

        <aside className="card projects">
          <h2 className="card-title">Projects</h2>
          <ul>
            <li>
              <button type="button" className={`proj-btn ${projectId === '' ? 'is-on' : ''}`} onClick={() => setProjectId('')}>All projects</button>
            </li>
            {state.projects.filter((p) => !p.archived).map((p) => {
              const open = state.tasks.filter((t) => t.projectId === p.id && !t.done).length;
              return (
                <li key={p.id} className="proj-row">
                  <input
                    type="color"
                    value={p.color}
                    aria-label={`${p.name} colour`}
                    onChange={(e) => dispatch({ type: 'UPDATE_PROJECT', id: p.id, patch: { color: e.target.value } })}
                  />
                  <button type="button" className={`proj-btn ${projectId === p.id ? 'is-on' : ''}`} onClick={() => setProjectId(p.id)}>
                    <i className="dot" style={{ background: p.color }} />{p.name} <small className="muted num">{open || ''}</small>
                  </button>
                  <button type="button" className="icon-btn" title="Archive project" aria-label={`Archive ${p.name}`} onClick={() => dispatch({ type: 'UPDATE_PROJECT', id: p.id, patch: { archived: true } })}>⌫</button>
                </li>
              );
            })}
          </ul>
          <form
            className="row gap"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement;
              const name = input.value.trim();
              if (!name) return;
              dispatch({ type: 'ADD_PROJECT', project: { id: uid('p-'), name, color: nextColor(state.projects.filter((p) => !p.archived).map((p) => p.color)) } });
              input.value = '';
            }}
          >
            <input name="name" placeholder="New project" aria-label="New project name" />
            <button type="submit" className="btn">Add</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
