import type { AppState } from './types';

export type SyncChoice = 'remote' | 'local' | 'ask';

/** True when the state holds any user data (tasks, blocks, sessions, habits or goals). */
export function isTouched(state: AppState): boolean {
  return (
    state.tasks.length > 0 ||
    state.blocks.length > 0 ||
    state.sessions.length > 0 ||
    state.habits.length > 0 ||
    state.goals.length > 0
  );
}

/** Decide which copy wins when a user signs in. `local` means upload this device's data. */
export function chooseSource(args: {
  localTouched: boolean;
  localSavedAt?: string;
  remote?: { updatedAt: string; touched: boolean };
}): SyncChoice {
  const { localTouched, remote } = args;
  if (!remote || !remote.touched) return 'local';
  if (!localTouched) return 'remote';
  return 'ask';
}
