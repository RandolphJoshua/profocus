import { fromKey, isValidKey } from './date';
import type { AppState, BlockKind, DateKey, ID, Routine, TimeBlock } from './types';

export const ROUTINE_ID_PREFIX = 'rt:';
export const NOTES_MAX = 2000;
export const TITLE_MAX = 120;
export const SKIPS_CAP = 1000;
const MIN_LENGTH = 5;
const MINUTES_PER_DAY = 24 * 60;
const BLOCK_KINDS: readonly BlockKind[] = ['focus', 'meeting', 'personal', 'break'];

export const skipKey = (routineId: ID, date: DateKey): string => `${routineId}|${date}`;
export const instanceId = (routineId: ID, date: DateKey): string => `${ROUTINE_ID_PREFIX}${routineId}:${date}`;

/** 0 = Sunday … 6 = Saturday, from the local date. */
export const weekdayOf = (date: DateKey): number => fromKey(date).getDay();

/** Does `routine` run on `date`? Paused, weekday, from/until and skips all count. */
export function routineApplies(routine: Routine, date: DateKey, skips: readonly string[]): boolean {
  if (routine.paused) return false;
  if (!routine.days.includes(weekdayOf(date))) return false;
  if (routine.from && date < routine.from) return false;
  if (routine.until && date > routine.until) return false;
  return !skips.includes(skipKey(routine.id, date));
}

/** Virtual blocks for the routines that run on `date`. They are never stored in `state.blocks`. */
export function routineInstances(state: Pick<AppState, 'routines' | 'routineSkips'>, date: DateKey): TimeBlock[] {
  return state.routines
    .filter((r) => routineApplies(r, date, state.routineSkips))
    .map((r) => ({
      id: instanceId(r.id, date),
      routineId: r.id,
      date,
      start: r.start,
      end: r.end,
      title: r.title,
      kind: r.kind,
      ...(r.notes ? { notes: r.notes } : {}),
      ...(r.projectId ? { projectId: r.projectId } : {}),
    }));
}

/** The real blocks of `date` plus the routine instances, sorted by start. */
export function blocksForDay(state: Pick<AppState, 'blocks' | 'routines' | 'routineSkips'>, date: DateKey): TimeBlock[] {
  return [...state.blocks.filter((b) => b.date === date), ...routineInstances(state, date)]
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export type DayPart = 'Morning' | 'Afternoon' | 'Evening';

/** Morning is before 12:00, afternoon before 17:00, evening after. */
export function dayPartOf(start: number): DayPart {
  return start < 12 * 60 ? 'Morning' : start < 17 * 60 ? 'Afternoon' : 'Evening';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMinute = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A routine from untrusted JSON, or undefined when any field is invalid. */
export function normalizeRoutine(raw: unknown): Routine | undefined {
  if (!isRecord(raw)) return undefined;
  const { id, title, days, start, end, kind, notes, projectId, from, until, paused, createdAt } = raw;
  if (typeof id !== 'string' || !id || id.includes('|')) return undefined;
  const name = typeof title === 'string' ? title.trim() : '';
  if (name.length < 1 || name.length > TITLE_MAX) return undefined;
  if (!Array.isArray(days) || days.length === 0 || !days.every((d) => isMinute(d) && d >= 0 && d <= 6)) return undefined;
  if (!isMinute(start) || start < 0 || start > MINUTES_PER_DAY - 1) return undefined;
  if (!isMinute(end) || end < start + MIN_LENGTH || end > MINUTES_PER_DAY) return undefined;
  if (typeof kind !== 'string' || !BLOCK_KINDS.includes(kind as BlockKind)) return undefined;
  if (from !== undefined && !(typeof from === 'string' && isValidKey(from))) return undefined;
  if (until !== undefined && !(typeof until === 'string' && isValidKey(until))) return undefined;
  const text = typeof notes === 'string' ? notes.slice(0, NOTES_MAX) : '';
  return {
    id,
    title: name,
    days: [...new Set(days as number[])].sort((a, b) => a - b),
    start,
    end,
    kind: kind as BlockKind,
    ...(text ? { notes: text } : {}),
    ...(typeof projectId === 'string' && projectId ? { projectId } : {}),
    ...(typeof from === 'string' ? { from } : {}),
    ...(typeof until === 'string' ? { until } : {}),
    ...(paused === true ? { paused: true } : {}),
    createdAt: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString(),
  };
}

/** Valid routines only, first of each id; the rest are dropped. */
export function normalizeRoutines(raw: unknown): Routine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ID>();
  const out: Routine[] = [];
  for (const item of raw) {
    const r = normalizeRoutine(item);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Blocks from untrusted JSON: virtual routine instances are dropped, `routineId` stripped, notes capped. */
export function normalizeBlocks(raw: unknown): TimeBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: TimeBlock[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      out.push(item as TimeBlock);
      continue;
    }
    if (typeof item.id === 'string' && item.id.startsWith(ROUTINE_ID_PREFIX)) continue;
    const { routineId: _routineId, notes, ...rest } = item;
    const block = rest as unknown as TimeBlock;
    out.push(typeof notes === 'string' && notes ? { ...block, notes: notes.slice(0, NOTES_MAX) } : block);
  }
  return out;
}

/** Skip entries as a capped string list. */
export function normalizeSkips(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(-SKIPS_CAP) : [];
}
