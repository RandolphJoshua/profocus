import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { CoachNote } from '../components/CoachNote';
import { BlockEditor, newDraft, type BlockDraft } from '../components/BlockEditor';
import { DayColumn, TimeGutter } from '../components/DayColumn';
import { FocusTimer } from '../components/FocusTimer';
import { GettingStarted } from '../components/GettingStarted';
import { PlanDay } from '../components/PlanDay';
import { QuickAdd } from '../components/QuickAdd';
import { Roll } from '../components/Roll';
import { COLLAPSE_DELAY_MS, COLLAPSE_MS, TaskItem } from '../components/TaskItem';
import { WeekPriorities } from '../components/WeekPriorities';
import { addDays, formatDay, formatDuration, startOfWeek } from '../lib/date';
import { currentSeason, dayScore, focusMinutesOn, habitStreak, plannedStreak, seasonProgress } from '../lib/stats';
import type { DayPlan, Task } from '../lib/types';
import { useAiPlan } from '../state/aiPlan';
import { useCoach } from '../state/coach';
import { useStore, useToday } from '../state/store';

const PRIO_RANK = { high: 0, med: 1, low: 2 } as const;
export const byPriority = (a: Task, b: Task) =>
  (a.priority ? PRIO_RANK[a.priority] : 3) - (b.priority ? PRIO_RANK[b.priority] : 3) || a.createdAt.localeCompare(b.createdAt);

