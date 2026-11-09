import { useState } from 'react';
import { fromTimeInput, isValidKey, toTimeInput } from '../lib/date';
import { NOTES_MAX, TITLE_MAX } from '../lib/routines';
import { uid } from '../lib/storage';
import type { BlockKind, Routine } from '../lib/types';
import { useStore } from '../state/store';
import { Modal } from './Modal';

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MIN_LENGTH = 5;
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 10 * 60;

interface Draft {
  title: string;
  days: number[];
  start: string;
  end: string;
  kind: BlockKind;
  projectId: string;
  notes: string;
  from: string;
  until: string;
}

const toDraft = (r?: Routine): Draft => ({
  title: r?.title ?? '',
  days: r?.days ?? [],
  start: toTimeInput(r?.start ?? DEFAULT_START),
  end: toTimeInput(r?.end ?? DEFAULT_END),
  kind: r?.kind ?? 'focus',
  projectId: r?.projectId ?? '',
  notes: r?.notes ?? '',
  from: r?.from ?? '',
  until: r?.until ?? '',
});

/** The first thing wrong with a draft, or undefined when it can be saved. */
export function routineProblem(d: Draft): string | undefined {
  if (!d.title.trim()) return 'Give the routine a name.';
  if (d.days.length === 0) return 'Pick at least one day.';
  if (fromTimeInput(d.end) < fromTimeInput(d.start) + MIN_LENGTH) return 'The end has to be after the start.';
  if ((d.from && !isValidKey(d.from)) || (d.until && !isValidKey(d.until))) return 'Use valid dates.';
  if (d.from && d.until && d.until < d.from) return 'The last day is before the first day.';
  return undefined;
}

/** Add or edit a routine. */
export function RoutineForm({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [d, setD] = useState<Draft>(() => toDraft(routine));
  const [error, setError] = useState<string>();

  const submit = () => {
    const problem = routineProblem(d);
    if (problem) {
      setError(problem);
      return;
    }
    const fields = {
      title: d.title.trim(),
      days: [...d.days].sort((a, b) => a - b),
      start: fromTimeInput(d.start),
      end: fromTimeInput(d.end),
      kind: d.kind,
      notes: d.notes.trim() ? d.notes : undefined,
      projectId: d.projectId || undefined,
      from: d.from || undefined,
      until: d.until || undefined,
    };
    dispatch(routine
      ? { type: 'UPDATE_ROUTINE', id: routine.id, patch: fields }
      : { type: 'ADD_ROUTINE', routine: { id: uid('r-'), ...fields, createdAt: new Date().toISOString() } });
    onClose();
  };
  const toggleDay = (i: number) => setD((cur) => ({ ...cur, days: cur.days.includes(i) ? cur.days.filter((x) => x !== i) : [...cur.days, i] }));

  return (
    <Modal title={routine ? 'Edit routine' : 'New routine'} onClose={onClose}>
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label>Name
          <input autoFocus value={d.title} maxLength={TITLE_MAX} placeholder="Morning walk, no phone" onChange={(e) => setD({ ...d, title: e.target.value })} />
        </label>
        <div className="grid-3">
          <label>Start<input type="time" step={300} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></label>
          <label>End<input type="time" step={300} value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} /></label>
          <label>Type
            <select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as BlockKind })}>
              <option value="focus">Focus</option>
              <option value="meeting">Meeting</option>
              <option value="personal">Personal</option>
              <option value="break">Break</option>
            </select>
          </label>
        </div>
        <fieldset className="day-picker">
          <legend>Days</legend>
          {DAY_LETTERS.map((letter, i) => (
            <button key={DAY_NAMES[i]} type="button" className={`day-chip ${d.days.includes(i) ? 'is-on' : ''}`} aria-pressed={d.days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => toggleDay(i)}>{letter}</button>
          ))}
        </fieldset>
        <label>Project
          <select value={d.projectId} onChange={(e) => setD({ ...d, projectId: e.target.value })}>
            <option value="">None</option>
            {state.projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Notes
          <textarea rows={3} maxLength={NOTES_MAX} value={d.notes} placeholder="How-to, links, what done looks like" onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </label>
        <div className="grid-2">
          <label>First day (optional)<input type="date" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} /></label>
          <label>Last day (optional)<input type="date" value={d.until} onChange={(e) => setD({ ...d, until: e.target.value })} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="row gap">
          <button type="submit" className="btn primary">{routine ? 'Save routine' : 'Add routine'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
