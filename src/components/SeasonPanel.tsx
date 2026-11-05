import { useState } from 'react';
import { Modal } from './Modal';
import { addDays, formatDay, formatDuration } from '../lib/date';
import { currentSeason, daysBetween, seasonProgress, type SeasonProgress } from '../lib/stats';
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

/** Create or edit a season. */
function SeasonForm({ season, onClose }: { season?: Season; onClose: () => void }) {
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
    onClose();
  };

  return (
    <Modal title={season ? 'Edit season' : 'Start a season'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
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
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{season ? 'Save' : 'Start season'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CloseSeason({ season, onClose }: { season: Season; onClose: () => void }) {
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

/** The season at the top of the Goals screen: what is running now, or an invitation to start one. */
export function SeasonPanel() {
  const { state } = useStore();
  const today = useToday();
  const [dialog, setDialog] = useState<'new' | 'edit' | 'close' | null>(null);
  const season = currentSeason(state.seasons, today);
  const p = season ? seasonProgress(state, season.id, today) : undefined;
  const total = season ? daysBetween(season.start, season.end) + 1 : 1;

  return (
    <section className="panel season-panel" aria-label="Season">
      {season && p ? (
        <>
          <h2 className="season-name">{season.name}</h2>
          {season.theme && <p className="muted">{season.theme}</p>}
          <p className="season-line num">{progressLine(p)}</p>
          <div className="season-track" role="img" aria-label={`${Math.round((p.daysElapsed / total) * 100)}% of the season has passed`}>
            <span className="season-fill" style={{ width: `${(p.daysElapsed / total) * 100}%` }} />
          </div>
          <div className="season-actions">
            <button type="button" className="btn ghost" onClick={() => setDialog('edit')}>Edit</button>
            <button type="button" className="btn ghost" onClick={() => setDialog('close')}>Close season</button>
          </div>
        </>
      ) : (
        <div className="season-empty">
          <p className="muted">No season running. A season is 12 weeks with a theme and the goals that get the space.</p>
          <button type="button" className="btn" onClick={() => setDialog('new')}>Start a season</button>
        </div>
      )}
      {dialog === 'new' && <SeasonForm onClose={() => setDialog(null)} />}
      {dialog === 'edit' && season && <SeasonForm season={season} onClose={() => setDialog(null)} />}
      {dialog === 'close' && season && <CloseSeason season={season} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** Closed or finished seasons, collapsed by default. */
export function PastSeasons() {
  const { state } = useStore();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const past = state.seasons.filter((s) => s.closedAt || s.end < today).sort((a, b) => b.start.localeCompare(a.start));
  if (past.length === 0) return null;
  return (
    <section className="past-seasons" aria-label="Past seasons">
      <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>Past seasons ({past.length})</button>
      {open && (
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
