import { useState } from 'react';
import { PastSeasons, SeasonPanel } from '../components/SeasonPanel';
import { formatDuration } from '../lib/date';
import { currentSeason, goalProgress, goalTrajectory, type Trajectory } from '../lib/stats';
import { uid } from '../lib/storage';
import type { Goal, Season } from '../lib/types';
import { useStore, useToday } from '../state/store';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TRAJECTORY_LABEL: Record<Exclude<Trajectory, 'no-date'>, string> = {
  'on-track': 'On track', adjust: 'Adjust', 'off-track': 'Off track',
};

function GoalRow({ goal: g, season, inSeason = false }: { goal: Goal; season?: Season; inSeason?: boolean }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const pr = goalProgress(state, g.id, today);
  const tr = goalTrajectory(state, g.id, today);
  const linked = state.projects.filter((p) => p.goalId === g.id);
  const toggleSeason = () => {
    if (!season) return;
    const goalIds = !inSeason ? [...season.goalIds, g.id] : season.goalIds.filter((i) => i !== g.id);
    dispatch({ type: 'UPDATE_SEASON', id: season.id, patch: { goalIds } });
  };
  return (
    <li className={`goal ${g.status === 'done' ? 'is-done' : ''}`}>
      <div className="goal-top">
        <h3 className="goal-title">{g.title}</h3>
        {g.status !== 'active' && <span className="chip">{g.status === 'done' ? 'Done' : 'Paused'}</span>}
        <span className="spacer" />
        <span className="muted num">{g.targetDate ? `Due ${g.targetDate}` : 'No date'}</span>
      </div>
      {g.why && <p className="muted">{g.why}</p>}
      {tr.status === 'no-date' ? (
        <p className="traj-line muted">No target date</p>
      ) : (
        <>
          <p className="traj-line num">
            Day {tr.dayOf} of {tr.daysTotal} · {plural(tr.daysLeft, 'day')} left{' '}
            <span className={`traj-pill is-${tr.status}`}>{TRAJECTORY_LABEL[tr.status]}</span>
          </p>
          <div
            className="traj-track" role="img"
            aria-label={`${Math.round(tr.actual * 100)}% of tasks done, ${Math.round(tr.expected * 100)}% of the time used`}
          >
            <span className="traj-fill" style={{ width: `${tr.actual * 100}%` }} />
            <span className="traj-tick" style={{ left: `${tr.expected * 100}%` }} />
          </div>
        </>
      )}
      <p className="goal-progress num">
        {formatDuration(pr.focusMin30d)} focused in 30 days · {plural(pr.tasksDone, 'task')} done · {pr.tasksOpen} open · prioritised {plural(pr.weeksPrioritised, 'week')}
      </p>
      <div className="goal-foot">
        <span className="goal-projects">
          {linked.length === 0 ? <span className="muted">No projects linked</span> : linked.map((p) => (
            <span key={p.id} className="goal-project"><i className="dot" style={{ background: p.color }} />{p.name}</span>
          ))}
        </span>
        <span className="spacer" />
        {season && (
          <button type="button" className="btn ghost" aria-label={`${inSeason ? 'Remove from season' : 'Add to season'}: ${g.title}`} onClick={toggleSeason}>
            {inSeason ? 'Remove from season' : 'Add to season'}
          </button>
        )}
        {g.status !== 'done' && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'UPDATE_GOAL', id: g.id, patch: { status: g.status === 'paused' ? 'active' : 'paused' } })}>
            {g.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        {g.status !== 'done' && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'UPDATE_GOAL', id: g.id, patch: { status: 'done', doneAt: new Date().toISOString() } })}>Mark done</button>
        )}
        <button type="button" className="btn ghost danger" onClick={() => { if (window.confirm(`Delete goal “${g.title}”?`)) dispatch({ type: 'DELETE_GOAL', id: g.id }); }}>Delete</button>
      </div>
    </li>
  );
}

export function GoalsView() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const active = state.goals.filter((g) => g.status !== 'done').length;
  const done = state.goals.length - active;
  const season = currentSeason(state.seasons, today);
  const inSeason = (season?.goalIds ?? []).flatMap((id) => state.goals.find((g) => g.id === id) ?? []);
  const later = state.goals
    .filter((g) => !season?.goalIds.includes(g.id))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));

  const add = () => {
    const t = title.trim();
    if (!t) return;
    const goal: Goal = {
      id: uid('g-'), title: t, why: why.trim() || undefined, targetDate: targetDate || undefined,
      status: 'active', createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_GOAL', goal });
    setTitle(''); setWhy(''); setTargetDate('');
  };

  return (
    <div className="goals-page">
      <header className="page-head">
        <h1>Goals</h1>
        <p className="sub num">{active} active · {done} done</p>
      </header>

      <SeasonPanel />

      <form className="goal-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label>Goal<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finish the book draft" /></label>
        <label>Why it matters<input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="One line" /></label>
        <label>Target date<input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label>
        <button type="submit" className="btn primary">Add goal</button>
      </form>

      {inSeason.length > 0 && (
        <section aria-label="This season">
          <h2 className="goal-group">This season</h2>
          <ul className="goal-list">
            {inSeason.map((g) => <GoalRow key={g.id} goal={g} season={season} inSeason />)}
          </ul>
        </section>
      )}

      <section aria-label={season ? 'Later' : 'All goals'}>
        {season && later.length > 0 && <h2 className="goal-group">Later</h2>}
        <ul className="goal-list">
          {later.map((g) => <GoalRow key={g.id} goal={g} season={season} />)}
          {state.goals.length === 0 && <li className="empty">No goals yet. Name one thing worth a few months of attention.</li>}
        </ul>
      </section>

      <PastSeasons />
    </div>
  );
}
