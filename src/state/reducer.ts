import type { ParsedTask } from '../lib/parse';
import { nextColor, uid } from '../lib/storage';
import type {
  AppState, DateKey, Goal, DayPlan, FocusSession, Habit, ID, Project, Season, Settings, Task, TimeBlock, WeekPriority, WeeklyReview,
} from '../lib/types';

export type Action =
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; id: ID; patch: Partial<Task> }
  | { type: 'TOGGLE_TASK'; id: ID; now: string }
  | { type: 'DELETE_TASK'; id: ID }
  | { type: 'ROLL_OVER'; to: DateKey }
  | { type: 'ADD_PROJECT'; project: Project }
  | { type: 'UPDATE_PROJECT'; id: ID; patch: Partial<Project> }
  | { type: 'ADD_GOAL'; goal: Goal }
  | { type: 'UPDATE_GOAL'; id: ID; patch: Partial<Goal> }
  | { type: 'DELETE_GOAL'; id: ID }
  | { type: 'ADD_SEASON'; season: Season }
  | { type: 'UPDATE_SEASON'; id: ID; patch: Partial<Season> }
  | { type: 'DELETE_SEASON'; id: ID }
  | { type: 'SET_WEEK_PRIORITIES'; week: DateKey; priorities: WeekPriority[] }
  | { type: 'TOGGLE_WEEK_PRIORITY'; week: DateKey; id: ID }
  | { type: 'RATE_SESSION'; id: ID; rating: 1 | 2 | 3 }
  | { type: 'ADD_BLOCK'; block: TimeBlock }
  | { type: 'UPDATE_BLOCK'; id: ID; patch: Partial<TimeBlock> }
  | { type: 'DELETE_BLOCK'; id: ID }
  | { type: 'SET_EXTERNAL_BLOCKS'; source: 'google'; range: { from: DateKey; to: DateKey }; blocks: TimeBlock[] }
  | { type: 'LOG_SESSION'; session: FocusSession }
  | { type: 'ADD_HABIT'; habit: Habit }
  | { type: 'UPDATE_HABIT'; id: ID; patch: Partial<Habit> }
  | { type: 'DELETE_HABIT'; id: ID }
  | { type: 'TOGGLE_HABIT'; id: ID; date: DateKey }
  | { type: 'SET_DAY'; date: DateKey; patch: Partial<DayPlan> }
  | { type: 'SET_REVIEW'; week: DateKey; patch: Partial<WeeklyReview> }
  | { type: 'SET_SETTINGS'; patch: Partial<Settings> }
  | { type: 'REPLACE_STATE'; state: AppState }
  | { type: 'BATCH'; actions: Action[] };

const patchById = <T extends { id: ID }>(list: T[], id: ID, patch: Partial<T>): T[] =>
  list.map((x) => (x.id === id ? { ...x, ...patch, id } : x));

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.task] };
    case 'UPDATE_TASK':
      return { ...state, tasks: patchById(state.tasks, action.id, action.patch) };
    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, done: !t.done, doneAt: t.done ? undefined : action.now } : t,
        ),
      };
    case 'DELETE_TASK': {
      const days: Record<DateKey, DayPlan> = {};
      for (const [k, d] of Object.entries(state.days)) {
        days[k] = d.highlightTaskId === action.id ? { ...d, highlightTaskId: undefined } : d;
      }
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        blocks: state.blocks.map((b) => (b.taskId === action.id ? { ...b, taskId: undefined } : b)),
        days,
      };
    }
    case 'ROLL_OVER':
      return {
        ...state,
        tasks: state.tasks.map((t) => (!t.done && t.date && t.date < action.to ? { ...t, date: action.to } : t)),
      };
    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.project] };
    case 'UPDATE_PROJECT':
      return { ...state, projects: patchById(state.projects, action.id, action.patch) };
    case 'ADD_GOAL':
      return { ...state, goals: [...state.goals, action.goal] };
    case 'UPDATE_GOAL':
      return { ...state, goals: patchById(state.goals, action.id, action.patch) };
    case 'DELETE_GOAL': {
      const reviews: Record<DateKey, WeeklyReview> = {};
      for (const [k, r] of Object.entries(state.reviews)) {
        reviews[k] = r.priorities
          ? { ...r, priorities: r.priorities.map((p) => (p.goalId === action.id ? { ...p, goalId: undefined } : p)) }
          : r;
      }
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== action.id),
        seasons: state.seasons.map((s) => (s.goalIds.includes(action.id) ? { ...s, goalIds: s.goalIds.filter((i) => i !== action.id) } : s)),
        projects: state.projects.map((p) => (p.goalId === action.id ? { ...p, goalId: undefined } : p)),
        reviews,
      };
    }
    case 'ADD_SEASON':
      return { ...state, seasons: [...state.seasons, action.season] };
    case 'UPDATE_SEASON':
      return { ...state, seasons: patchById(state.seasons, action.id, action.patch) };
    case 'DELETE_SEASON':
      return { ...state, seasons: state.seasons.filter((s) => s.id !== action.id) };
    case 'SET_WEEK_PRIORITIES':
      return {
        ...state,
        reviews: {
          ...state.reviews,
          [action.week]: { ...state.reviews[action.week], priorities: action.priorities.slice(0, 3) },
        },
      };
    case 'TOGGLE_WEEK_PRIORITY': {
      const review = state.reviews[action.week];
      if (!review?.priorities) return state;
      const priorities = review.priorities.map((p) => (p.id === action.id ? { ...p, done: !p.done } : p));
      return { ...state, reviews: { ...state.reviews, [action.week]: { ...review, priorities } } };
    }
    case 'RATE_SESSION':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, rating: action.rating } : s)) };
    case 'ADD_BLOCK':
      return { ...state, blocks: [...state.blocks, action.block] };
    case 'UPDATE_BLOCK':
      return { ...state, blocks: patchById(state.blocks, action.id, action.patch) };
    case 'DELETE_BLOCK':
      return { ...state, blocks: state.blocks.filter((b) => b.id !== action.id) };
    case 'SET_EXTERNAL_BLOCKS': {
      const incoming = new Set(action.blocks.map((b) => b.externalId));
      const kept = state.blocks.filter(
        (b) => b.source !== action.source || !(b.date >= action.range.from && b.date <= action.range.to || incoming.has(b.externalId)),
      );
      return { ...state, blocks: [...kept, ...action.blocks] };
    }
    case 'LOG_SESSION':
      return { ...state, sessions: [...state.sessions, action.session] };
    case 'ADD_HABIT':
      return { ...state, habits: [...state.habits, action.habit] };
    case 'UPDATE_HABIT':
      return { ...state, habits: patchById(state.habits, action.id, action.patch) };
    case 'DELETE_HABIT': {
      const habitLog: Record<DateKey, ID[]> = {};
      for (const [k, ids] of Object.entries(state.habitLog)) habitLog[k] = ids.filter((i) => i !== action.id);
      return { ...state, habits: state.habits.filter((h) => h.id !== action.id), habitLog };
    }
    case 'TOGGLE_HABIT': {
      const cur = state.habitLog[action.date] ?? [];
      const next = cur.includes(action.id) ? cur.filter((i) => i !== action.id) : [...cur, action.id];
      return { ...state, habitLog: { ...state.habitLog, [action.date]: next } };
    }
    case 'SET_DAY':
      return { ...state, days: { ...state.days, [action.date]: { ...state.days[action.date], ...action.patch } } };
    case 'SET_REVIEW':
      return {
        ...state,
        reviews: { ...state.reviews, [action.week]: { ...state.reviews[action.week], ...action.patch } },
      };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'REPLACE_STATE':
      return action.state;
    case 'BATCH':
      return action.actions.reduce(reducer, state);
  }
}

