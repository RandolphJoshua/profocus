import { useState, type CSSProperties, type Ref } from 'react';
import { BlockEditor, newDraft, type BlockDraft } from '../components/BlockEditor';
import { DayColumn, TimeGutter } from '../components/DayColumn';
import { FocusTimer } from '../components/FocusTimer';
import { QuickAdd } from '../components/QuickAdd';
import { TaskItem } from '../components/TaskItem';
import { addDays, formatDay, formatDuration } from '../lib/date';
import { focusMinutesOn, habitStreak } from '../lib/stats';
import type { DayPlan, Task } from '../lib/types';
import { useStore, useToday } from '../state/store';

const PRIO_RANK = { high: 0, med: 1, low: 2 } as const;
export const byPriority = (a: Task, b: Task) =>
  (a.priority ? PRIO_RANK[a.priority] : 3) - (b.priority ? PRIO_RANK[b.priority] : 3) || a.createdAt.localeCompare(b.createdAt);

function greeting(h: number) {
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TodayView({ quickAddRef }: { quickAddRef: Ref<HTMLInputElement> }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [showDone, setShowDone] = useState(false);
  const plan = state.days[today] ?? {};
  const tomorrow = addDays(today, 1);

  const todays = state.tasks.filter((t) => t.date === today);
  const open = todays.filter((t) => !t.done).sort(byPriority);
  const done = todays.filter((t) => t.done);
  const overdue = state.tasks.filter((t) => !t.done && t.date && t.date < today);
  const plannedMin = open.reduce((n, t) => n + (t.estimateMin ?? 0), 0);
  const focusMin = focusMinutesOn(state.sessions, today);
  const habits = state.habits.filter((h) => !h.archived);
  const highlightTask = state.tasks.find((t) => t.id === plan.highlightTaskId);
  const highlightDone = plan.highlightDone || highlightTask?.done;

  const setDay = (patch: Partial<DayPlan>, date = today) =>
    dispatch({ type: 'SET_DAY', date, patch });

  return (
    <div className="today">
      <section className="today-plan">
        <header className="page-head">
          <p className="eyebrow">{greeting(new Date().getHours())}</p>
          <h1 className="display">{formatDay(today)}</h1>
          <p className="muted">
            {open.length} open · {formatDuration(plannedMin)} planned · <strong>{formatDuration(focusMin)}</strong> focused
          </p>
        </header>

        <article className={`highlight ${highlightDone ? 'is-done' : ''}`}>
          <p className="eyebrow">Today’s highlight</p>
          {plan.highlight ? (
            <div className="highlight-row">
              <button
                type="button"
                className="check big"
                role="checkbox"
                aria-checked={!!highlightDone}
                aria-label="Highlight done"
                onClick={() => {
                  setDay({ highlightDone: !highlightDone });
                  if (highlightTask && highlightTask.done === !!highlightDone) {
                    dispatch({ type: 'TOGGLE_TASK', id: highlightTask.id, now: new Date().toISOString() });
                  }
                }}
              />
              <input
                className="highlight-input"
                value={plan.highlight}
                onChange={(e) => setDay({ highlight: e.target.value })}
                aria-label="Highlight"
              />
              <button type="button" className="icon-btn" aria-label="Clear highlight" onClick={() => setDay({ highlight: undefined, highlightTaskId: undefined, highlightDone: false })}>×</button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get('h')?.toString().trim();
                if (v) setDay({ highlight: v, highlightDone: false });
              }}
            >
              <input name="h" className="highlight-input" placeholder="What one thing would make today a win?" aria-label="Set today's highlight" />
              <p className="hint">Pick one meaningful thing and protect time for it. You can also ★ a task below.</p>
            </form>
          )}
        </article>

        {overdue.length > 0 && (
          <div className="banner">
            <span>{overdue.length} unfinished task{overdue.length > 1 ? 's' : ''} from earlier days</span>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'ROLL_OVER', to: today })}>Move to today</button>
          </div>
        )}

        <QuickAdd ref={quickAddRef} defaultDate={today} />

        <ul className="task-list" aria-label="Today's tasks">
          {open.map((t) => <TaskItem key={t.id} task={t} canHighlight />)}
          {open.length === 0 && <li className="empty">Nothing planned yet. Add a few tasks, then drag them onto the timeline →</li>}
        </ul>
        {done.length > 0 && (
          <>
            <button type="button" className="link-btn" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </button>
            {showDone && <ul className="task-list">{done.map((t) => <TaskItem key={t.id} task={t} />)}</ul>}
          </>
        )}

        {habits.length > 0 && (
          <section className="card">
            <h2 className="card-title">Habits</h2>
            <ul className="habit-chips">
              {habits.map((h) => {
                const on = state.habitLog[today]?.includes(h.id) ?? false;
                const streak = habitStreak(state.habitLog, h.id, today);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      className={`habit-chip ${on ? 'is-on' : ''}`}
                      style={{ '--c': h.color } as CSSProperties}
                      aria-pressed={on}
                      onClick={() => dispatch({ type: 'TOGGLE_HABIT', id: h.id, date: today })}
                    >
                      {h.name}{streak > 1 && <small> · {streak}🔥</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={`card shutdown ${plan.shutdownDone ? 'is-done' : ''}`}>
          <h2 className="card-title">End-of-day shutdown</h2>
          <fieldset className="energy">
            <legend>Energy today</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={plan.energy === n} className={plan.energy === n ? 'is-on' : ''} onClick={() => setDay({ energy: n })}>
                {['😮‍💨', '😕', '🙂', '😊', '⚡'][n - 1]}
              </button>
            ))}
          </fieldset>
          <label>What went well / what got in the way?
            <textarea rows={2} value={plan.shutdownNote ?? ''} onChange={(e) => setDay({ shutdownNote: e.target.value })} />
          </label>
          <label>Tomorrow’s highlight
            <input
              value={state.days[tomorrow]?.highlight ?? ''}
              placeholder="Decide it tonight, start fresh tomorrow"
              onChange={(e) => setDay({ highlight: e.target.value || undefined }, tomorrow)}
            />
          </label>
          <div className="row gap">
            {open.length > 0 && (
              <button type="button" className="btn" onClick={() => open.forEach((t) => dispatch({ type: 'UPDATE_TASK', id: t.id, patch: { date: tomorrow } }))}>
                Move {open.length} unfinished to tomorrow
              </button>
            )}
            <button type="button" className={`btn ${plan.shutdownDone ? '' : 'primary'}`} onClick={() => setDay({ shutdownDone: !plan.shutdownDone })}>
              {plan.shutdownDone ? '✓ Shutdown complete' : 'Shutdown complete'}
            </button>
          </div>
        </section>
      </section>

      <section className="today-side">
        <FocusTimer />
        <div className="timeline card">
          <div className="timeline-head">
            <h2 className="card-title">Time blocks</h2>
            <span className="hint">Drag to create · drop tasks here</span>
          </div>
          <div className="timeline-scroll">
            <div className="timeline-grid">
              <TimeGutter hourHeight={52} />
              <DayColumn date={today} hourHeight={52} isToday onCreate={(d, s, e) => setDraft(newDraft(d, s, e))} onSelect={(b) => setDraft(b)} />
            </div>
          </div>
        </div>
      </section>

      {draft && <BlockEditor key={draft.id ?? 'new'} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
