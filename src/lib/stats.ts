import { addDays, weekDays } from './date';
import type { AppState, DateKey, FocusSession, ID } from './types';

export function focusMinutesOn(sessions: FocusSession[], date: DateKey): number {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.minutes, 0);
}

/** Consecutive days (ending today, or yesterday if today isn't done yet) the habit was completed. */
export function habitStreak(habitLog: Record<DateKey, ID[]>, habitId: ID, today: DateKey): number {
  const doneOn = (d: DateKey) => habitLog[d]?.includes(habitId) ?? false;
  let cursor = doneOn(today) ? today : addDays(today, -1);
  let streak = 0;
  while (doneOn(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface ProjectMinutes {
  projectId: ID | undefined;
  minutes: number;
}

export interface WeekStats {
  days: DateKey[];
  focusByDay: number[];
  focusTotal: number;
  focusByProject: ProjectMinutes[];
  tasksCompleted: number;
  highlightsDone: number;
  highlightsSet: number;
  /** 0–1, share of possible habit check-ins completed this week (up to `today`). */
  habitRate: number;
}

export function weekStats(state: AppState, weekStart: DateKey, today: DateKey): WeekStats {
  const days = weekDays(weekStart);
  const inWeek = new Set(days);

  const focusByDay = days.map((d) => focusMinutesOn(state.sessions, d));
  const byProject = new Map<ID | undefined, number>();
  for (const s of state.sessions) {
    if (!inWeek.has(s.date)) continue;
    const pid = s.projectId ?? state.tasks.find((t) => t.id === s.taskId)?.projectId;
    byProject.set(pid, (byProject.get(pid) ?? 0) + s.minutes);
  }

  const tasksCompleted = state.tasks.filter(
    (t) => t.done && t.doneAt && inWeek.has(t.doneAt.slice(0, 10)),
  ).length;

  let highlightsSet = 0;
  let highlightsDone = 0;
  for (const d of days) {
    const plan = state.days[d];
    if (plan?.highlight) highlightsSet += 1;
    if (plan?.highlight && plan.highlightDone) highlightsDone += 1;
  }

  const activeHabits = state.habits.filter((h) => !h.archived);
  const elapsed = days.filter((d) => d <= today);
  let possible = 0;
  let hits = 0;
  for (const d of elapsed) {
    for (const h of activeHabits) {
      if (h.createdAt.slice(0, 10) > d) continue;
      possible += 1;
      if (state.habitLog[d]?.includes(h.id)) hits += 1;
    }
  }

  return {
    days,
    focusByDay,
    focusTotal: focusByDay.reduce((a, b) => a + b, 0),
    focusByProject: [...byProject.entries()]
      .map(([projectId, minutes]) => ({ projectId, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    tasksCompleted,
    highlightsDone,
    highlightsSet,
    habitRate: possible ? hits / possible : 0,
  };
}
