import { useState } from 'react';
import { formatDuration } from '../lib/date';
import { goalProgress } from '../lib/stats';
import { uid } from '../lib/storage';
import type { Goal } from '../lib/types';
import { useStore, useToday } from '../state/store';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function GoalsView() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const active = state.goals.filter((g) => g.status !== 'done').length;
  const done = state.goals.length - active;
  const ordered = [...state.goals].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));

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

      <form className="goal-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label>Goal<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finish the book draft" /></label>
        <label>Why it matters<input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="One line" /></label>
        <label>Target date<input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label>
        <button type="submit" className="btn primary">Add goal</button>
      </form>

      <ul className="goal-list">
        {ordered.map((g) => {
          const pr = goalProgress(state, g.id, today);
          const linked = state.projects.filter((p) => p.goalId === g.id);
          return (
            <li key={g.id} className={`goal ${g.status === 'done' ? 'is-done' : ''}`}>
              <div className="goal-top">
                <h2 className="goal-title">{g.title}</h2>
                {g.status !== 'active' && <span className="chip">{g.status === 'done' ? 'Done' : 'Paused'}</span>}
                <span className="spacer" />
                <span className="muted num">{g.targetDate ? `Due ${g.targetDate}` : 'No date'}</span>
              </div>
              {g.why && <p className="muted">{g.why}</p>}
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
        })}
        {ordered.length === 0 && <li className="empty">No goals yet. Name one thing worth a few months of attention.</li>}
      </ul>
    </div>
  );
}
