import { useState } from 'react';
import { PlanWeek } from '../components/PlanWeek';
import { WeekPriorities } from '../components/WeekPriorities';
import { BlockEditor, newDraft, type BlockDraft } from '../components/BlockEditor';
import { DayColumn, TimeGutter } from '../components/DayColumn';
import { addDays, formatDay, formatDuration, shortWeekday, startOfWeek, weekDays } from '../lib/date';
import { focusMinutesOn } from '../lib/stats';
import { useCalendar } from '../state/calendar';
import { useStore, useToday } from '../state/store';
import { byPriority } from './TodayView';

const HOUR = 48;

export function WeekView() {
  const { state } = useStore();
  const calendar = useCalendar();
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

  return (
    <div className="week">
      <header className="page-head row">
        <div>
          <h1>Week</h1>
          <p className="sub num">{formatDay(weekStart, { month: 'long', day: 'numeric' })} – {formatDay(end, { month: weekStart.slice(5, 7) === end.slice(5, 7) ? undefined : 'long', day: 'numeric' })} · {formatDuration(weekFocus)} focused</p>
        </div>
        <span className="spacer" />
        {calendar.status === 'connected' && calendar.lastImportAt && (
          <span className="calendar-note num">Calendar imported {new Date(calendar.lastImportAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        )}
        <div className="row gap" role="group" aria-label="Week navigation">
          <button type="button" className="btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
          <button type="button" className="btn" onClick={() => setWeekStart(startOfWeek(today, state.settings.weekStartsOn))}>This week</button>
          <button type="button" className="btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</button>
        </div>
        <button type="button" className="btn primary" onClick={() => setPlanning(true)}>
          {state.reviews[weekStart]?.plannedAt ? 'Re-plan' : 'Plan my week'}
        </button>
      </header>

      {(state.reviews[weekStart]?.priorities?.length ?? 0) > 0 && <WeekPriorities week={weekStart} />}

      <div className="week-layout">
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

        <div className="card week-cal">
          <div className="week-scroll">
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
