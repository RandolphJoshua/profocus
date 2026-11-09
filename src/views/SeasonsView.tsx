import { useState } from 'react';
import { CloseSeason, PastSeasons, progressLine, SeasonForm, SeasonFormBody } from '../components/SeasonPanel';
import { currentSeason, goalTrajectory, seasonProgress, seasonWeekStrip, type Trajectory } from '../lib/stats';
import type { Season } from '../lib/types';
import { useStore, useToday } from '../state/store';

const TRAJECTORY_LABEL: Record<Exclude<Trajectory, 'no-date'>, string> = {
  'on-track': 'On track', adjust: 'Adjust', 'off-track': 'Off track',
};
const STATE_LABEL = { planned: 'planned', unplanned: 'not planned', current: 'this week', future: 'upcoming' } as const;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Explainer() {
  return (
    <section className="panel season-explainer" aria-label="How seasons work">
      <p><strong>First</strong>, pick a theme: what these weeks are about.</p>
      <p><strong>Then</strong>, choose the goals that get the space; everything else waits.</p>
      <p><strong>Finally</strong>, plan each week against them; the strip fills in as you go.</p>
    </section>
  );
}

function RunningSeason({ season }: { season: Season }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [dialog, setDialog] = useState<'edit' | 'close' | null>(null);
  const [adding, setAdding] = useState('');
  const p = seasonProgress(state, season.id, today);
  const strip = seasonWeekStrip(state, season.id, today);
  const goals = season.goalIds.flatMap((id) => state.goals.find((g) => g.id === id) ?? []);
  const available = state.goals.filter((g) => g.status !== 'done' && !season.goalIds.includes(g.id));
  const setGoalIds = (goalIds: string[]) => dispatch({ type: 'UPDATE_SEASON', id: season.id, patch: { goalIds } });

  return (
    <section className="panel season-big" aria-label="Season">
      <h2 className="season-name">{season.name}</h2>
      {season.theme && <p className="muted">{season.theme}</p>}
      <p className="season-line num">{progressLine(p)}</p>

      <ol className="week-strip" aria-label="Weeks of the season">
        {strip.cells.map((c) => (
          <li
            key={c.index} className={`week-cell is-${c.state}${c.planned ? ' is-planned' : ''}`}
            aria-current={c.state === 'current' ? 'step' : undefined}
            aria-label={`Week ${c.index + 1}, ${STATE_LABEL[c.state]}${c.state === 'current' && c.planned ? ', planned' : ''}`}
          >
            <span className="num">W{c.index + 1}</span>
          </li>
        ))}
      </ol>
      <p className="num">{strip.plannedSoFar} of {plural(strip.elapsed, 'week')} planned so far</p>

      <ul className="season-goal-list" aria-label="Goals in this season">
        {goals.length === 0 && <li className="muted">No goals in this season yet.</li>}
        {goals.map((g) => {
          const tr = goalTrajectory(state, g.id, today);
          return (
            <li key={g.id}>
              <span className={`season-goal-name ${g.status === 'done' ? 'is-done' : ''}`}>{g.title}</span>
              {tr.status !== 'no-date' && g.status !== 'done' && <span className={`traj-pill is-${tr.status}`}>{TRAJECTORY_LABEL[tr.status]}</span>}
              <span className="spacer" />
              <button type="button" className="btn ghost" aria-label={`Remove from season: ${g.title}`} onClick={() => setGoalIds(season.goalIds.filter((i) => i !== g.id))}>Remove</button>
            </li>
          );
        })}
      </ul>
      {available.length > 0 && (
        <form className="season-add" onSubmit={(e) => { e.preventDefault(); if (adding) { setGoalIds([...season.goalIds, adding]); setAdding(''); } }}>
          <label className="season-add-field">Add a goal to this season
            <select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose a goal</option>
              {available.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
          <button type="submit" className="btn" disabled={!adding}>Add</button>
        </form>
      )}

      <div className="season-actions">
        <button type="button" className="btn" onClick={() => setDialog('edit')}>Edit season</button>
        <button type="button" className="btn ghost" onClick={() => setDialog('close')}>Close season</button>
      </div>
      {dialog === 'edit' && <SeasonForm season={season} onClose={() => setDialog(null)} />}
      {dialog === 'close' && <CloseSeason season={season} onClose={() => setDialog(null)} />}
    </section>
  );
}

export function SeasonsView() {
  const { state } = useStore();
  const today = useToday();
  const season = currentSeason(state.seasons, today);
  const p = season ? seasonProgress(state, season.id, today) : undefined;

  return (
    <div className="seasons-page">
      <header className="page-head">
        <h1>Seasons</h1>
        <p className="sub num">{season && p ? `${season.name} · Week ${p.weekOf} of ${p.weeksTotal}` : 'No season running'}</p>
      </header>

      {season ? (
        <RunningSeason season={season} />
      ) : (
        <div className="season-start">
          <Explainer />
          <section className="panel" aria-label="Start a season">
            <SeasonFormBody inline onDone={() => undefined} />
          </section>
        </div>
      )}

      <PastSeasons />
    </div>
  );
}
