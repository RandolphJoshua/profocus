import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/date';
import { useStore, useToday } from '../state/store';
import { useTimer, type TimerMode } from '../state/timer';

const LABELS: Record<TimerMode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const RATINGS = [{ value: 1, label: 'Rough' }, { value: 2, label: 'OK' }, { value: 3, label: 'Flow' }] as const;
const R = 128;
const SIZE = (R + 8) * 2;
const C = 2 * Math.PI * R;

/** Full-screen single-task view. Shown over the app while the hash is #focus. */
export function FocusMode({ onExit }: { onExit: () => void }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const timer = useTimer();
  const task = state.tasks.find((t) => t.id === timer.taskId);
  const openTasks = state.tasks.filter((t) => !t.done && t.date === today);
  const total = timer.plannedMin * 60;
  const progress = total ? 1 - timer.remainingSec / total : 0;

  // Offer a rating when a session gets logged while this screen is open.
  const [ratingFor, setRatingFor] = useState<string | undefined>();
  const seen = useRef(timer.lastSessionId);
  useEffect(() => {
    if (timer.lastSessionId && timer.lastSessionId !== seen.current) setRatingFor(timer.lastSessionId);
    seen.current = timer.lastSessionId;
  }, [timer.lastSessionId]);
  const rated = state.sessions.find((s) => s.id === ratingFor);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <main className={`focus-mode mode-${timer.mode}`} aria-label="Focus mode">
      <button type="button" className="btn ghost focus-exit" onClick={onExit}>Exit (Esc)</button>
      <div className="focus-col">
        <h1 className="focus-h1">Focus</h1>
        {task ? (
          <p className="focus-task">{task.title}</p>
        ) : (
          <label className="focus-pick">
            <span className="focus-task">No task — pick one</span>
            <select aria-label="Pick a task" value="" onChange={(e) => timer.setTask(e.target.value || undefined)}>
              <option value="">Today’s open tasks</option>
              {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
        )}
        <input
          className="focus-intention"
          aria-label="Intention"
          placeholder="I will … (one line)"
          value={state.days[today]?.intention ?? ''}
          onChange={(e) => dispatch({ type: 'SET_DAY', date: today, patch: { intention: e.target.value || undefined } })}
        />

        <div className="timer-face">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} className="ring-bg" />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R} className="ring-fg"
              strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </svg>
          <div className="timer-readout">
            <span className="focus-clock num" role="timer" aria-live="off">{formatClock(timer.remainingSec)}</span>
            <span className="timer-label">{LABELS[timer.mode]}</span>
          </div>
        </div>

        <div className="timer-controls">
          {timer.running ? (
            <button type="button" className="btn primary" onClick={timer.pause}>Pause</button>
          ) : (
            <button type="button" className="btn primary" onClick={() => timer.start()}>{timer.remainingSec < total ? 'Resume' : 'Start'}</button>
          )}
          {timer.mode === 'focus' && timer.remainingSec < total && (
            <button type="button" className="btn" onClick={timer.stopAndLog}>Stop &amp; log</button>
          )}
        </div>

        {rated && (
          <div className="focus-rate" role="group" aria-label="How did that session go?">
            {rated.rating ? (
              <p className="muted">Logged {rated.minutes}m · {RATINGS.find((r) => r.value === rated.rating)?.label}</p>
            ) : (
              <>
                <span className="muted">How did that go?</span>
                {RATINGS.map((r) => (
                  <button key={r.value} type="button" className="btn" onClick={() => dispatch({ type: 'RATE_SESSION', id: rated.id, rating: r.value })}>{r.label}</button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
