import { addDays, fromKey, weekDays } from './date';
import { nextFreeSlot } from '../state/reducer';
import type { AppState, DateKey, FocusSession, ID, Task, TimeBlock } from './types';

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

export interface DayScore {
  date: DateKey;
  planned: boolean;
  highlightSet: boolean;
  highlightDone: boolean;
  focusMin: number;
  blockedMin: number;
  habitsDone: number;
  habitsTotal: number;
  tasksDone: number;
  tasksPlanned: number;
  score: number;
}

/**
 * score = 40*highlight + 30*focus + 15*habits + 15*tasks, rounded, where
 * highlight = 1 if the highlight is done (0 if unset or open);
 * focus     = min(1, focusMin / max(blockedMin, 60)), i.e. against the plan, or an hour if nothing was blocked;
 * habits    = habitsDone / habitsTotal (1 if no habits);
 * tasks     = tasksDone / tasksPlanned (1 if none planned for the day).
 */
export function dayScore(state: AppState, date: DateKey): DayScore {
  const plan = state.days[date];
  const focusMin = focusMinutesOn(state.sessions, date);
  const blockedMin = state.blocks
    .filter((b) => b.date === date && b.kind === 'focus')
    .reduce((sum, b) => sum + (b.end - b.start), 0);
  const habits = state.habits.filter((h) => !h.archived && h.createdAt.slice(0, 10) <= date);
  const habitsDone = habits.filter((h) => state.habitLog[date]?.includes(h.id)).length;
  const planned = state.tasks.filter((t) => t.date === date);
  const tasksDone = planned.filter((t) => t.done).length;
  const highlightSet = !!plan?.highlight;
  const highlightDone = highlightSet && !!plan?.highlightDone;

  const focus = Math.min(1, focusMin / Math.max(blockedMin, 60));
  const habitRatio = habits.length ? habitsDone / habits.length : 1;
  const taskRatio = planned.length ? tasksDone / planned.length : 1;
  const score = Math.round(40 * (highlightDone ? 1 : 0) + 30 * focus + 15 * habitRatio + 15 * taskRatio);

  return {
    date,
    planned: !!plan?.plannedAt,
    highlightSet,
    highlightDone,
    focusMin,
    blockedMin,
    habitsDone,
    habitsTotal: habits.length,
    tasksDone,
    tasksPlanned: planned.length,
    score,
  };
}

