import { emptyState } from './storage';
import { currentSeason, seasonProgress, seasonWeekStrip, seasonWeekAlignment, dayScore, focusQuality, goalProgress, goalTrajectory, habitStreak, planDay, plannedStreak, weekScores, weekStats } from './stats';
import type { AppState, Season } from './types';

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

describe('goalTrajectory', () => {
  const TODAY = '2026-11-15'; // 10 days after creation, target 20 days after => dayOf 11 of 20
  const build = (done: number, open: number, over: Partial<AppState['goals'][number]> = {}): AppState => ({
    ...emptyState(),
    projects: [{ id: 'p', name: 'A', color: '#0', goalId: 'g' }],
    goals: [{ id: 'g', title: 'G', status: 'active', createdAt: '2026-11-05T09:00:00.000Z', targetDate: '2026-11-25', ...over }],
    tasks: [
      ...Array.from({ length: done }, (_, i) => ({ id: `d${i}`, title: '', projectId: 'p', done: true, createdAt: '' })),
      ...Array.from({ length: open }, (_, i) => ({ id: `o${i}`, title: '', projectId: 'p', done: false, createdAt: '' })),
    ],
  });
  it('counts days elapsed against the window', () => {
    expect(goalTrajectory(build(1, 1), 'g', TODAY)).toMatchObject({ dayOf: 11, daysTotal: 20, daysLeft: 10, expected: 11 / 20, actual: 0.5 });
  });
  it('is on track within 0.1 of expected', () => {
    expect(goalTrajectory(build(9, 11), 'g', TODAY).status).toBe('on-track'); // 0.45 >= 0.45
  });
  it('needs adjusting between 0.1 and 0.25 behind', () => {
    expect(goalTrajectory(build(7, 13), 'g', TODAY).status).toBe('adjust'); // 0.35
  });
  it('is off track more than 0.25 behind', () => {
    expect(goalTrajectory(build(1, 19), 'g', TODAY).status).toBe('off-track'); // 0.05
  });
  it('reads 0 actual with no tasks', () => {
    expect(goalTrajectory(build(0, 0), 'g', TODAY)).toMatchObject({ actual: 0, status: 'off-track' });
  });
  it('has no status without a target date', () => {
    expect(goalTrajectory(build(1, 1, { targetDate: undefined }), 'g', TODAY).status).toBe('no-date');
  });
  it('treats done goals as on track at 100%', () => {
    expect(goalTrajectory(build(0, 5, { status: 'done' }), 'g', TODAY)).toMatchObject({ status: 'on-track', actual: 1 });
  });
  it('measures from the local date of createdAt, not the UTC date', () => {
    const local = new Date(2026, 10, 5, 23, 30); // 23:30 local on 2026-11-05
    const g = build(1, 1, { createdAt: local.toISOString() });
    expect(goalTrajectory(g, 'g', '2026-11-05')).toMatchObject({ dayOf: 1, daysTotal: 20 });
  });
  it('clamps past the target date', () => {
    expect(goalTrajectory(build(1, 1), 'g', '2026-12-31')).toMatchObject({ dayOf: 20, daysLeft: 0 });
  });
});

describe('planDay', () => {
  const D = '2026-11-04';
  const t = (id: string, estimateMin?: number, over = {}) => ({ id, title: id, done: false, createdAt: '', estimateMin, ...over });
  it('chains placements so each task becomes busy for the next', () => {
    const out = planDay([], [t('a', 60), t('b', 30)], D, 600, 540, 1080);
    expect(out).toEqual([{ taskId: 'a', start: 600, end: 660 }, { taskId: 'b', start: 660, end: 690 }]);
  });
  it('steps around existing blocks', () => {
    const blocks = [{ id: 'x', date: D, start: 600, end: 660, title: '', kind: 'meeting' as const }];
    expect(planDay(blocks, [t('a', 60)], D, 600, 540, 1080)).toEqual([{ taskId: 'a', start: 660, end: 720 }]);
  });
  it('skips tasks that are already blocked or done, and those that do not fit', () => {
    const blocks = [{ id: 'x', date: D, start: 540, end: 570, title: '', kind: 'focus' as const, taskId: 'has' }];
    const out = planDay(blocks, [t('has', 30), t('fin', 30, { done: true }), t('big', 600), t('small', 15)], D, 540, 540, 1080);
    expect(out).toEqual([{ taskId: 'small', start: 570, end: 585 }]);
  });
  it('defaults to 30 minutes', () => {
    expect(planDay([], [t('a')], D, 540, 540, 1080)).toEqual([{ taskId: 'a', start: 540, end: 570 }]);
  });
});

