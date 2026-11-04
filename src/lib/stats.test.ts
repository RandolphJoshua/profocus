import { emptyState } from './storage';
import { habitStreak, weekStats } from './stats';
import type { AppState } from './types';

describe('habitStreak', () => {
  const log = { '2026-11-02': ['h'], '2026-11-03': ['h'], '2026-11-04': ['h'], '2026-10-31': ['h'] };
  it('counts consecutive days ending today', () => {
    expect(habitStreak(log, 'h', '2026-11-04')).toBe(3);
  });
  it('keeps yesterday’s streak alive before today is checked off', () => {
    expect(habitStreak(log, 'h', '2026-11-05')).toBe(3);
  });
  it('is zero after a missed day', () => {
    expect(habitStreak(log, 'h', '2026-11-06')).toBe(0);
  });
});

describe('weekStats', () => {
  it('aggregates focus, tasks, highlights and habits', () => {
    const s: AppState = {
      ...emptyState(),
      tasks: [
        { id: 't1', title: 'a', projectId: 'p-work', done: true, doneAt: '2026-11-03T10:00:00Z', createdAt: '2026-11-01T00:00:00Z' },
        { id: 't2', title: 'b', done: true, doneAt: '2026-10-20T10:00:00Z', createdAt: '2026-10-01T00:00:00Z' },
      ],
      sessions: [
        { id: 's1', startedAt: '', date: '2026-11-02', minutes: 25, taskId: 't1' },
        { id: 's2', startedAt: '', date: '2026-11-03', minutes: 50, projectId: 'p-personal' },
        { id: 's3', startedAt: '', date: '2026-10-30', minutes: 99 },
      ],
      habits: [{ id: 'h', name: 'Read', color: '#000', createdAt: '2026-11-01T00:00:00Z' }],
      habitLog: { '2026-11-02': ['h'], '2026-11-03': ['h'] },
      days: { '2026-11-02': { highlight: 'x', highlightDone: true }, '2026-11-03': { highlight: 'y' } },
    };
    const w = weekStats(s, '2026-11-02', '2026-11-04');
    expect(w.focusTotal).toBe(75);
    expect(w.focusByDay.slice(0, 3)).toEqual([25, 50, 0]);
    expect(w.focusByProject).toEqual([
      { projectId: 'p-personal', minutes: 50 },
      { projectId: 'p-work', minutes: 25 },
    ]);
    expect(w.tasksCompleted).toBe(1);
    expect(w).toMatchObject({ highlightsSet: 2, highlightsDone: 1 });
    expect(w.habitRate).toBeCloseTo(2 / 3);
  });
});
