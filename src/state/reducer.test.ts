import { parseQuickAdd } from '../lib/parse';
import { emptyState } from '../lib/storage';
import { nextFreeSlot, quickAddActions, reducer } from './reducer';

const TODAY = '2026-11-04';
let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const NOW = '2026-11-04T09:00:00.000Z';

describe('quickAddActions', () => {
  beforeEach(() => { n = 0; });

  it('reuses an existing project (case-insensitive prefix) and time-blocks timed tasks', () => {
    const s0 = emptyState();
    const actions = quickAddActions(parseQuickAdd('Ship report 1h @10am #wor', TODAY), s0, { now: NOW, makeId });
    const s1 = reducer(s0, { type: 'BATCH', actions });
    expect(s1.projects).toHaveLength(s0.projects.length);
    expect(s1.tasks[0]).toMatchObject({ title: 'Ship report', projectId: 'p-work', date: TODAY, estimateMin: 60 });
    expect(s1.blocks[0]).toMatchObject({ date: TODAY, start: 600, end: 660, taskId: s1.tasks[0]!.id });
  });

  it('creates unknown projects and honours the default date', () => {
    const s0 = emptyState();
    const actions = quickAddActions(parseQuickAdd('Sketch #art', TODAY), s0, { now: NOW, makeId, defaultDate: TODAY });
    const s1 = reducer(s0, { type: 'BATCH', actions });
    expect(s1.projects.at(-1)).toMatchObject({ name: 'Art' });
    expect(s1.tasks[0]).toMatchObject({ date: TODAY, projectId: s1.projects.at(-1)!.id });
    expect(s1.blocks).toHaveLength(0);
  });

  it('someday overrides the default date', () => {
    const actions = quickAddActions(parseQuickAdd('Learn piano someday', TODAY), emptyState(), { now: NOW, makeId, defaultDate: TODAY });
    expect(reducer(emptyState(), { type: 'BATCH', actions }).tasks[0]?.date).toBeUndefined();
  });

  it('ignores empty titles', () => {
    expect(quickAddActions(parseQuickAdd('!high', TODAY), emptyState(), { now: NOW, makeId })).toEqual([]);
  });
});