/** Consecutive days ending today (or yesterday if today isn't planned yet) with `plannedAt` set. */
export function plannedStreak(state: AppState, today: DateKey): number {
  const plannedOn = (d: DateKey) => !!state.days[d]?.plannedAt;
  let cursor = plannedOn(today) ? today : addDays(today, -1);
  let streak = 0;
  while (plannedOn(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function weekScores(state: AppState, weekStart: DateKey, today: DateKey): DayScore[] {
  return weekDays(weekStart).map((date) =>
    date <= today
      ? dayScore(state, date)
      : {
          date, planned: false, highlightSet: false, highlightDone: false, focusMin: 0, blockedMin: 0,
          habitsDone: 0, habitsTotal: 0, tasksDone: 0, tasksPlanned: 0, score: 0,
        },
  );
}

export interface GoalProgress {
  goalId: ID;
  focusMin30d: number;
  tasksDone: number;
  tasksOpen: number;
  weeksPrioritised: number;
  projects: ID[];
}

export function goalProgress(state: AppState, goalId: ID, today: DateKey): GoalProgress {
  const projects = state.projects.filter((p) => p.goalId === goalId).map((p) => p.id);
  const inGoal = new Set(projects);
  const from = addDays(today, -29);
  let focusMin30d = 0;
  for (const s of state.sessions) {
    if (s.date < from || s.date > today) continue;
    const pid = s.projectId ?? state.tasks.find((t) => t.id === s.taskId)?.projectId;
    if (pid && inGoal.has(pid)) focusMin30d += s.minutes;
  }
  const tasks = state.tasks.filter((t) => t.projectId && inGoal.has(t.projectId));
  const tasksDone = tasks.filter((t) => t.done).length;
  const weeksPrioritised = Object.values(state.reviews)
    .reduce((n, r) => n + (r.priorities?.some((p) => p.goalId === goalId) ? 1 : 0), 0);
  return { goalId, focusMin30d, tasksDone, tasksOpen: tasks.length - tasksDone, weeksPrioritised, projects };
}

export type Trajectory = 'on-track' | 'adjust' | 'off-track' | 'no-date';

export interface GoalTrajectory {
  dayOf: number;
  daysTotal: number;
  daysLeft: number;
  /** 0–1, how far through the goal's window today is. */
  expected: number;
  /** 0–1, share of the goal's tasks that are done. */
  actual: number;
  status: Trajectory;
}

const ON_TRACK_SLACK = 0.1;
const ADJUST_SLACK = 0.25;
const EPSILON = 1e-9;

const daysBetween = (from: DateKey, to: DateKey) =>
  Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86_400_000);

/**
 * Is the goal's task completion keeping pace with the calendar? `expected` is the share of the window
 * (created -> target date) that has elapsed, `actual` the share of tasks done. Within 0.1 behind is on track,
 * within 0.25 behind needs adjusting, beyond that is off track. Done goals read as on track at 100%.
 */
export function goalTrajectory(state: AppState, goalId: ID, today: DateKey): GoalTrajectory {
  const goal = state.goals.find((g) => g.id === goalId);
  const { tasksDone, tasksOpen } = goalProgress(state, goalId, today);
  const share = tasksDone + tasksOpen ? tasksDone / (tasksDone + tasksOpen) : 0;
  if (!goal?.targetDate) return { dayOf: 0, daysTotal: 0, daysLeft: 0, expected: 0, actual: share, status: 'no-date' };

  const created = goal.createdAt.slice(0, 10);
  const daysTotal = Math.max(1, daysBetween(created, goal.targetDate));
  const elapsed = Math.max(0, daysBetween(created, today));
  const dayOf = Math.min(daysTotal, elapsed + 1);
  const daysLeft = Math.max(0, daysTotal - elapsed);
  const expected = dayOf / daysTotal;
  if (goal.status === 'done') return { dayOf, daysTotal, daysLeft, expected, actual: 1, status: 'on-track' };

  const status: Trajectory = share >= expected - ON_TRACK_SLACK - EPSILON ? 'on-track'
    : share >= expected - ADJUST_SLACK - EPSILON ? 'adjust' : 'off-track';
  return { dayOf, daysTotal, daysLeft, expected, actual: share, status };
}

const DEFAULT_TASK_MINUTES = 30;

/**
 * Chained placements for open tasks that have no block on `date` yet. `tasks` is taken in the order given
 * (callers sort by priority); each placed task counts as busy for the next. Tasks that don't fit are left out.
 */
export function planDay(
  blocks: TimeBlock[], tasks: Task[], date: DateKey, from: number, dayStart: number, dayEnd: number,
): { taskId: ID; start: number; end: number }[] {
  const scheduled = new Set(blocks.filter((b) => b.date === date && b.taskId).map((b) => b.taskId));
  let busy = blocks;
  const out: { taskId: ID; start: number; end: number }[] = [];
  for (const t of tasks) {
    if (t.done || scheduled.has(t.id)) continue;
    const slot = nextFreeSlot(busy, date, from, t.estimateMin ?? DEFAULT_TASK_MINUTES, dayStart, dayEnd);
    if (!slot) continue;
    out.push({ taskId: t.id, ...slot });
    busy = [...busy, { id: `plan-${t.id}`, date, start: slot.start, end: slot.end, title: t.title, kind: 'focus' }];
  }
  return out;
}

const RATING_VALUE: Record<1 | 2 | 3, number> = { 1: 0, 2: 0.5, 3: 1 };

/** Mean of rated sessions on `days`, ratings mapped 1 -> 0, 2 -> 0.5, 3 -> 1, as a 0–100 integer (null if none rated). */
export function focusQuality(sessions: FocusSession[], days: DateKey[]): { rated: number; quality: number | null } {
  const inRange = new Set(days);
  const ratings = sessions.filter((s) => inRange.has(s.date) && s.rating).map((s) => RATING_VALUE[s.rating!]);
  if (!ratings.length) return { rated: 0, quality: null };
  return { rated: ratings.length, quality: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) };
}
