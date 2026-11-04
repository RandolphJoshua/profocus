import { parseQuickAdd } from '../lib/parse';
import { emptyState } from '../lib/storage';
import { quickAddActions, reducer } from './reducer';

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
