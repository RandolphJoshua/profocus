import { useState } from 'react';
import { Modal } from './Modal';
import { formatMinutes, minutesNow } from '../lib/date';
import { uid } from '../lib/storage';
import type { DateKey, Task } from '../lib/types';
import { nextFreeSlot } from '../state/reducer';
import { useStore, useToday } from '../state/store';
import { byPriority } from '../views/TodayView';

const STEPS = ['Triage', 'Highlight', 'Block it'] as const;

/** Three-step daily planning ritual: pull tasks in, choose the highlight, put it on the clock. */
export function PlanDay({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const today: DateKey = useToday();
  const [step, setStep] = useState(0);
  const plan = state.days[today] ?? {};
  const { dayStartHour, dayEndHour } = state.settings;

  // Candidates are fixed when the ritual opens so a ticked row doesn't vanish from the list.
  const [candidates] = useState<{ id: string; date?: DateKey }[]>(() =>
    state.tasks.filter((t) => !t.done && t.date !== today && (!t.date || t.date < today)).map((t) => ({ id: t.id, date: t.date })),
  );
  const [pick, setPick] = useState<string>(plan.highlightTaskId ?? (plan.highlight ? 'free' : ''));
  const [free, setFree] = useState(plan.highlightTaskId ? '' : plan.highlight ?? '');
  const [full, setFull] = useState<Record<string, boolean>>({});

  const todays = state.tasks.filter((t) => t.date === today && !t.done).sort(byPriority);
  const candidateTasks = candidates.map((c) => ({ ...c, task: state.tasks.find((t) => t.id === c.id) })).filter((c): c is typeof c & { task: Task } => !!c.task);

  const setDate = (id: string, date?: DateKey) => dispatch({ type: 'UPDATE_TASK', id, patch: { date } });

  const next = () => {
    if (step === 1) {
      if (pick === 'free' && free.trim()) {
        dispatch({ type: 'SET_DAY', date: today, patch: { highlight: free.trim(), highlightTaskId: undefined, highlightDone: false } });
      } else if (pick && pick !== 'free') {
        const t = state.tasks.find((x) => x.id === pick);
        if (t) dispatch({ type: 'SET_DAY', date: today, patch: { highlight: t.title, highlightTaskId: t.id, highlightDone: false } });
      }
    }
    setStep(step + 1);
  };

  const schedule = (t: Task) => {
    const slot = nextFreeSlot(state.blocks, today, minutesNow(), t.estimateMin ?? 30, dayStartHour * 60, dayEndHour * 60);
    if (!slot) {
      setFull((f) => ({ ...f, [t.id]: true }));
      return;
    }
    dispatch({
      type: 'ADD_BLOCK',
      block: { id: uid('b-'), date: today, start: slot.start, end: slot.end, title: t.title, kind: 'focus', taskId: t.id, projectId: t.projectId },
    });
  };

  return (
    <Modal title="Plan my day" onClose={onClose}>
      <p className="muted num ritual-step">Step {step + 1} of 3 · {STEPS[step]}</p>

      {step === 0 && (
        <div className="stack">
          {candidateTasks.length === 0 ? (
            <p className="muted">Nothing overdue and nothing in the inbox.</p>
          ) : (
            <>
              <div className="row gap">
                <p className="muted">Overdue and inbox tasks. Tick what you will do today.</p>
                <span className="spacer" />
                <button type="button" className="btn" onClick={() => candidateTasks.forEach((c) => setDate(c.id, today))}>Move all to today</button>
              </div>
              <ul className="pick-list">
                {candidateTasks.map(({ id, date, task }) => (
                  <li key={id}>
                    <label className="check-label">
                      <input type="checkbox" checked={task.date === today} onChange={(e) => setDate(id, e.target.checked ? today : date)} />
                      <span>{task.title}</span>
                      <small className="muted num">{date ? `from ${date}` : 'inbox'}</small>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <fieldset className="stack pick-set">
          <legend className="muted">What one thing would make today a win?</legend>
          <ul className="pick-list">
            {todays.map((t) => (
              <li key={t.id}>
                <label className="check-label">
                  <input type="radio" name="highlight" checked={pick === t.id} onChange={() => setPick(t.id)} />
                  <span>{t.title}</span>
                </label>
              </li>
            ))}
            <li>
              <label className="check-label">
                <input type="radio" name="highlight" checked={pick === 'free'} onChange={() => setPick('free')} />
                <span>Something else</span>
              </label>
            </li>
          </ul>
          {pick === 'free' && <input autoFocus aria-label="Highlight in your own words" value={free} placeholder="Write it in one line" onChange={(e) => setFree(e.target.value)} />}
        </fieldset>
      )}

      {step === 2 && (
        <div className="stack">
          {todays.length === 0 && <p className="muted">No open tasks for today.</p>}
          <ul className="pick-list">
            {todays.map((t) => {
              const block = state.blocks.find((b) => b.date === today && b.taskId === t.id);
              return (
                <li key={t.id} className="schedule-row">
                  <span>{t.title}</span>
                  <small className="muted num">{t.estimateMin ?? 30}m</small>
                  <span className="spacer" />
                  {block ? (
                    <span className="num">{formatMinutes(block.start)}–{formatMinutes(block.end)}</span>
                  ) : full[t.id] ? (
                    <span className="muted">No free time left</span>
                  ) : (
                    <button type="button" className="btn" aria-label={`Schedule ${t.title}`} onClick={() => schedule(t)}>Schedule</button>
                  )}
                </li>
              );
            })}
          </ul>
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
              dispatch({ type: 'SET_DAY', date: today, patch: { plannedAt: new Date().toISOString() } });
              onClose();
            }}
          >Done</button>
        )}
      </div>
    </Modal>
  );
}
