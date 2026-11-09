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

/** What this device last agreed with the cloud: whose account, the row's updated_at, and a hash of the state. */
export interface SyncLink {
  userId: string;
  at: string;
  hash: string;
}

export const SYNC_LINK_KEY = 'profocus:sync-link';

export function loadSyncLink(): SyncLink | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(SYNC_LINK_KEY) ?? 'null') as Partial<SyncLink> | null;
    if (raw && typeof raw.userId === 'string' && typeof raw.at === 'string' && typeof raw.hash === 'string') {
      return { userId: raw.userId, at: raw.at, hash: raw.hash };
    }
  } catch {
    /* unreadable: treat as never linked */
  }
  return undefined;
}

export function saveSyncLink(link: SyncLink | null): void {
  try {
    if (link) localStorage.setItem(SYNC_LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(SYNC_LINK_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** A short content fingerprint (djb2 over the JSON), enough to tell "unchanged since the last sync". */
export function stateHash(state: AppState): string {
  // Google events are re-imported on every device, so they do not count as an edit.
  const s = JSON.stringify({ ...state, blocks: state.blocks.filter((b) => b.source !== 'google') });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Decide which copy wins when the app opens signed in. `local` means upload this device's data.
 * A device already linked to this account only asks when both copies changed since they last agreed.
 */
export function chooseSource(args: {
  localTouched: boolean;
  localSavedAt?: string;
  remote?: { updatedAt: string; touched: boolean };
  userId?: string;
  link?: SyncLink;
  localHash?: string;
}): SyncChoice {
  const { localTouched, remote, userId, link, localHash } = args;
  if (!remote || !remote.touched) return 'local';
  if (!localTouched) return 'remote';
  if (!link || !userId || link.userId !== userId || !localHash) return 'ask';
  const localChanged = localHash !== link.hash;
  const remoteChanged = remote.updatedAt !== link.at;
  if (localChanged && remoteChanged) return 'ask';
  return localChanged ? 'local' : 'remote';
}
