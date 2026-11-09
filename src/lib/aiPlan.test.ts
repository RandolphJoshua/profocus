import { describe, expect, test } from 'vitest';
import { buildPlanRequest, describeApplied, parsePlan, toActions } from './aiPlan';
import { emptyState } from './storage';
import type { AppState, Task, TimeBlock } from './types';
import { reducer } from '../state/reducer';

const TODAY = '2026-11-09'; // a Monday
const clock = { today: TODAY, nowMin: 9 * 60 };
const task = (o: Partial<Task> & { id: string }): Task => ({ title: o.id, done: false, createdAt: '2026-11-01T00:00:00Z', ...o });
const block = (o: Partial<TimeBlock> & { id: string }): TimeBlock => ({ date: TODAY, start: 600, end: 660, title: 'Dinner', kind: 'personal', ...o });

function stateWith(patch: Partial<AppState> = {}): AppState {
  const s = emptyState();
  return { ...s, settings: { ...s.settings, dayStartHour: 8, dayEndHour: 20 }, ...patch };
}
const plan = (o: unknown, s: AppState = stateWith()) => parsePlan(JSON.stringify(o), s, clock);
const blk = (o: Record<string, unknown>) => ({ date: TODAY, start: '13:00', end: '15:00', title: 'Fix WABA', ...o });

