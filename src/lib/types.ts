/** A local calendar date in `YYYY-MM-DD` form. */
export type DateKey = string;
export type ID = string;

export type Priority = 'high' | 'med' | 'low';

export interface Project {
  id: ID;
  name: string;
  color: string;
  archived?: boolean;
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
}

export interface WeeklyReview {
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
