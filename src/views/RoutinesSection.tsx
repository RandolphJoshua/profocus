import { useState } from 'react';
import { RoutineForm, DAY_LETTERS, DAY_NAMES } from '../components/RoutineForm';
import { useToast } from '../components/Toaster';
import { toTimeInput } from '../lib/date';
import { dayPartOf, type DayPart } from '../lib/routines';
import type { Routine } from '../lib/types';
import { useStore } from '../state/store';

const PARTS: readonly DayPart[] = ['Morning', 'Afternoon', 'Evening'];

/** Recurring time blocks, grouped by time of day, below the habits. */
export function RoutinesSection() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  // `null` = closed, `'new'` = add, otherwise the routine being edited.
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const sorted = [...state.routines].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));

  const remove = (r: Routine) => {
    const skips = state.routineSkips.filter((k) => k.startsWith(`${r.id}|`));
    dispatch({ type: 'DELETE_ROUTINE', id: r.id });
    toast(`Deleted ${r.title}`, {
      action: {
        label: 'Undo',
        run: () => dispatch({
          type: 'BATCH',
          actions: [
            { type: 'ADD_ROUTINE', routine: r },
            ...skips.map((k) => ({ type: 'SKIP_ROUTINE' as const, id: r.id, date: k.slice(r.id.length + 1) })),
          ],
        }),
      },
    });
  };

  return (
    <section id="routines" className="routines" aria-labelledby="routines-title">
      <div className="row gap routines-head">
        <h2 id="routines-title" className="section-title">Routines</h2>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => setEditing('new')}>Add routine</button>
      </div>
      <p className="hint">Recurring time blocks. They show on Today and Week on the days they run.</p>

      {sorted.length === 0 ? (
        <p className="empty card">No routines yet. Add one, or import a plan from Settings → Your data → Add from file.</p>
      ) : (
        PARTS.map((part) => {
          const rows = sorted.filter((r) => dayPartOf(r.start) === part);
          if (rows.length === 0) return null;
          return (
            <div key={part} className="card routine-group">
              <h3 className="routine-part">{part}</h3>
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className={`routine-row ${r.paused ? 'is-paused' : ''}`}>
                    <div className="routine-main">
                      <span className="routine-title">{r.title}{r.paused && <span className="chip">Paused</span>}</span>
                      <span className="routine-time num">{toTimeInput(r.start)}–{toTimeInput(r.end)}</span>
                      {r.notes && <span className="routine-note-line" title={r.notes}>{r.notes.split("\n")[0]}</span>}
                    </div>
                    <span className="day-chips" role="img" aria-label={`Runs ${r.days.map((d) => DAY_NAMES[d]).join(', ')}`}>
                      {DAY_LETTERS.map((l, i) => <span key={DAY_NAMES[i]} className={`day-chip ${r.days.includes(i) ? 'is-on' : ''}`} aria-hidden>{l}</span>)}
                    </span>
                    <span className="row gap routine-actions">
                      <button type="button" className="btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>Edit</button>
                      <button type="button" className="btn" aria-label={`${r.paused ? 'Resume' : 'Pause'} ${r.title}`} onClick={() => dispatch({ type: 'UPDATE_ROUTINE', id: r.id, patch: { paused: r.paused ? undefined : true } })}>{r.paused ? 'Resume' : 'Pause'}</button>
                      <button type="button" className="btn danger" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}>Delete</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
      {editing && <RoutineForm key={editing === 'new' ? 'new' : editing.id} routine={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
