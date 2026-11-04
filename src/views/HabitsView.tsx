import type { CSSProperties } from 'react';
import { addDays, formatDay, shortWeekday } from '../lib/date';
import { habitStreak } from '../lib/stats';
import { nextColor, uid } from '../lib/storage';
import { useStore, useToday } from '../state/store';

const HISTORY_DAYS = 28;

export function HabitsView() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const habits = state.habits.filter((h) => !h.archived);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(today, i - HISTORY_DAYS + 1));

  return (
    <div className="habits-page">
      <header className="page-head">
        <p className="eyebrow">Small things, done often</p>
        <h1 className="display">Habits</h1>
      </header>

      <form
        className="row gap add-habit"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement;
          const name = input.value.trim();
          if (!name) return;
          dispatch({
            type: 'ADD_HABIT',
            habit: { id: uid('h-'), name, color: nextColor(state.habits.filter((h) => !h.archived).map((h) => h.color)), createdAt: new Date().toISOString() },
          });
          input.value = '';
        }}
      >
        <input name="name" placeholder="New habit, e.g. “Read 20 pages”, “Walk 8k steps”" aria-label="New habit" />
        <button type="submit" className="btn primary">Add habit</button>
      </form>

      {habits.length === 0 ? (
        <p className="empty card">No habits yet. Start with one you can do on your worst day.</p>
      ) : (
        <div className="card habit-table" role="table" aria-label="Habits this week">
          <div className="habit-row head" role="row">
            <span role="columnheader">Habit</span>
            {last7.map((d) => (
              <span key={d} role="columnheader" className={d === today ? 'is-today' : ''}>{shortWeekday(d).slice(0, 2)}<small>{Number(d.slice(8))}</small></span>
            ))}
            <span role="columnheader">Streak</span>
            <span role="columnheader">Last 4 weeks</span>
            <span />
          </div>
          {habits.map((h) => {
            const streak = habitStreak(state.habitLog, h.id, today);
            return (
              <div key={h.id} className="habit-row" role="row" style={{ '--c': h.color } as CSSProperties}>
                <span role="cell" className="habit-name">
                  <input
                    type="color"
                    value={h.color}
                    aria-label={`${h.name} colour`}
                    onChange={(e) => dispatch({ type: 'UPDATE_HABIT', id: h.id, patch: { color: e.target.value } })}
                  />
                  {h.name}
                </span>
                {last7.map((d) => {
                  const on = state.habitLog[d]?.includes(h.id) ?? false;
                  return (
                    <span role="cell" key={d}>
                      <button
                        type="button"
                        className={`habit-cell ${on ? 'is-on' : ''}`}
                        aria-pressed={on}
                        aria-label={`${h.name} on ${formatDay(d)}`}
                        onClick={() => dispatch({ type: 'TOGGLE_HABIT', id: h.id, date: d })}
                      />
                    </span>
                  );
                })}
                <span role="cell" className="streak">{streak > 0 ? `${streak}🔥` : '—'}</span>
                <span role="cell" className="heat" aria-label={`${history.filter((d) => state.habitLog[d]?.includes(h.id)).length} of the last ${HISTORY_DAYS} days`}>
                  {history.map((d) => <i key={d} className={state.habitLog[d]?.includes(h.id) ? 'on' : ''} />)}
                </span>
                <span role="cell">
                  <button type="button" className="icon-btn" aria-label={`Archive ${h.name}`} title="Archive" onClick={() => dispatch({ type: 'UPDATE_HABIT', id: h.id, patch: { archived: true } })}>⌫</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