describe('reducer', () => {
  const base = () => reducer(emptyState(), {
    type: 'BATCH',
    actions: [
      { type: 'ADD_TASK', task: { id: 't1', title: 'Old', date: '2026-11-01', done: false, createdAt: NOW } },
      { type: 'ADD_TASK', task: { id: 't2', title: 'Done', date: '2026-11-01', done: true, createdAt: NOW } },
      { type: 'ADD_BLOCK', block: { id: 'b1', date: TODAY, start: 0, end: 30, title: 'x', kind: 'focus', taskId: 't1' } },
      { type: 'SET_DAY', date: TODAY, patch: { highlight: 'Old', highlightTaskId: 't1' } },
    ],
  });

  it('toggles tasks and stamps doneAt', () => {
    const s = reducer(base(), { type: 'TOGGLE_TASK', id: 't1', now: NOW });
    expect(s.tasks[0]).toMatchObject({ done: true, doneAt: NOW });
    expect(reducer(s, { type: 'TOGGLE_TASK', id: 't1', now: NOW }).tasks[0]?.doneAt).toBeUndefined();
  });

  it('rolls unfinished overdue tasks forward only', () => {
    const s = reducer(base(), { type: 'ROLL_OVER', to: TODAY });
    expect(s.tasks.map((t) => t.date)).toEqual([TODAY, '2026-11-01']);
  });

  it('unlinks blocks and highlights when a task is deleted', () => {
    const s = reducer(base(), { type: 'DELETE_TASK', id: 't1' });
    expect(s.tasks).toHaveLength(1);
    expect(s.blocks[0]?.taskId).toBeUndefined();
    expect(s.days[TODAY]?.highlightTaskId).toBeUndefined();
    expect(s.days[TODAY]?.highlight).toBe('Old');
  });

  it('toggles habits per day and cleans the log on delete', () => {
    let s = reducer(emptyState(), { type: 'ADD_HABIT', habit: { id: 'h', name: 'Read', color: '#000', createdAt: NOW } });
    s = reducer(s, { type: 'TOGGLE_HABIT', id: 'h', date: TODAY });
    expect(s.habitLog[TODAY]).toEqual(['h']);
    s = reducer(s, { type: 'TOGGLE_HABIT', id: 'h', date: TODAY });
    expect(s.habitLog[TODAY]).toEqual([]);
    s = reducer(reducer(s, { type: 'TOGGLE_HABIT', id: 'h', date: TODAY }), { type: 'DELETE_HABIT', id: 'h' });
    expect(s.habitLog[TODAY]).toEqual([]);
  });

  it('does not mutate the previous state', () => {
    const s0 = base();
    const snapshot = JSON.stringify(s0);
    reducer(s0, { type: 'UPDATE_TASK', id: 't1', patch: { title: 'New' } });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe('goals and priorities', () => {
  const goal = { id: 'g1', title: 'Ship', status: 'active' as const, createdAt: NOW };
  it('adds, updates and deletes a goal, clearing references', () => {
    let s = reducer(emptyState(), { type: 'ADD_GOAL', goal });
    s = reducer(s, { type: 'UPDATE_GOAL', id: 'g1', patch: { status: 'done', doneAt: NOW } });
    expect(s.goals[0]).toMatchObject({ id: 'g1', status: 'done', doneAt: NOW });
    s = reducer(s, { type: 'UPDATE_PROJECT', id: 'p-work', patch: { goalId: 'g1' } });
    s = reducer(s, { type: 'SET_WEEK_PRIORITIES', week: '2026-11-02', priorities: [{ id: 'a', title: 'A', goalId: 'g1', done: false }] });
    s = reducer(s, { type: 'DELETE_GOAL', id: 'g1' });
    expect(s.goals).toEqual([]);
    expect(s.projects.find((p) => p.id === 'p-work')!.goalId).toBeUndefined();
    expect(s.reviews['2026-11-02']!.priorities![0]!.goalId).toBeUndefined();
  });
  it('limits priorities to three and toggles one', () => {
    const pr = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id, done: false }));
    let s = reducer(emptyState(), { type: 'SET_WEEK_PRIORITIES', week: 'w', priorities: pr });
    expect(s.reviews.w!.priorities).toHaveLength(3);
    s = reducer(s, { type: 'TOGGLE_WEEK_PRIORITY', week: 'w', id: 'b' });
    expect(s.reviews.w!.priorities!.map((p) => p.done)).toEqual([false, true, false]);
    expect(reducer(s, { type: 'TOGGLE_WEEK_PRIORITY', week: 'none', id: 'b' })).toBe(s);
  });
  it('rates a session', () => {
    const s0 = reducer(emptyState(), { type: 'LOG_SESSION', session: { id: 's', startedAt: NOW, date: TODAY, minutes: 25 } });
    expect(reducer(s0, { type: 'RATE_SESSION', id: 's', rating: 3 }).sessions[0]!.rating).toBe(3);
  });
});

describe('nextFreeSlot', () => {
  const blk = (start: number, end: number, date = TODAY) => ({ id: `${start}`, date, start, end, title: '', kind: 'focus' as const });
  it('snaps to 15 minutes and starts at dayStart', () => {
    expect(nextFreeSlot([], TODAY, 0, 30, 420, 1320)).toEqual({ start: 420, end: 450 });
    expect(nextFreeSlot([], TODAY, 500, 30, 420, 1320)).toEqual({ start: 510, end: 540 });
  });
  it('finds a gap between blocks', () => {
    const blocks = [blk(540, 600), blk(660, 720), blk(0, 1440, '2026-11-05')];
    expect(nextFreeSlot(blocks, TODAY, 540, 60, 420, 1320)).toEqual({ start: 600, end: 660 });
    expect(nextFreeSlot(blocks, TODAY, 540, 90, 420, 1320)).toEqual({ start: 720, end: 810 });
  });
  it('returns null when nothing fits', () => {
    expect(nextFreeSlot([blk(420, 1300)], TODAY, 420, 60, 420, 1320)).toBeNull();
  });
});
