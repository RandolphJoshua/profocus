import { useState } from 'react';
import { addDays, formatDay, formatDuration, shortWeekday, startOfWeek } from '../lib/date';
import { focusQuality, weekScores, weekStats } from '../lib/stats';
import { useStore, useToday } from '../state/store';

export function ReviewView() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, state.settings.weekStartsOn));
  const stats = weekStats(state, weekStart, today);
  const scores = weekScores(state, weekStart, today);
  const quality = focusQuality(state.sessions, stats.days);
  const elapsed = scores.filter((s) => s.date <= today);
  const mean = elapsed.length ? Math.round(elapsed.reduce((n, s) => n + s.score, 0) / elapsed.length) : undefined;
  const review = state.reviews[weekStart] ?? {};
  const maxDay = Math.max(60, ...stats.focusByDay);
  const maxProj = Math.max(1, ...stats.focusByProject.map((p) => p.minutes));
  const setReview = (patch: typeof review) => dispatch({ type: 'SET_REVIEW', week: weekStart, patch });

  return (
    <div className="review-page">
      <header className="page-head row">
        <div>
          <h1>Review</h1>
          <p className="sub num">{formatDay(weekStart, { month: 'long', day: 'numeric' })} – {formatDay(addDays(weekStart, 6), { month: 'short', day: 'numeric' })}</p>
        </div>
        <span className="spacer" />
        <div className="row gap">
          <button type="button" className="btn" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>←</button>
          <button type="button" className="btn" onClick={() => setWeekStart(startOfWeek(today, state.settings.weekStartsOn))}>This week</button>
          <button type="button" className="btn" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>→</button>
        </div>
      </header>

      <div className="stat-row panel">
        <div className="stat"><span className="stat-label">Focused</span><span className="stat-num num">{formatDuration(stats.focusTotal)}</span></div>
        <div className="stat"><span className="stat-label">Tasks done</span><span className="stat-num num">{stats.tasksCompleted}</span></div>
        <div className="stat"><span className="stat-label">Highlights hit</span><span className="stat-num num">{stats.highlightsDone}<small>/{stats.highlightsSet || 0}</small></span></div>
        <div className="stat"><span className="stat-label">Habit consistency</span><span className="stat-num num">{Math.round(stats.habitRate * 100)}%</span></div>
        <div className="stat">
          <span className="stat-label">Focus quality</span>
          <span className="stat-num num">{quality.quality === null ? '—' : `${quality.quality}%`}</span>
          <span className="stat-cap num">{quality.rated} rated</span>
        </div>
      </div>

      <section className="panel score-panel" aria-label="Daily scores">
        <h2 className="panel-title">Daily scores</h2>
        <div className="score-strip">
          <div className="score-cell is-mean"><span className="score-label">Week</span><span className="score-num num">{mean ?? '—'}</span></div>
          {scores.map((s) => (
            <div key={s.date} className="score-cell"><span className="score-label">{shortWeekday(s.date)}</span><span className="score-num num">{s.date <= today ? s.score : '—'}</span></div>
          ))}
        </div>
        <p className="hint">40 highlight · 30 focus vs plan · 15 habits · 15 tasks</p>
      </section>

      <div className="review-grid">
        <section className="card">
          <h2 className="card-title">Focus by day</h2>
          <div className="bars" role="list">
            {stats.days.map((d, i) => {
              const m = stats.focusByDay[i] ?? 0;
              return (
                <div key={d} className={`bar ${d === today ? 'is-today' : ''}`} role="listitem" aria-label={`${formatDay(d)}: ${formatDuration(m)}`}>
                  <span className="bar-val num">{m ? formatDuration(m) : ''}</span>
                  <span className="bar-fill" style={{ height: `${(m / maxDay) * 100}%` }} />
                  <span className="bar-lbl">{shortWeekday(d)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Where the time went</h2>
          {stats.focusByProject.length === 0 && <p className="empty">No focus sessions logged this week.</p>}
          <ul className="hbars">
            {stats.focusByProject.map(({ projectId, minutes }) => {
              const p = state.projects.find((x) => x.id === projectId);
              return (
                <li key={projectId ?? 'none'}>
                  <span className="hbar-name"><i className="dot" style={{ background: p?.color ?? 'var(--faint)' }} />{p?.name ?? 'No project'}</span>
                  <span className="hbar-track"><span style={{ width: `${(minutes / maxProj) * 100}%` }} /></span>
                  <span className="hbar-val num">{formatDuration(minutes)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2 className="card-title">Highlights</h2>
          <ul className="hl-list">
            {stats.days.map((d) => {
              const p = state.days[d];
              return (
                <li key={d} className={p?.highlightDone ? 'is-done' : ''}>
                  <span className="muted">{shortWeekday(d)}</span>
                  <span>{p?.highlight ?? <em className="muted">—</em>}</span>
                  {p?.energy && <span className="muted num" title={`Energy ${p.energy}/5`}>{p.energy}/5</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card reflect">
          <h2 className="card-title">Reflect</h2>
          <label>What went well this week?
            <textarea rows={3} value={review.wins ?? ''} onChange={(e) => setReview({ wins: e.target.value })} />
          </label>
          <label>What didn’t, and what will I change?
            <textarea rows={3} value={review.lessons ?? ''} onChange={(e) => setReview({ lessons: e.target.value })} />
          </label>
          <label>Next week, the most important thing is…
            <textarea rows={2} value={review.nextFocus ?? ''} onChange={(e) => setReview({ nextFocus: e.target.value })} />
          </label>
        </section>
      </div>
    </div>
  );
}
