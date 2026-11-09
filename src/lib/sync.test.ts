import { SYNC_LINK_KEY, chooseSource, isTouched, loadSyncLink, saveSyncLink, stateHash } from './sync';
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

describe('chooseSource on a device already linked to the account', () => {
  const at = '2026-11-09T10:00:00.000Z';
  const link = { userId: 'u1', at, hash: 'h-synced' };
  const base = { localTouched: true, userId: 'u1', link };

  it('pulls the cloud copy when nothing changed on either side', () => {
    expect(chooseSource({ ...base, localHash: 'h-synced', remote: { updatedAt: at, touched: true } })).toBe('remote');
  });

  it('pulls the cloud copy when only another device changed it', () => {
    expect(chooseSource({ ...base, localHash: 'h-synced', remote: { updatedAt: '2026-11-09T11:00:00.000Z', touched: true } })).toBe('remote');
  });

  it('uploads when only this device changed since the last sync', () => {
    expect(chooseSource({ ...base, localHash: 'h-edited', remote: { updatedAt: at, touched: true } })).toBe('local');
  });

  it('asks only when both sides changed since the last sync', () => {
    expect(chooseSource({ ...base, localHash: 'h-edited', remote: { updatedAt: '2026-11-09T11:00:00.000Z', touched: true } })).toBe('ask');
  });

  it('asks when the device was linked to a different account', () => {
    expect(chooseSource({ ...base, userId: 'u2', localHash: 'h-synced', remote: { updatedAt: at, touched: true } })).toBe('ask');
  });
});

describe('stateHash', () => {
  it('is stable for equal states and changes with content', () => {
    const a = emptyState();
    expect(stateHash(a)).toBe(stateHash(JSON.parse(JSON.stringify(a))));
    expect(stateHash({ ...a, tasks: [{ id: 't' } as never] })).not.toBe(stateHash(a));
  });
});

describe('sync link storage', () => {
  it('round-trips and rejects junk', () => {
    saveSyncLink({ userId: 'u1', at: 'x', hash: 'h' });
    expect(loadSyncLink()).toEqual({ userId: 'u1', at: 'x', hash: 'h' });
    localStorage.setItem(SYNC_LINK_KEY, '{"userId":1}');
    expect(loadSyncLink()).toBeUndefined();
    localStorage.setItem(SYNC_LINK_KEY, 'not json');
    expect(loadSyncLink()).toBeUndefined();
  });
});
