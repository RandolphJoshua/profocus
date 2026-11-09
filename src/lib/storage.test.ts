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

describe('routines', () => {
  const good = { id: 'r1', title: 'Walk', days: [0, 3], start: 360, end: 420, kind: 'personal', createdAt: '2026-11-01T00:00:00.000Z' };
  const routines = (list: unknown[]) => normalizeState({ routines: list }).routines;

  it('defaults to no routines and no skips', () => {
    expect(normalizeState({})).toMatchObject({ routines: [], routineSkips: [] });
  });

  it('keeps a valid routine and its optional fields', () => {
    const full = { ...good, notes: 'Line 1\nLine 2', projectId: 'p-work', from: '2026-11-01', until: '2026-12-31', paused: true };
    expect(routines([full])).toEqual([full]);
  });

  it('collapses duplicate days and sorts them', () => {
    expect(routines([{ ...good, days: [3, 0, 3] }])[0]?.days).toEqual([0, 3]);
  });

  it('drops invalid routines', () => {
    const bad = [
      null, 'x', { ...good, id: '' }, { ...good, id: 'a|b' }, { ...good, title: '  ' }, { ...good, title: 'x'.repeat(121) },
      { ...good, days: [] }, { ...good, days: [7] }, { ...good, days: [1.5] }, { ...good, days: 'mon' },
      { ...good, start: -1 }, { ...good, start: 1440, end: 1445 }, { ...good, end: good.start + 4 }, { ...good, end: 1441 },
      { ...good, kind: 'party' }, { ...good, from: '2026-13-01' }, { ...good, until: 'soon' },
    ];
    expect(routines(bad)).toEqual([]);
    expect(routines([{ ...good, end: 1440 }, { ...good, id: 'r2', start: 0, end: 5 }])).toHaveLength(2);
  });

  it('keeps the first routine when ids repeat', () => {
    expect(routines([good, { ...good, title: 'Again' }]).map((r) => r.title)).toEqual(['Walk']);
  });

  it('caps routine and block notes at 2000 characters', () => {
    expect(routines([{ ...good, notes: 'n'.repeat(2500) }])[0]?.notes).toHaveLength(2000);
    const blocks = normalizeState({ blocks: [{ id: 'b1', date: '2026-11-04', start: 0, end: 30, title: 'T', kind: 'focus', notes: 'n'.repeat(2500) }] }).blocks;
    expect(blocks[0]?.notes).toHaveLength(2000);
  });

  it('drops virtual rt: blocks and the render-only routineId', () => {
    const blocks = normalizeState({
      blocks: [
        { id: 'rt:r1:2026-11-04', date: '2026-11-04', start: 0, end: 30, title: 'Virtual', kind: 'focus', routineId: 'r1' },
        { id: 'b1', date: '2026-11-04', start: 0, end: 30, title: 'Real', kind: 'focus', routineId: 'r1' },
      ],
    }).blocks;
    expect(blocks.map((b) => b.id)).toEqual(['b1']);
    expect(blocks[0]).not.toHaveProperty('routineId');
  });

  it('keeps only string skips, last 1000', () => {
    const skips = Array.from({ length: 1100 }, (_, i) => `r1|d${i}`);
    const out = normalizeState({ routineSkips: [...skips, 5, null] }).routineSkips;
    expect(out).toHaveLength(1000);
    expect(out.at(-1)).toBe('r1|d1099');
    expect(normalizeState({ routineSkips: 'x' }).routineSkips).toEqual([]);
  });
});