describe('parsePlan', () => {
  test('parses a valid plan into task, block and update items', () => {
    const s = stateWith({ tasks: [task({ id: 'a', priority: 'low' })] });
    const r = plan({
      summary: 'Two hours on the fix.',
      newTasks: [{ ref: 't1', title: 'Fix WABA', estimateMin: 120, priority: 'high', project: 'work', date: TODAY }],
      blocks: [blk({ taskRef: 't1' })],
      taskUpdates: [{ taskId: 'a', priority: 'high' }],
    }, s);
    expect(r.summary).toBe('Two hours on the fix.');
    expect(r.dropped).toEqual([]);
    expect(r.items.map((i) => i.kind)).toEqual(['task', 'block', 'update']);
    expect(r.items[0]).toMatchObject({ projectId: 'p-work', estimateMin: 120 });
    expect(r.items[1]).toMatchObject({ start: 780, end: 900, projectId: 'p-work', blockKind: 'focus' });
    expect(r.items[1]?.label).toContain('13:00–15:00 · Fix WABA');
    expect(r.items[2]).toMatchObject({ patch: { priority: 'high' }, prev: { priority: 'low' } });
  });

  test('tolerates code fences and surrounding prose', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify({ summary: 'ok', blocks: [blk({})] }) + '\n```';
    expect(parsePlan(text, stateWith(), clock).items).toHaveLength(1);
  });

  test('reports unreadable answers instead of throwing', () => {
    const r = parsePlan('sorry, no', stateWith(), clock);
    expect(r.items).toEqual([]);
    expect(r.dropped).toHaveLength(1);
  });

  test('drops a block that overlaps an existing block and says which', () => {
    const s = stateWith({ blocks: [block({ id: 'x', start: 14 * 60, end: 16 * 60, title: 'Dinner', source: 'google' })] });
    const r = plan({ blocks: [blk({ title: 'Gym' })] }, s);
    expect(r.items).toEqual([]);
    expect(r.dropped[0]).toBe('Skipped ‘Gym’ 13:00–15:00: overlaps Dinner.');
  });

  test('drops blocks that overlap each other but keeps the first', () => {
    const r = plan({ blocks: [blk({}), blk({ start: '14:00', end: '16:00', title: 'Other' })] });
    expect(r.items).toHaveLength(1);
    expect(r.dropped[0]).toContain('overlaps Fix WABA');
  });

  test('allows back-to-back blocks and the same time on another day', () => {
    const r = plan({ blocks: [blk({}), blk({ start: '15:00', end: '16:00', title: 'B' }), blk({ date: '2026-11-10', title: 'C' })] });
    expect(r.items).toHaveLength(3);
  });

  test('drops blocks outside the working day', () => {
    const r = plan({ blocks: [blk({ start: '06:00', end: '07:00' }), blk({ start: '19:00', end: '21:00' })] });
    expect(r.items).toEqual([]);
    expect(r.dropped.every((d) => d.includes('outside your working day'))).toBe(true);
  });

  test('drops a block before now on today but not on a later day', () => {
    const r = plan({ blocks: [blk({ start: '08:30', end: '09:00' }), blk({ date: '2026-11-10', start: '08:30', end: '09:00' })] });
    expect(r.items).toHaveLength(1);
    expect(r.dropped[0]).toContain('already past');
  });

  test('snaps times to 15 minutes and rejects end before start', () => {
    const r = plan({ blocks: [blk({ start: '13:07', end: '14:20' }), blk({ start: '16:00', end: '15:00', title: 'Back' })] });
    expect(r.items[0]).toMatchObject({ start: 13 * 60, end: 14 * 60 + 15 });
    expect(r.items).toHaveLength(1);
  });

  test('drops bad dates: past, beyond 60 days, malformed', () => {
    const r = plan({ blocks: [blk({ date: '2026-11-08' }), blk({ date: '2027-02-01' }), blk({ date: 'tomorrow' })] });
    expect(r.items).toEqual([]);
    expect(r.dropped).toHaveLength(3);
  });

  test('drops an unknown or finished taskId, and an unknown taskRef', () => {
    const s = stateWith({ tasks: [task({ id: 'done', done: true })] });
    const r = plan({
      blocks: [blk({ taskId: 'nope' }), blk({ taskId: 'done', start: '16:00', end: '17:00' }), blk({ taskRef: 'zz', start: '17:00', end: '18:00' })],
      taskUpdates: [{ taskId: 'nope', priority: 'high' }],
    }, s);
    expect(r.items).toEqual([]);
    expect(r.dropped).toHaveLength(4);
  });

  test('matches projects by name ignoring case and drops unknown or archived ones', () => {
    const s = stateWith();
    s.projects = [...s.projects, { id: 'p-old', name: 'Old', color: '#000', archived: true }];
    const r = plan({ newTasks: [{ title: 'A', project: 'PERSONAL' }, { title: 'B', project: 'Nope' }, { title: 'C', project: 'old' }] }, s);
    expect(r.items.map((i) => i.kind === 'task' && i.projectId)).toEqual(['p-personal', undefined, undefined]);
  });

  test('validates enums, estimates and titles', () => {
    const r = plan({
      newTasks: [{ title: 'ok', estimateMin: 5 }, { title: 'x', priority: 'urgent' }, { title: 'x', estimateMin: 4 }, { title: 'x', estimateMin: 500 }, { title: '  ' }, { title: 'y'.repeat(121) }],
      blocks: [blk({ kind: 'nap' })],
      taskUpdates: [],
    });
    expect(r.items).toHaveLength(1);
    expect(r.dropped).toHaveLength(6);
  });

  test('caps new tasks, blocks and updates at 25 each', () => {
    const s = stateWith({ tasks: Array.from({ length: 30 }, (_, i) => task({ id: `t${i}` })) });
    const r = plan({
      newTasks: Array.from({ length: 30 }, (_, i) => ({ title: `T${i}` })),
      blocks: Array.from({ length: 30 }, (_, i) => blk({ date: '2026-11-10', start: `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`, end: `${String(8 + Math.floor((i + 1) / 4)).padStart(2, '0')}:${String(((i + 1) % 4) * 15).padStart(2, '0')}`, title: `B${i}` })),
      taskUpdates: Array.from({ length: 30 }, (_, i) => ({ taskId: `t${i}`, priority: 'high' })),
    }, s);
    for (const kind of ['task', 'block', 'update']) expect(r.items.filter((i) => i.kind === kind)).toHaveLength(25);
    expect(r.dropped.filter((d) => d.includes('at most 25'))).toHaveLength(3);
  });

  test('drops an update that changes nothing', () => {
    const s = stateWith({ tasks: [task({ id: 'a', priority: 'high' })] });
    expect(plan({ taskUpdates: [{ taskId: 'a', priority: 'high' }] }, s).items).toEqual([]);
  });
});

