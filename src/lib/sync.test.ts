import { chooseSource, isTouched } from './sync';
import { emptyState } from './storage';

describe('isTouched', () => {
  it('is false for a fresh empty state', () => {
    expect(isTouched(emptyState())).toBe(false);
  });

  it('is true once any task, block, session, habit or goal exists', () => {
    const base = emptyState();
    expect(isTouched({ ...base, tasks: [{ id: 't' } as never] })).toBe(true);
    expect(isTouched({ ...base, blocks: [{ id: 'b' } as never] })).toBe(true);
    expect(isTouched({ ...base, sessions: [{ id: 's' } as never] })).toBe(true);
    expect(isTouched({ ...base, habits: [{ id: 'h' } as never] })).toBe(true);
    expect(isTouched({ ...base, goals: [{ id: 'g' } as never] })).toBe(true);
  });

  it('ignores settings changes', () => {
    const base = emptyState();
    expect(isTouched({ ...base, settings: { ...base.settings, focusMin: 50 } })).toBe(false);
  });
});

describe('chooseSource', () => {
  const remote = (touched: boolean) => ({ updatedAt: '2026-11-01T10:00:00Z', touched });

  it('uploads local when there is no remote row', () => {
    expect(chooseSource({ localTouched: true })).toBe('local');
    expect(chooseSource({ localTouched: false })).toBe('local');
  });

  it('pulls remote when local is untouched', () => {
    expect(chooseSource({ localTouched: false, remote: remote(true) })).toBe('remote');
  });

  it('keeps local when the remote row is empty', () => {
    expect(chooseSource({ localTouched: true, remote: remote(false) })).toBe('local');
  });

  it('asks when both sides hold data', () => {
    expect(chooseSource({ localTouched: true, localSavedAt: '2026-10-30T09:00:00Z', remote: remote(true) })).toBe('ask');
  });
});
