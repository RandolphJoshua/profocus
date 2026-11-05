import { useState } from 'react';
import { Modal } from './Modal';
import { addDays, formatDay, formatDuration, shortWeekday, weekDays } from '../lib/date';
import { currentSeason, weekStats } from '../lib/stats';
import { uid } from '../lib/storage';
import type { DateKey, WeekPriority } from '../lib/types';
import { useStore, useToday } from '../state/store';

const STEPS = ['Last week', 'This week’s three', 'Protect time'] as const;

/** Three-step weekly planning ritual for the week starting `week`. */
export function PlanWeek({ week, onClose }: { week: DateKey; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [step, setStep] = useState(0);
  const prev = addDays(week, -7);
  const prevReview = state.reviews[prev] ?? {};
  const stats = weekStats(state, prev, today);

  const [slots, setSlots] = useState<WeekPriority[]>(() => {
    const existing = state.reviews[week]?.priorities ?? [];
    return Array.from({ length: 3 }, (_, i) => existing[i] ?? { id: uid('wp-'), title: '', done: false });
  });
  const [dayFor, setDayFor] = useState<Record<string, DateKey>>({});
  const [estimate, setEstimate] = useState<Record<string, number>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const days = weekDays(week);
  const defaultDay = days.find((d) => d >= today) ?? week;
  const filled = slots.filter((s) => s.title.trim());
  const activeGoals = state.goals.filter((g) => g.status === 'active');
  const seasonIds = currentSeason(state.seasons, today)?.goalIds ?? [];
  const seasonGoals = seasonIds.flatMap((id) => activeGoals.find((g) => g.id === id) ?? []);
  const otherGoals = activeGoals.filter((g) => !seasonIds.includes(g.id));

  const patchSlot = (i: number, patch: Partial<WeekPriority>) =>
    setSlots((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setReflect = (patch: { wins?: string; lessons?: string; nextFocus?: string }) =>
    dispatch({ type: 'SET_REVIEW', week: prev, patch });

  const next = () => {
    if (step === 1) {
      dispatch({ type: 'SET_WEEK_PRIORITIES', week, priorities: filled.map((s) => ({ ...s, title: s.title.trim() })) });
    }
    setStep(step + 1);
  };

  // A task with this title already in the week counts as added (survives closing and re-planning).
  const hasTask = (p: WeekPriority) => state.tasks.some((t) => t.title === p.title.trim() && !!t.date && days.includes(t.date));
  const addTask = (p: WeekPriority) => {
    if (hasTask(p)) return;
    const project = state.projects.find((x) => x.goalId === p.goalId && !x.archived && p.goalId);
    dispatch({
      type: 'ADD_TASK',
      task: {
        id: uid('t-'), title: p.title.trim(), projectId: project?.id, date: dayFor[p.id] ?? defaultDay,
        estimateMin: estimate[p.id] ?? 90, done: false, createdAt: new Date().toISOString(),
      },
    });
    setAdded((a) => ({ ...a, [p.id]: true }));
  };

  // Spread the rest across different days: the first three days that are still ahead (Mon, Tue, Wed for a future week).
  const spreadDays = days.filter((d) => d >= today).length ? days.filter((d) => d >= today) : days;
  const pending = filled.filter((p) => !added[p.id] && !hasTask(p));
  const addedCount = filled.length - pending.length;
  const addAll = () => {
    const chosen: Record<string, DateKey> = {};
    pending.forEach((p, i) => { chosen[p.id] = dayFor[p.id] ?? spreadDays[(addedCount + i) % spreadDays.length] ?? defaultDay; });
    const now = new Date().toISOString();
    for (const p of pending) {
      const project = state.projects.find((x) => x.goalId === p.goalId && !x.archived && p.goalId);
      dispatch({
        type: 'ADD_TASK',
        task: { id: uid('t-'), title: p.title.trim(), projectId: project?.id, date: chosen[p.id], estimateMin: estimate[p.id] ?? 90, done: false, createdAt: now },
      });
    }
    setDayFor((d) => ({ ...d, ...chosen }));
    setAdded((a) => ({ ...a, ...Object.fromEntries(pending.map((p) => [p.id, true])) }));
  };

  return (
    <Modal title="Plan my week" onClose={onClose}>
      <p className="muted num ritual-step">Step {step + 1} of 3 · {STEPS[step]}</p>

      {step === 0 && (
        <div className="stack">
          <div className="mini-strip num">
            <span><small>Focused</small>{formatDuration(stats.focusTotal)}</span>
            <span><small>Tasks done</small>{stats.tasksCompleted}</span>
            <span><small>Highlights</small>{stats.highlightsDone}/{stats.highlightsSet}</span>
            <span><small>Habits</small>{Math.round(stats.habitRate * 100)}%</span>
          </div>
          <label>What went well?
            <textarea rows={2} value={prevReview.wins ?? ''} onChange={(e) => setReflect({ wins: e.target.value })} />
          </label>
          <label>What didn’t, and what will I change?
            <textarea rows={2} value={prevReview.lessons ?? ''} onChange={(e) => setReflect({ lessons: e.target.value })} />
          </label>
          <label>This week, the most important thing is…
            <textarea rows={2} value={prevReview.nextFocus ?? ''} onChange={(e) => setReflect({ nextFocus: e.target.value })} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          {slots.map((s, i) => (
            <div key={s.id} className="prio-edit">
              <label>Priority {i + 1}
                <input value={s.title} placeholder="An outcome, not a task" onChange={(e) => patchSlot(i, { title: e.target.value })} />
              </label>
              <label>Goal
                <select aria-label={`Goal for priority ${i + 1}`} value={s.goalId ?? ''} onChange={(e) => patchSlot(i, { goalId: e.target.value || undefined })}>
                  <option value="">No goal</option>
                  {seasonGoals.length > 0 ? (
                    <>
                      <optgroup label="This season">
                        {seasonGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                      </optgroup>
                      {otherGoals.length > 0 && (
                        <optgroup label="Other goals">
                          {otherGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                        </optgroup>
                      )}
                    </>
                  ) : activeGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          {filled.length === 0 && <p className="muted">No priorities to protect time for. Go back and add one.</p>}
          {pending.length > 1 && (
            <div className="row gap">
              <button type="button" className="btn" onClick={addAll}>{pending.length === 3 ? 'Add all three' : `Add all ${pending.length}`}</button>
            </div>
          )}
          {filled.map((p) => (
            <div key={p.id} className="protect-row">
              <p className="protect-title">{p.title}</p>
              {added[p.id] || hasTask(p) ? (
                <p className="muted">Added as a task on {formatDay(dayFor[p.id] ?? defaultDay, { weekday: 'long' })}</p>
              ) : (
                <div className="row gap">
                  <label>Day
                    <select aria-label={`Day for ${p.title}`} value={dayFor[p.id] ?? defaultDay} onChange={(e) => setDayFor({ ...dayFor, [p.id]: e.target.value })}>
                      {days.map((d) => <option key={d} value={d}>{shortWeekday(d)} {Number(d.slice(8))}</option>)}
                    </select>
                  </label>
                  <label>Minutes
                    <input type="number" min={15} step={15} className="num" aria-label={`Minutes for ${p.title}`} value={estimate[p.id] ?? 90} onChange={(e) => setEstimate({ ...estimate, [p.id]: Number(e.target.value) || 90 })} />
                  </label>
                  <button type="button" className="btn" aria-label={`Add ${p.title} as task`} onClick={() => addTask(p)}>Add as task</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="row gap ritual-foot">
        {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button>}
        <span className="spacer" />
        {step < 2 ? (
          <button type="button" className="btn primary" onClick={next}>Next</button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'SET_REVIEW', week, patch: { plannedAt: new Date().toISOString() } });
              onClose();
            }}
          >Done</button>
        )}
      </div>
    </Modal>
  );
}