describe('toActions', () => {
  const s = stateWith({ tasks: [task({ id: 'a', date: TODAY, priority: 'low', estimateMin: 20 })] });
  const parsed = plan({
    newTasks: [{ ref: 't1', title: 'Write brief', estimateMin: 30 }],
    blocks: [blk({ taskRef: 't1' }), blk({ start: '16:00', end: '17:00', title: 'Existing', taskId: 'a' })],
    taskUpdates: [{ taskId: 'a', priority: 'high', date: '2026-11-12' }],
  }, s);
  const all = parsed.items.map((i) => i.id);

  test('creates tasks, links blocks via taskRef and updates tasks', () => {
    const { actions, counts } = toActions(parsed.items, all, 'NOW');
    const next = reducer(s, { type: 'BATCH', actions });
    const created = next.tasks.find((t) => t.title === 'Write brief');
    expect(created).toMatchObject({ done: false, createdAt: 'NOW', estimateMin: 30 });
    expect(next.blocks.find((b) => b.title === 'Fix WABA')?.taskId).toBe(created?.id);
    expect(next.blocks.find((b) => b.title === 'Existing')?.taskId).toBe('a');
    expect(next.tasks.find((t) => t.id === 'a')).toMatchObject({ priority: 'high', date: '2026-11-12' });
    expect(counts).toEqual({ tasks: 1, blocks: 2, updates: 1 });
  });

  test('undo restores the previous state', () => {
    const { actions, undo } = toActions(parsed.items, all, 'NOW');
    const applied = reducer(s, { type: 'BATCH', actions });
    expect(applied).not.toEqual(s);
    expect(reducer(applied, { type: 'BATCH', actions: undo })).toEqual(s);
  });

  test('keeps the block but drops the link when its new task is not selected', () => {
    const ids = all.filter((id) => !id.startsWith('task-'));
    const next = reducer(s, { type: 'BATCH', actions: toActions(parsed.items, ids, 'NOW').actions });
    expect(next.tasks.find((t) => t.title === 'Write brief')).toBeUndefined();
    const b = next.blocks.find((x) => x.title === 'Fix WABA');
    expect(b).toBeDefined();
    expect(b?.taskId).toBeUndefined();
  });

  test('only applies what is selected', () => {
    const r = toActions(parsed.items, [], 'NOW');
    expect(r.actions).toEqual([]);
    expect(r.undo).toEqual([]);
  });

  test('describes what was applied', () => {
    expect(describeApplied({ tasks: 3, blocks: 4, updates: 0 })).toBe('Added 3 tasks and 4 blocks');
    expect(describeApplied({ tasks: 1, blocks: 0, updates: 2 })).toBe('Added 1 task, changed 2 tasks');
    expect(describeApplied({ tasks: 0, blocks: 0, updates: 1 })).toBe('Changed 1 task');
  });
});

describe('buildPlanRequest', () => {
  test('includes the working day, now, projects and the prompt', () => {
    const { system, user } = buildPlanRequest(stateWith(), { ...clock, prompt: ' Plan my afternoon ' });
    expect(system).toContain('Return only JSON');
    const ctx = JSON.parse(user.slice(user.indexOf('{'), user.indexOf('\n\nRequest:'))) as Record<string, unknown>;
    expect(ctx).toMatchObject({ today: { date: TODAY, weekday: 'Monday' }, now: '09:00', workingDay: { start: '08:00', end: '20:00' } });
    expect(user.endsWith('Request:\nPlan my afternoon')).toBe(true);
  });

  test('includes Google blocks for the next 7 days only, marked fixed', () => {
    const s = stateWith({
      blocks: [
        block({ id: 'g', title: 'Standup', source: 'google', date: '2026-11-12' }),
        block({ id: 'far', title: 'Later', date: '2026-11-16' }),
        block({ id: 'past', title: 'Earlier', date: '2026-11-08' }),
      ],
    });
    const { user } = buildPlanRequest(s, { ...clock, prompt: 'x' });
    expect(user).toContain('"title":"Standup"');
    expect(user).toContain('"fixed":true');
    expect(user).not.toContain('Later');
    expect(user).not.toContain('Earlier');
  });

  test('sends at most 80 open tasks and no done ones', () => {
    const tasks = [...Array.from({ length: 100 }, (_, i) => task({ id: `t${i}`, estimateMin: 15 })), task({ id: 'gone', done: true })];
    const { user } = buildPlanRequest(stateWith({ tasks }), { ...clock, prompt: 'x' });
    expect(user.match(/"id":"/g)).toHaveLength(80);
    expect(user).not.toContain('"gone"');
  });

  test('never contains an API key', () => {
    const { system, user } = buildPlanRequest(stateWith(), { ...clock, prompt: 'x' });
    expect(system + user).not.toMatch(/apiKey/i);
  });
});

describe('routines as fixed blocks', () => {
  const routine = { id: 'r1', title: 'Deep work', days: [1], start: 540, end: 660, kind: 'focus' as const, createdAt: '2026-11-01T00:00:00.000Z' };
  const s = stateWith({ routines: [routine] });
  test('buildPlanRequest lists instances as fixed blocks', () => {
    const { user } = buildPlanRequest(s, { ...clock, prompt: 'plan' });
    expect(user).toContain('"title":"Deep work","fixed":true');
    expect(user).toContain('"date":"2026-11-09"'); // the routine runs Mondays; the next one (the 16th) is past the 7-day window
    expect(user).not.toContain('"date":"2026-11-16"');
  });
  test('parsePlan drops a block that overlaps an instance', () => {
    const r = plan({ blocks: [blk({ start: '10:00', end: '11:00', title: 'Clash' })] }, s);
    expect(r.items).toEqual([]);
    expect(r.dropped.join(' ')).toContain('overlaps Deep work');
  });
});
