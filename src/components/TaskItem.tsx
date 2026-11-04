import { useState, type CSSProperties } from 'react';
import { formatDuration, relativeLabel } from '../lib/date';
import type { Priority, Task } from '../lib/types';
import { useStore, useToday } from '../state/store';
import { useTimer } from '../state/timer';

interface TaskItemProps {
  task: Task;
  showDate?: boolean;
  /** Offer the "make this today's highlight" action. */
  canHighlight?: boolean;
}

export function TaskItem({ task, showDate, canHighlight }: TaskItemProps) {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const project = state.projects.find((p) => p.id === task.projectId);
  const focused = state.sessions.filter((s) => s.taskId === task.id).reduce((n, s) => n + s.minutes, 0);
  const overdue = !task.done && task.date && task.date < today;
  const isActive = timer.taskId === task.id && timer.mode === 'focus';

  const update = (patch: Partial<Task>) => dispatch({ type: 'UPDATE_TASK', id: task.id, patch });

  return (
    <li
      className={`task ${task.done ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
      draggable={!task.done && !editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/profocus-task', task.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      style={project ? ({ '--proj': project.color } as CSSProperties) : undefined}
    >
      <div className="task-row">
        <button
          type="button"
          className="check"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Mark “${task.title}” not done` : `Complete “${task.title}”`}
          onClick={() => dispatch({ type: 'TOGGLE_TASK', id: task.id, now: new Date().toISOString() })}
        />
        <button type="button" className="task-title" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {task.title}
        </button>
        <div className="task-meta">
          {task.priority && <span className={`prio-dot prio-${task.priority}`} title={`${task.priority} priority`} />}
          {project && <span className="tag"><i style={{ background: project.color }} />{project.name}</span>}
          {task.estimateMin ? (
            <span className="muted">{focused ? `${formatDuration(focused)} / ` : ''}{formatDuration(task.estimateMin)}</span>
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
          >▶</button>
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
              }}>★ Make today’s highlight</button>
            )}
            <button type="button" className="btn" onClick={() => update({ date: undefined })}>Move to inbox</button>
            <span className="spacer" />
            <button type="button" className="btn danger" onClick={() => dispatch({ type: 'DELETE_TASK', id: task.id })}>Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}
