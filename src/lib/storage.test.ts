import { DEFAULT_SETTINGS, loadState, normalizeState, STORAGE_KEY } from './storage';

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
