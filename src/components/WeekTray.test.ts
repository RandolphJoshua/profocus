import type { Task } from '../lib/types';
import { isSuggested } from './WeekTray';

const task = (patch: Partial<Task>): Task => ({ id: 't', title: 'T', done: false, createdAt: '', ...patch });

describe('isSuggested', () => {
  const week = ['2026-11-09', '2026-11-15', '2026-11-10'] as const;
  it('suggests overdue, due-this-week and high-priority tasks', () => {
    expect(isSuggested(task({ date: '2026-11-02' }), ...week)).toBe(true);
    expect(isSuggested(task({ date: '2026-11-13' }), ...week)).toBe(true);
    expect(isSuggested(task({ priority: 'high' }), ...week)).toBe(true);
  });
  it('leaves undated or later, non-urgent tasks to Inbox and All', () => {
    expect(isSuggested(task({}), ...week)).toBe(false);
    expect(isSuggested(task({ date: '2026-11-20', priority: 'med' }), ...week)).toBe(false);
  });
});
