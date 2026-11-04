import { useStore } from '../state/store';
import type { DateKey } from '../lib/types';

/** "This week's three": the week's priorities with checkboxes. Shows a prompt when none are set. */
export function WeekPriorities({ week }: { week: DateKey }) {
  const { state, dispatch } = useStore();
  const priorities = state.reviews[week]?.priorities ?? [];

  return (
    <section className="panel week-three" aria-label="This week’s three">
      <h2 className="panel-title">This week’s three</h2>
      {priorities.length === 0 ? (
        <p className="muted">No priorities set — <a className="text-link" href="#week">Plan my week</a></p>
      ) : (
        <ul className="prio-list">
          {priorities.map((p) => {
            const goal = state.goals.find((g) => g.id === p.goalId);
            return (
              <li key={p.id} className={`prio-row ${p.done ? 'is-done' : ''}`}>
                <button
                  type="button"
                  className="check"
                  role="checkbox"
                  aria-checked={p.done}
                  aria-label={`Done: ${p.title}`}
                  onClick={() => dispatch({ type: 'TOGGLE_WEEK_PRIORITY', week, id: p.id })}
                />
                <span className="prio-text">
                  <span className="prio-title">{p.title}</span>
                  {goal && <small className="muted">{goal.title}</small>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
