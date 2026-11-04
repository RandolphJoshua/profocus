import { useState } from 'react';
import { addDays, formatDay, formatDuration, shortWeekday, startOfWeek } from '../lib/date';
import { weekStats } from '../lib/stats';
import { useStore, useToday } from '../state/store';

export function ReviewView() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, state.settings.weekStartsOn));
  const stats = weekStats(state, weekStart, today);
  const review = state.reviews[weekStart] ?? {};
  const maxDay = Math.max(60, ...stats.focusByDay);
  const maxProj = Math.max(1, ...stats.focusByProject.map((p) => p.minutes));
  const setReview = (patch: typeof review) => dispatch({ type: 'SET_REVIEW', week: weekStart, patch });

  return (
    <div className="review-page">
      <header className="page-head row">
        <div>
          <p className="eyebrow">Weekly review</p>
          <h1 className="display">{formatDay(weekStart, { month: 'long', day: 'numeric' })} – {formatDay(addDays(weekStart, 6), { month: 'short', day: 'numeric' })}</h1>
        </div>
        <span className="spacer" />
        <div className="row gap">
          <button type="button" className="btn" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>←</button>
          <button type="button" className="btn" onClick={() => setWeekStart(startOfWeek(today, state.settings.weekStartsOn))}>This week</button>
          <button type="button" className="btn" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>→</button>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat"><span className="stat-num">{formatDuration(stats.focusTotal)}</span><span className="stat-label">focused</span></div>
        <div className="stat"><span className="stat-num">{stats.tasksCompleted}</span><span className="stat-label">tasks done</span></div>
        <div className="stat"><span className="stat-num">{stats.highlightsDone}<small>/{stats.highlightsSet || 0}</small></span><span className="stat-label">highlights hit</span></div>
        <div className="stat"><span className="stat-num">{Math.round(stats.habitRate * 100)}%</span><span className="stat-label">habit consistency</span></div>
      </div>

      <div className="review-grid">
        <section className="card">
          <h2 className="card-title">Focus by day</h2>
          <div className="bars" role="list">
            {stats.days.map((d, i) => {
              const m = stats.focusByDay[i] ?? 0;
              return (
                <div key={d} className={`bar ${d === today ? 'is-today' : ''}`} role="listitem" aria-label={`${formatDay(d)}: ${formatDuration(m)}`}>
                  <span className="bar-val">{m ? formatDuration(m) : ''}</span>
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
                  <span className="hbar-name">{p?.name ?? 'No project'}</span>
                  <span className="hbar-track"><span style={{ width: `${(minutes / maxProj) * 100}%`, background: p?.color ?? 'var(--muted)' }} /></span>
                  <span className="hbar-val">{formatDuration(minutes)}</span>
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
                  {p?.energy && <span title={`Energy ${p.energy}/5`}>{['😮‍💨', '😕', '🙂', '😊', '⚡'][p.energy - 1]}</span>}
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