describe('focusQuality', () => {
  const s = (date: string, rating?: 1 | 2 | 3) => ({ id: date + rating, startedAt: '', date, minutes: 25, rating });
  it('maps 1/2/3 to 0/50/100 and averages', () => {
    expect(focusQuality([s('2026-11-02', 1), s('2026-11-03', 3), s('2026-11-04', 3)], ['2026-11-02', '2026-11-03', '2026-11-04'])).toEqual({ rated: 3, quality: 67 });
  });
  it('ignores unrated sessions and days outside the range', () => {
    expect(focusQuality([s('2026-11-02', 2), s('2026-11-02'), s('2026-10-01', 3)], ['2026-11-02'])).toEqual({ rated: 1, quality: 50 });
  });
  it('is null when nothing is rated', () => {
    expect(focusQuality([s('2026-11-02')], ['2026-11-02'])).toEqual({ rated: 0, quality: null });
  });
});

const season = (over: Partial<Season> = {}): Season => ({
  id: 's1', name: 'Autumn', start: '2026-10-07', end: '2026-12-29', goalIds: ['g1', 'g2', 'g3'], createdAt: '2026-10-01T00:00:00Z', ...over,
});

describe('currentSeason', () => {
  it('is undefined with no seasons or none covering today', () => {
    expect(currentSeason([], '2026-11-04')).toBeUndefined();
    expect(currentSeason([season()], '2026-10-06')).toBeUndefined();
    expect(currentSeason([season()], '2026-12-30')).toBeUndefined();
  });
  it('finds the one containing today, ends inclusive', () => {
    expect(currentSeason([season()], '2026-11-04')?.id).toBe('s1');
    expect(currentSeason([season()], '2026-12-29')?.id).toBe('s1');
  });
  it('prefers the latest start when seasons overlap', () => {
    const a = season({ id: 'a', start: '2026-10-01' });
    const b = season({ id: 'b', start: '2026-11-01' });
    expect(currentSeason([b, a], '2026-11-04')?.id).toBe('b');
  });
  it('ignores closed seasons', () => {
    expect(currentSeason([season({ closedAt: '2026-11-01T00:00:00Z' })], '2026-11-04')).toBeUndefined();
  });
});

describe('seasonProgress', () => {
  const goal = (id: string, status: 'active' | 'done') => ({ id, title: id, status, createdAt: '' });
  const state: AppState = {
    ...emptyState(),
    seasons: [season()],
    goals: [goal('g1', 'done'), goal('g2', 'active'), goal('g3', 'active')],
    sessions: [
      { id: 'a', startedAt: '', date: '2026-10-06', minutes: 99 }, // before the season
      { id: 'b', startedAt: '', date: '2026-10-07', minutes: 30 },
      { id: 'c', startedAt: '', date: '2026-11-04', minutes: 45 },
      { id: 'd', startedAt: '', date: '2026-11-05', minutes: 77 }, // after today
    ],
    days: {
      '2026-10-07': { highlight: 'x', highlightDone: true },
      '2026-11-04': { highlight: 'y', highlightDone: true },
      '2026-11-03': { highlight: 'z' },
      '2026-10-01': { highlight: 'old', highlightDone: true },
    },
  };

  it('computes mid-season numbers', () => {
    // Oct 7 .. Dec 29 = 84 days = 12 weeks. Today is day 29 (Nov 4).
    expect(seasonProgress(state, 's1', '2026-11-04')).toEqual({
      weekOf: 5, weeksTotal: 12, daysLeft: 55, goalsDone: 1, goalsTotal: 3, focusMin: 75, highlightsHit: 2, daysElapsed: 29,
    });
  });
  it('before the start: week 1, nothing elapsed', () => {
    const p = seasonProgress(state, 's1', '2026-10-01');
    expect(p).toMatchObject({ weekOf: 1, daysElapsed: 0, focusMin: 0, highlightsHit: 0, daysLeft: 89 });
  });
  it('after the end: last week, no days left, range capped at the end', () => {
    const p = seasonProgress({ ...state, sessions: [...state.sessions, { id: 'e', startedAt: '', date: '2027-01-02', minutes: 500 }] }, 's1', '2027-01-10');
    expect(p).toMatchObject({ weekOf: 12, weeksTotal: 12, daysLeft: 0, daysElapsed: 84, focusMin: 30 + 45 + 77 });
  });
  it('counts only goals still in the state', () => {
    const p = seasonProgress({ ...state, goals: [goal('g1', 'done')] }, 's1', '2026-11-04');
    expect(p).toMatchObject({ goalsDone: 1, goalsTotal: 1 });
  });
});

