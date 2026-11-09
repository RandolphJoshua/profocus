import { DEFAULT_SETTINGS, loadSavedAt, loadState, normalizeState, saveState, STORAGE_KEY } from './storage';

describe('storage', () => {
  it('falls back to defaults for garbage input', () => {
    expect(normalizeState('nope').tasks).toEqual([]);
    expect(normalizeState({ tasks: 'x', settings: { focusMin: 50 } }).settings).toEqual({ ...DEFAULT_SETTINGS, focusMin: 50 });
  });

  it('survives corrupt JSON in storage', () => {
    const s = loadState({ getItem: (k) => (k === STORAGE_KEY ? '{bad json' : null) });
    expect(s.projects.length).toBeGreaterThan(0);
  });
});

describe('goals', () => {
  it('defaults goals to [] and keeps valid ones', () => {
    expect(normalizeState({}).goals).toEqual([]);
    expect(normalizeState({ goals: 'x' }).goals).toEqual([]);
    const g = { id: 'g', title: 'T', status: 'active', createdAt: '' };
    expect(normalizeState({ goals: [g] }).goals).toEqual([g]);
  });
});

describe('seasons', () => {
  it('defaults seasons to [] and keeps valid ones', () => {
    expect(normalizeState({}).seasons).toEqual([]);
    expect(normalizeState({ seasons: 'x' }).seasons).toEqual([]);
    const s = { id: 's', name: 'N', start: '2026-10-01', end: '2026-12-23', goalIds: [], createdAt: '' };
    expect(normalizeState({ seasons: [s] }).seasons).toEqual([s]);
  });
});

describe('savedAt', () => {
  it('records an ISO stamp on save and reads it back', () => {
    const data = new Map<string, string>();
    const store = { setItem: (k: string, v: string) => void data.set(k, v), getItem: (k: string) => data.get(k) ?? null };
    expect(loadSavedAt(store)).toBeUndefined();
    saveState(normalizeState({}), store);
    expect(new Date(loadSavedAt(store)!).toISOString()).toBe(loadSavedAt(store));
  });
});

describe('monday fields', () => {
  it('keeps a valid source and externalId on a task and drops invalid ones', () => {
    const ok = { id: 't1', title: 'A', done: false, createdAt: '', source: 'monday', externalId: '42' };
    const bad = { id: 't2', title: 'B', done: false, createdAt: '', source: 'evil', externalId: '7' };
    const noId = { id: 't3', title: 'C', done: false, createdAt: '', source: 'monday', externalId: 9 };
    const { tasks } = normalizeState({ tasks: [ok, bad, noId, 'junk'] });
    expect(tasks[0]).toEqual(ok);
    expect(tasks[1]).toEqual({ id: 't2', title: 'B', done: false, createdAt: '' });
    expect(tasks[2]).toEqual({ id: 't3', title: 'C', done: false, createdAt: '' });
    expect(tasks[3]).toBe('junk');
  });

  it('keeps mondaySeen as a string array capped at the last 2000', () => {
    expect(normalizeState({}).settings.mondaySeen).toBeUndefined();
    expect(normalizeState({ settings: { mondaySeen: 'x' } }).settings.mondaySeen).toBeUndefined();
    expect(normalizeState({ settings: { mondaySeen: ['1', 2, '3'] } }).settings.mondaySeen).toEqual(['1', '3']);
    const many = Array.from({ length: 2500 }, (_, i) => String(i));
    const seen = normalizeState({ settings: { mondaySeen: many } }).settings.mondaySeen;
    expect(seen).toHaveLength(2000);
    expect(seen?.[0]).toBe('500');
  });
});