function greeting(h: number) {
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TodayView({ quickAddRef }: { quickAddRef: Ref<HTMLInputElement> }) {
  const { state, dispatch } = useStore();
  const { enabled: aiEnabled } = useCoach();
  const aiPlan = useAiPlan();
  const today = useToday();
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);
  const plan = state.days[today] ?? {};

  // Keep a just-completed task in the list until its row has collapsed away.
  const keepWhileCollapsing = (id: string) => {
    setLingering((cur) => new Set(cur).add(id));
    window.setTimeout(() => setLingering((cur) => {
      const next = new Set(cur);
      next.delete(id);
      return next;
    }), COLLAPSE_DELAY_MS + COLLAPSE_MS + 60);
  };

  // On first render, bring the now-line about a third of the way down the time-block panel.
  useEffect(() => {
    const scroller = timelineRef.current;
    const line = scroller?.querySelector<HTMLElement>('.now-line');
    if (!scroller || !line || !scroller.scrollTo) return;
    const offset = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: Math.max(0, offset - scroller.clientHeight / 3), behavior: reduced ? 'auto' : 'smooth' });
  }, []);
  const tomorrow = addDays(today, 1);

  const todays = state.tasks.filter((t) => t.date === today);
  const open = todays.filter((t) => !t.done).sort(byPriority);
  const done = todays.filter((t) => t.done);
  const listed = todays.filter((t) => !t.done || lingering.has(t.id)).sort(byPriority);
  const overdue = state.tasks.filter((t) => !t.done && t.date && t.date < today);
  const plannedMin = open.reduce((n, t) => n + (t.estimateMin ?? 0), 0);
  const focusMin = focusMinutesOn(state.sessions, today);
  const focusBlocks = state.blocks.filter((b) => b.date === today && b.kind === 'focus');
  const blockedMin = focusBlocks.reduce((n, b) => n + (b.end - b.start), 0);
  const habits = state.habits.filter((h) => !h.archived);
  const habitsDone = habits.filter((h) => state.habitLog[today]?.includes(h.id)).length;
  const highlightTask = state.tasks.find((t) => t.id === plan.highlightTaskId);
  const highlightDone = plan.highlightDone || highlightTask?.done;

  // The greeting's one fact for the day.
  const dateLabel = formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' });
  const nothingPlanned = !plan.highlight && open.length === 0 && done.length === 0 && state.blocks.every((b) => b.date !== today);
  const streak = plannedStreak(state, today);
  const score = dayScore(state, today);
  const hasData = score.planned || score.highlightSet || score.focusMin > 0 || score.tasksDone > 0 || score.habitsDone > 0;
  const baseFact = nothingPlanned
    ? `${dateLabel} · nothing planned yet`
    : plan.highlight && highlightDone
      ? `${dateLabel} · highlight done · ${formatDuration(focusMin)} focused`
      : `${dateLabel} · ${plan.highlight ? 'highlight still open' : 'no highlight yet'} · ${formatDuration(blockedMin)} blocked`;
  const season = currentSeason(state.seasons, today);
  const sp = season ? seasonProgress(state, season.id, today) : undefined;
  const seasonNote = sp ? ` · season week ${sp.weekOf} of ${sp.weeksTotal}` : '';
  const fact = `${baseFact}${streak > 0 ? ` · planned ${streak} ${streak === 1 ? 'day' : 'days'} in a row` : ''}${hasData ? ` · score ${score.score}` : ''}${seasonNote}`;

  const setDay = (patch: Partial<DayPlan>, date = today) =>
    dispatch({ type: 'SET_DAY', date, patch });

  return (
    <div className="today">
      <header className="today-head">
        <div>
          <h1 className="greeting">{greeting(new Date().getHours())}.</h1>
          <p className="sub num">{fact}</p>
        </div>
        <div className="row gap">
          {aiEnabled && <button type="button" className="btn ai-plan-btn" onClick={() => aiPlan.open()}>Plan with AI</button>}
          <button type="button" className={plan.plannedAt ? 'btn ghost' : 'btn primary'} onClick={() => setPlanning(true)}>
            {plan.plannedAt ? 'Re-plan' : 'Plan my day'}
          </button>
        </div>
      </header>

      <CoachNote />

      <GettingStarted onPlanDay={() => setPlanning(true)} />

      <div className="tiles">
        <div className="tile"><span className="tile-label">Open tasks</span><span className="tile-value num"><Roll value={String(open.length)} /></span><span className="tile-cap num">{done.length} done today</span></div>
        <div className="tile"><span className="tile-label">Blocked today</span><span className="tile-value num"><Roll value={formatDuration(blockedMin)} /></span><span className="tile-cap num">{focusBlocks.length} focus block{focusBlocks.length === 1 ? '' : 's'}</span></div>
        <div className="tile"><span className="tile-label">Focused</span><span className="tile-value num"><Roll value={formatDuration(focusMin)} /></span><span className="tile-cap num">{formatDuration(plannedMin)} planned</span></div>
        <div className="tile"><span className="tile-label">Habits</span><span className="tile-value num"><Roll value={`${habitsDone}/${habits.length}`} /></span><span className="tile-cap">{habits.length === 0 ? 'None yet' : habitsDone === habits.length ? 'All done' : `${habits.length - habitsDone} to go`}</span></div>
      </div>

      <div className="today-grid">
        <section className="panel col-9" aria-label="Tasks">
          <h2 className="panel-title">Tasks</h2>
          {overdue.length > 0 && (
            <div className="banner">
              <span>{overdue.length} unfinished task{overdue.length > 1 ? 's' : ''} from earlier days</span>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'ROLL_OVER', to: today })}>Move to today</button>
            </div>
          )}

          <QuickAdd ref={quickAddRef} defaultDate={today} />

          <ul className="task-list" aria-label="Today's tasks">
            {listed.map((t) => <TaskItem key={t.id} task={t} canHighlight lingering={lingering.has(t.id)} onComplete={(task) => keepWhileCollapsing(task.id)} />)}
            {listed.length === 0 && <li className="empty">Nothing planned yet. Add a few tasks, then drag them onto the timeline.</li>}
          </ul>
          {done.length > 0 && (
            <>
              <button type="button" className="link-btn" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                {showDone ? 'Hide' : 'Show'} {done.length} completed
              </button>
              {showDone && <ul className="task-list">{done.map((t) => <TaskItem key={t.id} task={t} />)}</ul>}
            </>
          )}
        </section>

        <div className="col-3 stack-col">
          <article className={`panel highlight ${highlightDone ? 'is-done' : ''}`}>
            <h2 className="panel-title">Today’s highlight</h2>
            {plan.highlight ? (
              <div className="highlight-row">
                <button
                  type="button"
                  className="check big"
                  role="checkbox"
                  aria-checked={!!highlightDone}
                  aria-label="Highlight done"
                  onClick={() => {
                    setDay({ highlightDone: !highlightDone });
                    if (highlightTask && highlightTask.done === !!highlightDone) {
                      dispatch({ type: 'TOGGLE_TASK', id: highlightTask.id, now: new Date().toISOString() });
                    }
                  }}
                />
                <textarea
                  className="highlight-input"
                  rows={2}
                  value={plan.highlight}
                  onChange={(e) => setDay({ highlight: e.target.value.replace(/\n/g, ' ') })}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  aria-label="Highlight"
                />
                <button type="button" className="icon-btn" aria-label="Clear highlight" onClick={() => setDay({ highlight: undefined, highlightTaskId: undefined, highlightDone: false })}>×</button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget).get('h')?.toString().trim();
                  if (v) setDay({ highlight: v, highlightDone: false });
                }}
              >
                <input name="h" className="highlight-input" placeholder="What one thing would make today a win?" aria-label="Set today's highlight" />
                <p className="hint">Pick one meaningful thing and protect time for it.</p>
              </form>
            )}
          </article>

          <WeekPriorities week={startOfWeek(today, state.settings.weekStartsOn)} />

          {habits.length > 0 && (
            <section className="panel">
              <h2 className="panel-title">Habits</h2>
              <ul className="habit-chips">
                {habits.map((h) => {
                  const on = state.habitLog[today]?.includes(h.id) ?? false;
                  const streak = habitStreak(state.habitLog, h.id, today);
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        className={`habit-chip ${on ? 'is-on' : ''}`}
                        style={{ '--c': h.color } as CSSProperties}
                        aria-pressed={on}
                        onClick={() => dispatch({ type: 'TOGGLE_HABIT', id: h.id, date: today })}
                      >
                        <i className="dot" />{h.name}{streak > 1 && <small className="num"> · {streak} days</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <section className="panel col-6 timeline">
          <div className="timeline-head">
            <h2 className="panel-title">Time blocks</h2>
            <span className="hint">Drag to create · drop tasks here</span>
          </div>
          <div className="timeline-scroll" ref={timelineRef}>
            <div className="timeline-grid">
              <TimeGutter hourHeight={52} />
              <DayColumn date={today} hourHeight={52} isToday onCreate={(d, s, e) => setDraft(newDraft(d, s, e))} onSelect={(b) => setDraft(b)} />
            </div>
          </div>
        </section>

        <div className="col-6 stack-col">
          <FocusTimer />

          <section className={`panel shutdown ${plan.shutdownDone ? 'is-done' : ''}`}>
            <h2 className="panel-title">End-of-day shutdown</h2>
            <fieldset className="energy">
              <legend>Energy today</legend>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={plan.energy === n} aria-label={`Energy ${n} of 5`} className={`num ${plan.energy === n ? 'is-on' : ''}`} onClick={() => setDay({ energy: n })}>
                  {n}
                </button>
              ))}
            </fieldset>
            <label>What went well / what got in the way?
              <textarea rows={2} value={plan.shutdownNote ?? ''} onChange={(e) => setDay({ shutdownNote: e.target.value })} />
            </label>
            <label>Tomorrow’s highlight
              <input
                value={state.days[tomorrow]?.highlight ?? ''}
                placeholder="Decide it tonight, start fresh tomorrow"
                onChange={(e) => setDay({ highlight: e.target.value || undefined }, tomorrow)}
              />
            </label>
            <div className="row gap">
              {open.length > 0 && (
                <button type="button" className="btn" onClick={() => open.forEach((t) => dispatch({ type: 'UPDATE_TASK', id: t.id, patch: { date: tomorrow } }))}>
                  Move {open.length} unfinished to tomorrow
                </button>
              )}
              <button type="button" className="btn" aria-pressed={!!plan.shutdownDone} onClick={() => setDay({ shutdownDone: !plan.shutdownDone })}>
                {plan.shutdownDone ? 'Shutdown complete · undo' : 'Shutdown complete'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {planning && <PlanDay onClose={() => setPlanning(false)} />}
      {draft && <BlockEditor key={draft.id ?? 'new'} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
