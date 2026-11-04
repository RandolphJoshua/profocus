import type { AppState, Settings } from './types';

export const STORAGE_KEY = 'profocus:v1';

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

export const PROJECT_COLORS = ['#e0603a', '#3a7be0', '#2f9e6e', '#9b5de5', '#d4a017', '#e04a8a', '#4bb3c4', '#7a7a7a'];

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
      { id: 'p-learning', name: 'Learning', color: '#9b5de5' },
    ],
    goals: [],
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
    tasks: arr(raw.tasks, []),
    blocks: arr(raw.blocks, []),
    sessions: arr(raw.sessions, []),
    habits: arr(raw.habits, []),
    habitLog: rec(raw.habitLog),
    days: rec(raw.days),
    reviews: rec(raw.reviews),
    settings: { ...DEFAULT_SETTINGS, ...(isRecord(raw.settings) ? (raw.settings as Partial<Settings>) : {}) },
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

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
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
