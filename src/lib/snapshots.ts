import { normalizeState } from './storage';
import { isTouched } from './sync';
import type { AppState } from './types';

/** Local safety copies taken just before something replaces the whole state (backup import, reset, cloud pull). */
export const SNAPSHOT_KEY = 'profocus:snapshots';
const MAX_SNAPSHOTS = 3;

export interface Snapshot {
  at: string;
  reason: string;
  counts: { tasks: number; blocks: number; routines: number; habits: number };
  state: AppState;
}

const countsOf = (s: AppState): Snapshot['counts'] => ({ tasks: s.tasks.length, blocks: s.blocks.length, routines: s.routines?.length ?? 0, habits: s.habits.length });

export function listSnapshots(): Snapshot[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((x): Snapshot[] => {
      const o = x as Partial<Snapshot> | null;
      if (!o || typeof o.at !== 'string' || typeof o.reason !== 'string' || !o.state) return [];
      const state = normalizeState(o.state);
      return [{ at: o.at, reason: o.reason, counts: countsOf(state), state }];
    });
  } catch {
    return [];
  }
}

/** Save a copy of `state` (newest first, last three kept). Empty states are not worth keeping. */
export function saveSnapshot(reason: string, state: AppState, at: string = new Date().toISOString()): void {
  if (!isTouched(state)) return;
  const next = [{ at, reason, counts: countsOf(state), state }, ...listSnapshots()].slice(0, MAX_SNAPSHOTS);
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
  } catch {
    // Storage full: keep only the newest copy rather than none.
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next.slice(0, 1)));
    } catch {
      /* storage unavailable */
    }
  }
}
