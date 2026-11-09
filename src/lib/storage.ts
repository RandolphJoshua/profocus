import type { AppState, Settings, Task } from './types';

export const STORAGE_KEY = 'profocus:v1';
export const SAVED_AT_KEY = 'profocus:savedAt';

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  dayStartHour: 7,
  dayEndHour: 22,
  weekStartsOn: 1,
  theme: 'system',
  sound: true,
};

export const PROJECT_COLORS = ['#e0603a', '#3a7be0', '#2f9e6e', '#c2410c', '#d4a017', '#e04a8a', '#4bb3c4', '#7a7a7a'];

/** First palette colour not already used, so new projects/habits stay distinguishable. */
export function nextColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return PROJECT_COLORS.find((c) => !taken.has(c)) ?? PROJECT_COLORS[used.length % PROJECT_COLORS.length] ?? '#7a7a7a';
}

export function emptyState(): AppState {
  return {
    version: 1,
    projects: [
      { id: 'p-work', name: 'Work', color: '#3a7be0' },
      { id: 'p-personal', name: 'Personal', color: '#2f9e6e' },
      { id: 'p-learning', name: 'Learning', color: '#c2410c' },
    ],
    goals: [],
    seasons: [],
    tasks: [],
    blocks: [],
    sessions: [],
    habits: [],
    habitLog: {},
    days: {},
    reviews: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const MONDAY_SEEN_CAP = 2000;

/** Keep only the known import fields on a task; anything else is dropped. */
function normalizeTask(t: unknown): unknown {
  if (!isRecord(t)) return t;
  const { source, externalId, ...rest } = t;
  const out: Record<string, unknown> = { ...rest };
  if (source === 'monday' && typeof externalId === 'string' && externalId) {
    out.source = 'monday';
    out.externalId = externalId;
  }
  return out as unknown as Task;
}

function normalizeSettings(raw: unknown): Settings {
  const { mondaySeen, ...rest } = isRecord(raw) ? (raw as Partial<Settings> & Record<string, unknown>) : ({} as Record<string, unknown>);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(rest as Partial<Settings>) };
  if (Array.isArray(mondaySeen)) {
    settings.mondaySeen = mondaySeen.filter((x): x is string => typeof x === 'string').slice(-MONDAY_SEEN_CAP);
  }
  return settings;
}

/**
 * Accept untrusted JSON (localStorage or an imported backup) and return a
 * well-formed state, filling any missing collections with defaults.
 */
export function normalizeState(raw: unknown): AppState {
  const base = emptyState();
  if (!isRecord(raw)) return base;
  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const rec = <T,>(v: unknown): Record<string, T> => (isRecord(v) ? (v as Record<string, T>) : {});
  return {
    version: 1,
    projects: arr(raw.projects, base.projects),
    goals: arr(raw.goals, []),
    seasons: arr(raw.seasons, []),
    tasks: arr<unknown>(raw.tasks, []).map(normalizeTask) as Task[],
    blocks: arr(raw.blocks, []),
    sessions: arr(raw.sessions, []),
    habits: arr(raw.habits, []),
    habitLog: rec(raw.habitLog),
    days: rec(raw.days),
    reviews: rec(raw.reviews),
    settings: normalizeSettings(raw.settings),
  };
}

export function loadState(storage: Pick<Storage, 'getItem'> = localStorage): AppState {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? normalizeState(JSON.parse(text)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function loadSavedAt(storage: Pick<Storage, 'getItem'> = localStorage): string | undefined {
  try {
    return storage.getItem(SAVED_AT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    storage.setItem(SAVED_AT_KEY, new Date().toISOString());
  } catch {
    // Storage full or blocked (private mode). The app keeps working in memory.
  }
}

export function uid(prefix = ''): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}
