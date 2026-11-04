import { emptyState } from './storage';
import { dayScore, goalProgress, habitStreak, plannedStreak, weekScores, weekStats } from './stats';
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

describe('dayScore', () => {
  const D = '2026-11-04';
  const base = (): AppState => ({
    ...emptyState(),
    days: { [D]: { highlight: 'x', highlightDone: true, plannedAt: 'z' } },
    blocks: [{ id: 'b', date: D, start: 540, end: 660, title: '', kind: 'focus' }],
    sessions: [{ id: 's', startedAt: '', date: D, minutes: 60 }],
    habits: [{ id: 'h1', name: 'a', color: '#0', createdAt: '2026-01-01T00:00:00Z' }, { id: 'h2', name: 'b', color: '#0', createdAt: '2026-01-01T00:00:00Z' }],
    habitLog: { [D]: ['h1'] },
    tasks: [
      { id: 't1', title: 'a', date: D, done: true, createdAt: '' },
      { id: 't2', title: 'b', date: D, done: false, createdAt: '' },
    ],
  });
  it('applies the 40/30/15/15 formula', () => {
    const r = dayScore(base(), D);
    // 40 + 30*(60/120) + 15*0.5 + 15*0.5 = 70
    expect(r).toMatchObject({ planned: true, highlightSet: true, highlightDone: true, focusMin: 60, blockedMin: 120, habitsDone: 1, habitsTotal: 2, tasksDone: 1, tasksPlanned: 2, score: 70 });
  });
  it('uses an hour when nothing is blocked, and full credit for no habits/tasks', () => {
    const s = { ...emptyState(), sessions: [{ id: 's', startedAt: '', date: D, minutes: 30 }] };
    expect(dayScore(s, D).score).toBe(15 + 15 + 15); // 30*0.5 + 15 + 15
  });
  it('gives 0 highlight credit when unset or open', () => {
    const s = base();
    s.days[D] = { highlight: 'x' };
    expect(dayScore(s, D).score).toBe(30);
  });
});

describe('plannedStreak', () => {
  const s: AppState = { ...emptyState(), days: { '2026-11-02': { plannedAt: 'x' }, '2026-11-03': { plannedAt: 'x' } } };
  it('counts back from yesterday when today is unplanned', () => {
    expect(plannedStreak(s, '2026-11-04')).toBe(2);
  });
  it('includes today and resets after a gap', () => {
    s.days['2026-11-04'] = { plannedAt: 'x' };
    expect(plannedStreak(s, '2026-11-04')).toBe(3);
    expect(plannedStreak(s, '2026-11-06')).toBe(0);
  });
});

describe('weekScores', () => {
  it('returns 7 days with future days zeroed', () => {
    const s: AppState = { ...emptyState(), days: { '2026-11-05': { plannedAt: 'x' } } };
    const w = weekScores(s, '2026-11-02', '2026-11-04');
    expect(w).toHaveLength(7);
    expect(w[0]!.score).toBe(30);
    expect(w[3]).toMatchObject({ date: '2026-11-05', planned: false, score: 0 });
  });
});

describe('goalProgress', () => {
  it('rolls sessions and tasks up through projects', () => {
    const s: AppState = {
      ...emptyState(),
      projects: [{ id: 'p1', name: 'A', color: '#0', goalId: 'g' }, { id: 'p2', name: 'B', color: '#0' }],
      tasks: [
        { id: 't1', title: '', projectId: 'p1', done: true, createdAt: '' },
        { id: 't2', title: '', projectId: 'p1', done: false, createdAt: '' },
        { id: 't3', title: '', projectId: 'p2', done: true, createdAt: '' },
      ],
      sessions: [
        { id: 's1', startedAt: '', date: '2026-11-03', minutes: 25, projectId: 'p1' },
        { id: 's2', startedAt: '', date: '2026-11-02', minutes: 30, taskId: 't2' },
        { id: 's3', startedAt: '', date: '2026-11-02', minutes: 99, projectId: 'p2' },
        { id: 's4', startedAt: '', date: '2026-09-01', minutes: 99, projectId: 'p1' },
      ],
      reviews: {
        '2026-11-02': { priorities: [{ id: 'a', title: '', goalId: 'g', done: false }] },
        '2026-10-26': { priorities: [{ id: 'b', title: '', goalId: 'g', done: true }, { id: 'c', title: '', goalId: 'g', done: false }] },
        '2026-10-19': { priorities: [{ id: 'd', title: '', done: false }] },
      },
    };
    expect(goalProgress(s, 'g', '2026-11-04')).toEqual({
      goalId: 'g', focusMin30d: 55, tasksDone: 1, tasksOpen: 1, weeksPrioritised: 2, projects: ['p1'],
    });
  });
});
