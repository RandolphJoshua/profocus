import { emptyState } from './storage';
import { SNAPSHOT_KEY, listSnapshots, saveSnapshot } from './snapshots';

beforeEach(() => localStorage.clear());

describe('snapshots', () => {
  const withTasks = (n: number) => ({ ...emptyState(), tasks: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `T${i}`, done: false, createdAt: '' })) });

  it('keeps the newest copies first, at most three', () => {
    for (let i = 1; i <= 4; i++) saveSnapshot(`r${i}`, withTasks(i), `2026-11-09T10:0${i}:00.000Z`);
    const list = listSnapshots();
    expect(list.map((s) => s.reason)).toEqual(['r4', 'r3', 'r2']);
    expect(list[0]?.counts.tasks).toBe(4);
    expect(list[0]?.state.tasks).toHaveLength(4);
  });

  it('skips empty states, which have nothing to protect', () => {
    saveSnapshot('reset', emptyState());
    expect(listSnapshots()).toEqual([]);
  });

  it('survives junk in storage', () => {
    localStorage.setItem(SNAPSHOT_KEY, '{"nope":1}');
    expect(listSnapshots()).toEqual([]);
    saveSnapshot('ok', withTasks(1));
    expect(listSnapshots()).toHaveLength(1);
  });
});
