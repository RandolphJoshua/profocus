import { useState } from 'react';
import { Modal } from './Modal';
import { addDays, formatDay, formatDuration } from '../lib/date';
import { daysBetween, seasonProgress, type SeasonProgress } from '../lib/stats';
import { uid } from '../lib/storage';
import type { ID, Season } from '../lib/types';
import { useStore, useToday } from '../state/store';

const WEEK_OPTIONS = [6, 8, 12, 16];
const DEFAULT_WEEKS = 12;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const endLabel = (key: string) => formatDay(key, { weekday: 'short', day: 'numeric', month: 'short' });
const rangeLabel = (s: Season) =>
  `${formatDay(s.start, { day: 'numeric', month: 'short' })} – ${formatDay(s.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;

export function progressLine(p: SeasonProgress): string {
  return `Week ${p.weekOf} of ${p.weeksTotal} · ${plural(p.daysLeft, 'day')} left · ${p.goalsDone} of ${p.goalsTotal} goals done · ${formatDuration(p.focusMin)} focused · highlight hit ${p.highlightsHit} of ${p.daysElapsed} days`;
}

/** Create or edit a season. Rendered inline on the Seasons screen and inside a Modal for Edit. */
export function SeasonFormBody({ season, onDone, onCancel, inline = false }: { season?: Season; onDone: () => void; onCancel?: () => void; inline?: boolean }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [name, setName] = useState(season?.name ?? '');
  const [theme, setTheme] = useState(season?.theme ?? '');
  const [start, setStart] = useState(season?.start ?? today);
  const [weeks, setWeeks] = useState(season ? Math.max(1, Math.round((daysBetween(season.start, season.end) + 1) / 7)) : DEFAULT_WEEKS);
  const [picked, setPicked] = useState<ID[]>(season?.goalIds ?? []);
  const [error, setError] = useState('');

  const end = addDays(start, weeks * 7 - 1);
  const options = [...new Set([...WEEK_OPTIONS, weeks])].sort((a, b) => a - b);
  const shown = state.goals.filter((g) => g.status === 'active' || picked.includes(g.id));
  const toggle = (id: ID) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = () => {
    if (!name.trim()) return setError('Give the season a name.');
    if (!start || end <= start) return setError('The season has to end after it starts.');
    const fields = { name: name.trim(), theme: theme.trim() || undefined, start, end, goalIds: picked };
    if (season) dispatch({ type: 'UPDATE_SEASON', id: season.id, patch: fields });
    else dispatch({ type: 'ADD_SEASON', season: { id: uid('se-'), ...fields, createdAt: new Date().toISOString() } });
    onDone();
  };

  return (
      <form className={inline ? 'stack season-form' : 'stack'} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Autumn push" /></label>
        <label>Theme<input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="One line: what this season is about" /></label>
        <div className="season-dates">
          <label>Start<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Length
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {options.map((w) => <option key={w} value={w}>{w} weeks</option>)}
            </select>
          </label>
          <p className="muted num season-ends">{start ? `Ends ${endLabel(end)}` : ''}</p>
        </div>
        <fieldset className="season-goals">
          <legend>Goals that get space</legend>
          {shown.length === 0 && <p className="muted">No active goals yet. Add one first.</p>}
          {shown.map((g) => (
            <label key={g.id} className="check-label">
              <input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} />{g.title}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="row gap ritual-foot">
          <span className="spacer" />
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="btn primary">{season ? 'Save' : 'Start season'}</button>
        </div>
      </form>
  );
}

export function SeasonForm({ season, onClose }: { season?: Season; onClose: () => void }) {
  return (
    <Modal title={season ? 'Edit season' : 'Start a season'} onClose={onClose}>
      <SeasonFormBody season={season} onDone={onClose} onCancel={onClose} />
    </Modal>
  );
}

export function CloseSeason({ season, onClose }: { season: Season; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [note, setNote] = useState(season.reviewNote ?? '');
  return (
    <Modal title="Close season" onClose={onClose}>
      <div className="stack">
        <p className="num">{progressLine(seasonProgress(state, season.id, today))}</p>
        <label>What did this season teach you?
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row gap ritual-foot">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Keep going</button>
          <button
            type="button" className="btn primary"
            onClick={() => {
              dispatch({ type: 'UPDATE_SEASON', id: season.id, patch: { closedAt: new Date().toISOString(), reviewNote: note.trim() || undefined } });
              onClose();
            }}
          >Close season</button>
        </div>
      </div>
    </Modal>
  );
}

/** Closed or finished seasons, always visible on the Seasons screen. */
export function PastSeasons() {
  const { state } = useStore();
  const today = useToday();
  const past = state.seasons.filter((s) => s.closedAt || s.end < today).sort((a, b) => b.start.localeCompare(a.start));
  return (
    <section className="past-seasons" aria-label="Past seasons">
      <h2 className="goal-group">Past seasons</h2>
      {past.length === 0 ? (
        <p className="muted">No past seasons yet.</p>
      ) : (
        <ul className="past-list">
          {past.map((s) => {
            const p = seasonProgress(state, s.id, today);
            return (
              <li key={s.id} className="past-season">
                <div className="past-top">
                  <strong>{s.name}</strong>
                  <span className="muted num">{rangeLabel(s)}</span>
                  <span className="muted num">{p.goalsDone} of {p.goalsTotal} goals done</span>
                </div>
                {s.reviewNote && <p className="muted">{s.reviewNote}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
