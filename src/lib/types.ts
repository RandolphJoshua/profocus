/** A local calendar date in `YYYY-MM-DD` form. */
export type DateKey = string;
export type ID = string;

export type Priority = 'high' | 'med' | 'low';

export interface Project {
  id: ID;
  name: string;
  color: string;
  archived?: boolean;
  goalId?: ID;
}

export interface Goal {
  id: ID;
  title: string;
  /** One line: why this matters. */
  why?: string;
  targetDate?: DateKey;
  status: 'active' | 'done' | 'paused';
  createdAt: string;
  doneAt?: string;
}

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  projectId?: ID;
  priority?: Priority;
  /** Estimated effort in minutes. */
  estimateMin?: number;
  /** Day the task is planned for. Undefined = "someday" / inbox. */
  date?: DateKey;
  done: boolean;
  doneAt?: string;
  createdAt: string;
}

export type BlockKind = 'focus' | 'meeting' | 'personal' | 'break';

export interface TimeBlock {
  id: ID;
  date: DateKey;
  /** Minutes from local midnight. */
  start: number;
  end: number;
  title: string;
  kind: BlockKind;
  taskId?: ID;
  projectId?: ID;
}

export interface FocusSession {
  id: ID;
  startedAt: string;
  date: DateKey;
  minutes: number;
  taskId?: ID;
  projectId?: ID;
  /** 1 rough, 2 ok, 3 flow. */
  rating?: 1 | 2 | 3;
  intention?: string;
}

export interface Habit {
  id: ID;
  name: string;
  color: string;
  createdAt: string;
  archived?: boolean;
}

export interface DayPlan {
  highlight?: string;
  highlightTaskId?: ID;
  highlightDone?: boolean;
  /** 1 (drained) – 5 (energised). */
  energy?: number;
  shutdownNote?: string;
  shutdownDone?: boolean;
  /** ISO time the "Plan my day" ritual finished. */
  plannedAt?: string;
  /** Focus-mode sentence: "I will … by …". */
  intention?: string;
}

export interface WeekPriority {
  id: ID;
  title: string;
  goalId?: ID;
  done: boolean;
}

export interface WeeklyReview {
  priorities?: WeekPriority[];
  /** ISO time the "Plan my week" ritual finished. */
  plannedAt?: string;
  wins?: string;
  lessons?: string;
  nextFocus?: string;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** Focus sessions before a long break. */
  longBreakEvery: number;
  dayStartHour: number;
  dayEndHour: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
  theme: Theme;
  sound: boolean;
}

export interface AppState {
  version: 1;
  projects: Project[];
  goals: Goal[];
  tasks: Task[];
  blocks: TimeBlock[];
  sessions: FocusSession[];
  habits: Habit[];
  /** date -> ids of habits completed that day */
  habitLog: Record<DateKey, ID[]>;
  days: Record<DateKey, DayPlan>;
  /** keyed by the week's first day */
  reviews: Record<DateKey, WeeklyReview>;
  settings: Settings;
}
