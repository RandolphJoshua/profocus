import { formatClock, formatDuration } from '../lib/date';
import { focusMinutesOn } from '../lib/stats';
import { useStore, useToday } from '../state/store';
import { useTimer, type TimerMode } from '../state/timer';

const LABELS: Record<TimerMode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

export function FocusTimer({ compact = false }: { compact?: boolean }) {
  const timer = useTimer();
  const { state } = useStore();
  const today = useToday();
  const openTasks = state.tasks.filter((t) => !t.done && (t.date === today || t.id === timer.taskId));
  const task = state.tasks.find((t) => t.id === timer.taskId);
  const total = timer.plannedMin * 60;
  const progress = total ? 1 - timer.remainingSec / total : 0;
  const R = compact ? 34 : 64;
  const C = 2 * Math.PI * R;
  const size = (R + 8) * 2;
  const todayMin = focusMinutesOn(state.sessions, today);

  return (
    <section className={`timer ${compact ? 'is-compact' : ''} mode-${timer.mode} ${timer.running ? 'is-running' : ''}`} aria-label="Focus timer">
      {!compact && (
        <div className="timer-modes" role="tablist" aria-label="Timer mode">
          {(Object.keys(LABELS) as TimerMode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={timer.mode === m} className={timer.mode === m ? 'is-on' : ''} onClick={() => timer.setMode(m)}>
              {LABELS[m]}
            </button>
          ))}
        </div>
      )}

      <div className="timer-face">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={R} className="ring-bg" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={R}
            className="ring-fg"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="timer-readout">
          <span className="timer-clock num" role="timer" aria-live="off">{formatClock(timer.remainingSec)}</span>
          <span className="timer-label">{LABELS[timer.mode]}</span>
        </div>
      </div>

      {timer.mode === 'focus' && (
        compact ? (
          <p className="timer-task" title={task?.title}>{task ? task.title : 'No task selected'}</p>
        ) : (
          <label className="timer-task-select">
            <span className="sr-only">Working on</span>
            <select value={timer.taskId ?? ''} onChange={(e) => timer.setTask(e.target.value || undefined)}>
              <option value="">Working on… (optional)</option>
              {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
        )
      )}

      <div className="timer-controls">
        {timer.running ? (
          <button type="button" className="btn primary" onClick={timer.pause}>Pause</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => timer.start()}>{timer.remainingSec < total ? 'Resume' : 'Start'}</button>
        )}
        {!compact && <button type="button" className="btn" onClick={timer.reset}>Reset</button>}
        {timer.mode === 'focus' && timer.remainingSec < total && (
          <button type="button" className="btn" onClick={timer.stopAndLog} title="Stop now and log the minutes you did">Stop &amp; log</button>
        )}
        {!compact && <button type="button" className="btn ghost" onClick={timer.skip}>Skip</button>}
      </div>

      {!compact && (
        <p className="timer-foot muted num">
          {formatDuration(todayMin)} focused today · session {(timer.cycleCount % state.settings.longBreakEvery) + 1} of {state.settings.longBreakEvery}
        </p>
      )}
    </section>
  );
}