describe('seasonWeekAlignment', () => {
  const season: Season = { id: 's', name: 'Autumn', start: '2026-10-05', end: '2026-12-27', goalIds: ['g1'], createdAt: '2026-10-05T00:00:00Z' };
  const base = (): AppState => ({ ...emptyState(), seasons: [season] });
  const pri = (goalId?: string) => [{ id: 'p', title: 'x', goalId, done: false }];

  it('is zero with no planned weeks', () => {
    expect(seasonWeekAlignment(base(), 's', '2026-11-02')).toEqual({ planned: 0, onSeason: 0 });
  });

  it('counts planned weeks and those that carry a season goal', () => {
    const s: AppState = {
      ...base(),
      reviews: {
        '2026-10-05': { priorities: pri('g1') },      // on season
        '2026-10-12': { priorities: pri('g2') },      // other goal
        '2026-10-19': { priorities: pri(undefined) }, // no goal
        '2026-10-26': { wins: 'reflection only' },   // not planned
      },
    };
    expect(seasonWeekAlignment(s, 's', '2026-11-02')).toEqual({ planned: 3, onSeason: 1 });
  });

  it('ignores weeks before the season and after the week in view', () => {
    const s: AppState = {
      ...base(),
      reviews: {
        '2026-09-28': { priorities: pri('g1') }, // before the season's first week
        '2026-10-05': { priorities: pri('g1') },
        '2026-11-09': { priorities: pri('g1') }, // after the week in view
      },
    };
    expect(seasonWeekAlignment(s, 's', '2026-11-02')).toEqual({ planned: 1, onSeason: 1 });
  });

  it('starts from the week containing the season start', () => {
    const s: AppState = { ...base(), reviews: { '2026-10-05': { priorities: pri('g1') } } };
    const mid = { ...s, seasons: [{ ...season, start: '2026-10-07' }] }; // a Wednesday; its week starts 10-05
    expect(seasonWeekAlignment(mid, 's', '2026-11-02')).toEqual({ planned: 1, onSeason: 1 });
  });

  it('is zero for an unknown season', () => {
    expect(seasonWeekAlignment(base(), 'nope', '2026-11-02')).toEqual({ planned: 0, onSeason: 0 });
  });
});

describe('seasonWeekStrip', () => {
  const season: Season = { id: 's', name: 'Autumn', start: '2026-10-05', end: '2026-12-27', goalIds: [], createdAt: '2026-10-05T00:00:00Z' };
  const pri = [{ id: 'p', title: 'x', done: false }];
  const base = (): AppState => ({ ...emptyState(), seasons: [season] });

  it('has one cell per week and marks past, current and future weeks', () => {
    const s: AppState = { ...base(), reviews: { '2026-10-05': { priorities: pri }, '2026-10-19': { priorities: pri }, '2026-11-02': { priorities: pri } } };
    const { cells, plannedSoFar, elapsed } = seasonWeekStrip(s, 's', '2026-11-04');
    expect(cells).toHaveLength(12);
    expect(cells.map((c) => c.state).slice(0, 6)).toEqual(['planned', 'unplanned', 'planned', 'unplanned', 'current', 'future']);
    expect(plannedSoFar).toBe(3);
    expect(elapsed).toBe(5);
  });

  it('is all future before the start and empty for an unknown season', () => {
    expect(seasonWeekStrip(base(), 's', '2026-09-01').cells.every((c) => c.state === 'future')).toBe(true);
    expect(seasonWeekStrip(base(), 'nope', '2026-11-04').cells).toEqual([]);
  });
});

describe('routines in free and blocked time', () => {
  const routine = { id: 'r1', title: 'Deep work', days: [3], start: 540, end: 660, kind: 'focus' as const, createdAt: '2026-11-01T00:00:00.000Z' };
  it('dayScore counts a focus routine as blocked time', () => {
    const s = { ...emptyState(), routines: [routine] };
    expect(dayScore(s, '2026-11-04').blockedMin).toBe(120); // Wednesday
    expect(dayScore(s, '2026-11-05').blockedMin).toBe(0);
  });
});
