import { useEffect, useState, type CSSProperties } from 'react';
import { formatDuration, relativeLabel } from '../lib/date';
import type { Priority, Task } from '../lib/types';
import { useStore, useToday } from '../state/store';
import { useTimer } from '../state/timer';
import { useToast } from './Toaster';

/** After checking, the row waits this long (strike-through draws) and then collapses. */
export const COLLAPSE_DELAY_MS = 600;
export const COLLAPSE_MS = 240;

interface TaskItemProps {
  task: Task;
  showDate?: boolean;
  /** Offer the "make this today's highlight" action. */
  canHighlight?: boolean;
  /** The list keeps a just-completed task on screen; once done, this row collapses out. */
  lingering?: boolean;
  /** Called when the check completes the task, so the list can keep the row while it collapses. */
  onComplete?: (task: Task) => void;
}

export function TaskItem({ task, showDate, canHighlight, lingering, onComplete }: TaskItemProps) {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const today = useToday();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pop, setPop] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const project = state.projects.find((p) => p.id === task.projectId);
  const focused = state.sessions.filter((s) => s.taskId === task.id).reduce((n, s) => n + s.minutes, 0);
  const overdue = !task.done && task.date && task.date < today;
  const isActive = timer.taskId === task.id && timer.mode === 'focus';

  useEffect(() => {
    if (!(task.done && lingering)) {
      setCollapsed(false);
      return;
    }
    const id = window.setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [task.done, lingering]);

  const toggle = () => {
    const completing = !task.done;
    dispatch({ type: 'TOGGLE_TASK', id: task.id, now: new Date().toISOString() });
    setPop(completing);
    if (!completing) return;
    onComplete?.(task);
    toast('Done', { action: { label: 'Undo', run: () => dispatch({ type: 'TOGGLE_TASK', id: task.id, now: new Date().toISOString() }) } });
  };
  const remove = () => {
    dispatch({ type: 'DELETE_TASK', id: task.id });
    toast('Deleted', { action: { label: 'Undo', run: () => dispatch({ type: 'ADD_TASK', task }) } });
  };

  const update = (patch: Partial<Task>) => dispatch({ type: 'UPDATE_TASK', id: task.id, patch });

  return (
    <li className={`task-item ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="task-clip">
    <div
      className={`task ${task.done ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
      draggable={!task.done && !editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/profocus-task', task.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      style={project ? ({ '--c': project.color } as CSSProperties) : undefined}
    >
      <div className="task-row">
        <button
          type="button"
          className={`check ${pop ? 'is-popping' : ''}`}
          onAnimationEnd={() => setPop(false)}
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Mark “${task.title}” not done` : `Complete “${task.title}”`}
          onClick={toggle}
        />
        <button type="button" className="task-title" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {project && <i className="dot" />}{task.title}
        </button>
        <div className="task-meta">
          {task.priority && <span className={`prio-dot prio-${task.priority}`} title={`${task.priority} priority`} />}
          {project && <span className="tag">{project.name}</span>}
          {task.estimateMin ? (
            <span className="muted num">{focused ? `${formatDuration(focused)} / ` : ''}{formatDuration(task.estimateMin)}</span>
          ) : focused ? <span className="muted">{formatDuration(focused)}</span> : null}
          {showDate && task.date && <span className={overdue ? 'overdue' : 'muted'}>{relativeLabel(task.date, today)}</span>}
        </div>
        {!task.done && (
          <button
            type="button"
            className="icon-btn play"
            aria-label={`Focus on “${task.title}”`}
            title="Start a focus session"
            onClick={() => {
              if (timer.mode !== 'focus') timer.setMode('focus');
              timer.start(task.id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>
          </button>
        )}
      </div>

      {editing && (
        <div className="task-edit">
          <label>Title<input value={task.title} onChange={(e) => update({ title: e.target.value })} /></label>
          <div className="grid-3">
            <label>Date
              <input type="date" value={task.date ?? ''} onChange={(e) => update({ date: e.target.value || undefined })} />
            </label>
            <label>Estimate (min)
              <input type="number" min={0} step={5} value={task.estimateMin ?? ''} onChange={(e) => update({ estimateMin: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label>Priority
              <select value={task.priority ?? ''} onChange={(e) => update({ priority: (e.target.value || undefined) as Priority | undefined })}>
                <option value="">None</option>
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <label>Project
            <select value={task.projectId ?? ''} onChange={(e) => update({ projectId: e.target.value || undefined })}>
              <option value="">No project</option>
              {state.projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Notes<textarea rows={3} value={task.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} /></label>
          <div className="row gap">
            {canHighlight && !task.done && (
              <button type="button" className="btn" onClick={() => {
                dispatch({ type: 'SET_DAY', date: today, patch: { highlight: task.title, highlightTaskId: task.id, highlightDone: false } });
                if (task.date !== today) update({ date: today });
              }}>Make today’s highlight</button>
            )}
            <button type="button" className="btn" onClick={() => update({ date: undefined })}>Move to inbox</button>
            <span className="spacer" />
            <button type="button" className="btn danger" onClick={remove}>Delete</button>
          </div>
        </div>
      )}
    </div>
    </div>
    </li>
  );
}