/** Next free [start,end) slot of `minutes` on `date` at or after `from`, within day hours, snapped to 15 min. */
export function nextFreeSlot(
  blocks: TimeBlock[], date: DateKey, from: number, minutes: number, dayStart: number, dayEnd: number,
): { start: number; end: number } | null {
  const busy = blocks.filter((b) => b.date === date).sort((a, b) => a.start - b.start);
  let start = Math.ceil(Math.max(from, dayStart) / 15) * 15;
  for (const b of busy) {
    if (b.end <= start) continue;
    if (b.start >= start + minutes) break;
    start = Math.ceil(b.end / 15) * 15;
  }
  return start + minutes <= dayEnd ? { start, end: start + minutes } : null;
}

export function findProjectByName(projects: Project[], name: string): Project | undefined {
  const n = name.trim().toLowerCase();
  return projects.find((p) => p.name.toLowerCase() === n)
    ?? projects.find((p) => p.name.toLowerCase().startsWith(n));
}

/**
 * Turn a parsed quick-add line into reducer actions: create the project if it
 * doesn't exist, create the task, and time-block it when a start time was given.
 */
export function quickAddActions(
  parsed: ParsedTask,
  state: AppState,
  opts: { defaultDate?: DateKey; now: string; makeId?: (prefix: string) => string },
): Action[] {
  const makeId = opts.makeId ?? uid;
  const actions: Action[] = [];
  if (!parsed.title) return actions;

  let projectId: ID | undefined;
  if (parsed.project) {
    const existing = findProjectByName(state.projects, parsed.project);
    if (existing) {
      projectId = existing.id;
    } else {
      projectId = makeId('p-');
      const name = parsed.project.charAt(0).toUpperCase() + parsed.project.slice(1);
      const color = nextColor(state.projects.filter((p) => !p.archived).map((p) => p.color));
      actions.push({ type: 'ADD_PROJECT', project: { id: projectId, name, color } });
    }
  }

  const date = parsed.someday ? undefined : parsed.date ?? opts.defaultDate;
  const task: Task = {
    id: makeId('t-'),
    title: parsed.title,
    projectId,
    priority: parsed.priority,
    estimateMin: parsed.estimateMin,
    date,
    done: false,
    createdAt: opts.now,
  };
  actions.push({ type: 'ADD_TASK', task });

  if (parsed.startMin !== undefined && date) {
    const length = parsed.estimateMin ?? 30;
    actions.push({
      type: 'ADD_BLOCK',
      block: {
        id: makeId('b-'),
        date,
        start: parsed.startMin,
        end: Math.min(parsed.startMin + length, 24 * 60),
        title: parsed.title,
        kind: 'focus',
        taskId: task.id,
        projectId,
      },
    });
  }
  return actions;
}
