import { useEffect, useRef, useState } from 'react';
import { PlanWeek } from '../components/PlanWeek';
import { WeekPriorities } from '../components/WeekPriorities';
import { BlockEditor, newDraft, type BlockDraft } from '../components/BlockEditor';
import { DayColumn, TimeGutter } from '../components/DayColumn';
import { addDays, formatDay, formatDuration, minutesNow, shortWeekday, startOfWeek, weekDays } from '../lib/date';
import { focusMinutesOn } from '../lib/stats';
import { useCalendarLine } from '../state/calendarStatus';
import { useAiPlan } from '../state/aiPlan';
import { useCoach } from '../state/coach';
import { useStore, useToday } from '../state/store';
import { byPriority } from './TodayView';

/** Pixels per hour on the week grid: tall enough that a 30-minute block shows its title and time. */
const HOUR = 72;

export function WeekView() {
  const { state } = useStore();
  const { enabled: aiEnabled } = useCoach();
  const aiPlan = useAiPlan();
  const calendarLine = useCalendarLine();
  const today = useToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, state.settings.weekStartsOn));
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [planning, setPlanning] = useState(false);
  const days = weekDays(weekStart);
  const end = days[6] ?? weekStart;

  const scheduled = new Set(state.blocks.map((b) => b.taskId).filter(Boolean));
  const toSchedule = state.tasks
    .filter((t) => !t.done && !scheduled.has(t.id) && (!t.date || (t.date >= weekStart && t.date <= end) || t.date < today))
    .sort(byPriority);

  const weekFocus = days.reduce((n, d) => n + focusMinutesOn(state.sessions, d), 0);

  // Open the grid scrolled to an hour before now (this week) or to the start of the day.
  const scrollRef = useRef<HTMLDivElement>(null);
  const isThisWeek = days.includes(today);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { dayStartHour, dayEndHour } = state.settings;
    const now = minutesNow();
    const target = isThisWeek && now > dayStartHour * 60 && now < dayEndHour * 60 ? Math.floor(now / 60 - 1) * 60 - dayStartHour * 60 : 0;
    el.scrollTop = Math.max(0, (target / 60) * HOUR);
    // Only when the shown week changes, not on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  return (
    <div className="week">
      <header className="page-head row">
        <div>
          <h1>Week</h1>
          <p className="sub num">{formatDay(weekStart, { month: 'long', day: 'numeric' })} – {formatDay(end, { month: weekStart.slice(5, 7) === end.slice(5, 7) ? undefined : 'long', day: 'numeric' })} · {formatDuration(weekFocus)} focused</p>
        </div>
        <span className="spacer" />
        <div className="stack week-head-tools">
          <div className="row gap" role="group" aria-label="Week navigation">
            <button type="button" className="btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
            <button type="button" className="btn" onClick={() => setWeekStart(startOfWeek(today, state.settings.weekStartsOn))}>This week</button>
            <button type="button" className="btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</button>
          </div>
          {calendarLine && (
            <div className="row gap calendar-line">
              <span className="spacer" />
              <span role="status" className={`calendar-note num ${calendarLine.error ? 'sync-error' : ''}`}>{calendarLine.text}</span>
              {calendarLine.actionLabel && <button type="button" className="link-btn" onClick={calendarLine.run}>{calendarLine.actionLabel}</button>}
            </div>
          )}
        </div>
        <div className="row gap">
          {aiEnabled && <button type="button" className="btn ai-plan-btn" onClick={() => aiPlan.open()}>Plan with AI</button>}
          <button type="button" className="btn primary" onClick={() => setPlanning(true)}>
            {state.reviews[weekStart]?.plannedAt ? 'Re-plan' : 'Plan my week'}
          </button>
        </div>
      </header>

      <div className="week-layout">
        <div className="week-side">
        {(state.reviews[weekStart]?.priorities?.length ?? 0) > 0 && <WeekPriorities week={weekStart} />}
        <aside className="card week-tray">
          <h2 className="card-title">To schedule</h2>
          <p className="hint">Drag onto a day to time-block it.</p>
          <ul className="tray-list">
            {toSchedule.map((t) => {
              const p = state.projects.find((x) => x.id === t.projectId);
              return (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/profocus-task', t.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="tray-item"
                >
                  <i style={{ background: p?.color ?? 'var(--line-strong)' }} />
                  <span>{t.title}</span>
                  {t.estimateMin && <small className="muted">{formatDuration(t.estimateMin)}</small>}
                </li>
              );
            })}
            {toSchedule.length === 0 && <li className="empty">All caught up.</li>}
          </ul>
        </aside>
        </div>

        <div className="card week-cal">
          <div className="week-scroll" ref={scrollRef}>
            <div className="week-head">
              <span />
              {days.map((d) => {
                const plan = state.days[d];
                const mins = focusMinutesOn(state.sessions, d);
                return (
                  <div key={d} className={`week-day-head ${d === today ? 'is-today' : ''}`}>
                    <span className="wd">{shortWeekday(d)}</span>
                    <span className="dn num">{Number(d.slice(8))}</span>
                    {plan?.highlight && <span className={`hl ${plan.highlightDone ? 'is-done' : ''}`} title={plan.highlight}>{plan.highlight}</span>}
                    {mins > 0 && <span className="fm num">{formatDuration(mins)}</span>}
                  </div>
                );
              })}
            </div>
            <div className="week-body">
              <TimeGutter hourHeight={HOUR} />
              {days.map((d) => (
                <DayColumn key={d} date={d} hourHeight={HOUR} isToday={d === today} onCreate={(dd, s, e) => setDraft(newDraft(dd, s, e))} onSelect={(b) => setDraft(b)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {planning && <PlanWeek week={weekStart} onClose={() => setPlanning(false)} />}
      {draft && <BlockEditor key={draft.id ?? 'new'} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
