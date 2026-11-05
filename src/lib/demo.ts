import { addDays, startOfWeek } from './date';
import { emptyState } from './storage';
import type { AppState, DateKey, FocusSession, Task } from './types';

/** Sample data for `?demo=1`: three projects, a planned day and a week of history. */
export function demoState(today: DateKey): AppState {
  const base = emptyState();
  const at = (date: DateKey, h: number, m = 0) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
  const created = at(addDays(today, -7), 8);

  const task = (id: string, title: string, projectId: string | undefined, over: Partial<Task> = {}): Task => ({
    id, title, projectId, done: false, createdAt: created, ...over,
  });
  const tasks: Task[] = [
    task('t1', 'Finish chapter 3 outline', 'p-writing', { date: today, estimateMin: 90, priority: 'high' }),
    task('t2', 'Review Q4 budget', 'p-work', { date: today, estimateMin: 45, priority: 'med' }),
    task('t3', 'Book dentist appointment', 'p-health', { date: today, estimateMin: 10 }),
    task('t4', 'Walk 30 minutes', 'p-health', { date: today, estimateMin: 30 }),
    task('t5', 'Reply to editor', 'p-writing', { date: today, estimateMin: 15, done: true, doneAt: at(today, 8, 40) }),
    task('t6', 'Prepare team sync notes', 'p-work', { date: today, estimateMin: 30, done: true, doneAt: at(today, 8, 10) }),
    task('t7', 'Renew passport', undefined),
    task('t8', 'Read Deep Work notes', 'p-writing', { estimateMin: 40 }),
    task('t9', 'Plan weekend trip', undefined),
  ];

  const mins = [45, 60, 30, 75, 25, 50, 50]; // oldest day first, today last
  const projects = ['p-writing', 'p-work', 'p-writing', 'p-work', 'p-health', 'p-writing', 'p-writing'];
  const sessions: FocusSession[] = mins.map((minutes, i) => {
    const date = addDays(today, i - 6);
    const rating = i === 6 ? 3 : i === 5 ? 2 : i === 4 ? 1 : undefined; // three rated sessions
    return { id: `s${i + 1}`, startedAt: at(date, 9), date, minutes, projectId: projects[i], taskId: i === 6 ? 't1' : undefined, rating };
  });

  const habits = [
    { id: 'h1', name: 'Read 20 pages', color: '#1b6e66', createdAt: created },
    { id: 'h2', name: 'Walk 8k steps', color: '#3a7be0', createdAt: created },
    { id: 'h3', name: 'No phone before 9', color: '#8c8c88', createdAt: created },
  ];
  const habitLog: Record<DateKey, string[]> = {};
  for (let i = 27; i >= 0; i--) {
    const d = addDays(today, -i);
    const ids = [i % 4 !== 3 ? 'h1' : '', i % 3 !== 1 ? 'h2' : '', i % 5 < 2 ? 'h3' : ''].filter(Boolean);
    if (i === 0) ids.splice(0, ids.length, 'h1', 'h2');
    habitLog[d] = ids;
  }

  const lines = ['Draft the pitch deck', 'Ship the budget review', 'Interview prep', 'Write 1,000 words'];
  const days: AppState['days'] = {};
  for (let i = 4; i >= 1; i--) {
    // The three days before today were planned, so with today the planning streak reads 4 days.
    days[addDays(today, -i)] = { highlight: lines[4 - i], highlightDone: i !== 2, energy: 3 + (i % 3), plannedAt: i <= 3 ? at(addDays(today, -i), 8) : undefined };
  }
  days[today] = { highlight: 'Finish chapter 3 outline', highlightTaskId: 't1', highlightDone: false, plannedAt: at(today, 8) };

  const week = startOfWeek(today, base.settings.weekStartsOn);

  return {
    ...base,
    projects: [
      { id: 'p-writing', name: 'Writing', color: '#1b6e66', goalId: 'g-book' },
      { id: 'p-work', name: 'Work', color: '#3a7be0' },
      { id: 'p-health', name: 'Health', color: '#c27a1a', goalId: 'g-fit' },
    ],
    goals: [
      { id: 'g-book', title: 'Finish the book draft', why: 'Send the manuscript to my editor', targetDate: addDays(today, 120), status: 'active', createdAt: created },
      { id: 'g-fit', title: 'Get fitter', why: 'Energy for the long days', targetDate: addDays(today, 33), status: 'active', createdAt: created },
    ],
    reviews: {
      [week]: {
        plannedAt: at(week, 8),
        priorities: [
          { id: 'wp1', title: 'Outline chapters 3 and 4', goalId: 'g-book', done: true },
          { id: 'wp2', title: 'Walk or run three times', goalId: 'g-fit', done: false },
          { id: 'wp3', title: 'Close out the Q4 budget review', done: false },
        ],
      },
    },
    tasks,
    blocks: [
      { id: 'b1', date: today, start: 540, end: 630, title: 'Finish chapter 3 outline', kind: 'focus', taskId: 't1', projectId: 'p-writing' },
      { id: 'b2', date: today, start: 720, end: 780, title: 'Lunch with Sam', kind: 'meeting' },
      { id: 'b3', date: today, start: 840, end: 870, title: 'Review Q4 budget', kind: 'focus', taskId: 't2', projectId: 'p-work' },
      { id: 'b4', date: today, start: 1080, end: 1140, title: 'Evening walk', kind: 'personal' },
    ],
    sessions,
    habits,
    habitLog,
    days,
  };
}
